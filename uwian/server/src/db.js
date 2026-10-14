// db.js — Unified database adapter.
// Production  (TURSO_URL set)  → @libsql/client (Turso cloud SQLite, async)
// Development (no TURSO_URL)   → better-sqlite3  (local file, sync)
//
// The exported `db` object presents a synchronous-LOOKING API in both cases
// by using a thin Promise-based batch runner. All callers MUST await the result.
// Pattern:
//   const user = await db.get("SELECT * FROM users WHERE id=?", [id]);
//   const rows = await db.all("SELECT * FROM users");
//   const info = await db.run("INSERT INTO users ...", [...]);
//   await db.exec("CREATE TABLE ...");
//   const result = await db.transaction(async (tx) => { ... });

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Turso production path ────────────────────────────────────────────────────
if (process.env.TURSO_URL) {
  const { createClient } = await import("@libsql/client");
  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Run schema + all migrations once at cold-start
  await initSchema(client);

  export const db = makeTursoAdapter(client);

} else {
  // ── Local better-sqlite3 path ──────────────────────────────────────────────
  const BetterSqlite = (await import("better-sqlite3")).default;
  const rawDb = new BetterSqlite(
    process.env.UWIAN_DB ?? path.join(__dirname, "..", "uwian.sqlite")
  );
  rawDb.exec("CREATE TABLE IF NOT EXISTS _schema_done (x INTEGER)");
  if (!rawDb.prepare("SELECT _rowid_ FROM _schema_done LIMIT 1").get()) {
    const sql = fs
      .readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8")
      .replace(/^CREATE TABLE /gm, "CREATE TABLE IF NOT EXISTS ")
      .replace(/^CREATE INDEX /gm, "CREATE INDEX IF NOT EXISTS ");
    rawDb.exec(sql);
    rawDb.prepare("INSERT INTO _schema_done VALUES (1)").run();
  }

  await runMigrations_sqlite(rawDb);
  await seedData_sqlite(rawDb);

  export const db = makeSqliteAdapter(rawDb);
}

// ── Schema initializer for Turso ────────────────────────────────────────────
async function initSchema(client) {
  // _schema_done table
  await client.execute("CREATE TABLE IF NOT EXISTS _schema_done (x INTEGER)");
  const done = await client.execute("SELECT x FROM _schema_done LIMIT 1");
  if (done.rows.length === 0) {
    const sql = fs
      .readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8")
      // strip PRAGMA (not supported in Turso)
      .replace(/^PRAGMA.*$/gm, "")
      // already have IF NOT EXISTS handling below, but be safe
      .replace(/^CREATE TABLE /gm, "CREATE TABLE IF NOT EXISTS ")
      .replace(/^CREATE INDEX /gm, "CREATE INDEX IF NOT EXISTS ");

    // Execute each statement separately (Turso doesn't support multi-statement batch via execute)
    const stmts = sql.split(";").map((s) => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      try { await client.execute(stmt + ";"); } catch (e) { if (!e.message?.includes("already exists")) throw e; }
    }
    await client.execute("INSERT INTO _schema_done VALUES (1)");
  }

  await runMigrations_turso(client);
  await seedData_turso(client);
}

// ── Migrations ───────────────────────────────────────────────────────────────
async function runMigrations_turso(client) {
  await client.execute("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, ran_at TEXT NOT NULL DEFAULT (datetime('now')))");

  async function migrate(id, sql) {
    const row = await client.execute({ sql: "SELECT id FROM _migrations WHERE id=?", args: [id] });
    if (row.rows.length) return;
    const stmts = sql.split(";").map((s) => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      try { await client.execute(stmt + ";"); } catch (e) { if (!e.message?.includes("already exists")) throw e; }
    }
    await client.execute({ sql: "INSERT INTO _migrations (id) VALUES (?)", args: [id] });
  }

  async function addColumnIfMissing(table, col, def) {
    const r = await client.execute({ sql: `SELECT name FROM pragma_table_info('${table}') WHERE name='${col}'`, args: [] });
    if (!r.rows.length) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }

  await migrate("m001_messaging", `
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('dm','group')),
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      title TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_read_at TEXT,
      PRIMARY KEY (conversation_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      edited_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conv_members ON conversation_members(user_id)
  `);

  await migrate("m002_verification", `
    CREATE TABLE IF NOT EXISTS verification_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      id_type TEXT NOT NULL DEFAULT 'school_id',
      id_number TEXT,
      full_name_on_id TEXT NOT NULL,
      birthdate_on_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','under_review')),
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      rejection_note TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL REFERENCES users(id),
      flagged_uid INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER REFERENCES groups(id),
      reason TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'misconduct' CHECK (category IN ('misconduct','fake_id','harassment','spam','other')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_flags_flagged ON admin_flags(flagged_uid, status);
    CREATE INDEX IF NOT EXISTS idx_verif_status ON verification_submissions(status)
  `);

  await addColumnIfMissing("users", "avatar_id", "TEXT");
  await addColumnIfMissing("users", "avatar_url", "TEXT");

  await migrate("m003_profile_requests", `
    CREATE TABLE IF NOT EXISTS profile_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      field TEXT NOT NULL CHECK (field IN ('name','email')),
      old_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      review_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_profile_req_status ON profile_change_requests(status);
    CREATE INDEX IF NOT EXISTS idx_profile_req_user ON profile_change_requests(user_id, status)
  `);

  await addColumnIfMissing("users", "role", "TEXT NOT NULL DEFAULT 'user'");

  await migrate("m004_spot_suggestions", `
    CREATE TABLE IF NOT EXISTS spot_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitter_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL,
      price_range TEXT,
      closes_at TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      review_note TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_spot_sub_status ON spot_submissions(status, created_at)
  `);

  await addColumnIfMissing("users", "tos_accepted_at", "TEXT");
  await addColumnIfMissing("verification_submissions", "id_photo", "TEXT");
  await addColumnIfMissing("messages", "kind", "TEXT NOT NULL DEFAULT 'text'");
  await addColumnIfMissing("messages", "lat", "REAL");
  await addColumnIfMissing("messages", "lng", "REAL");
  await addColumnIfMissing("conversations", "session_id", "INTEGER REFERENCES sessions(id) ON DELETE SET NULL");

  await migrate("m009_live_locations", `
    CREATE TABLE IF NOT EXISTS live_locations (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_live_loc_session ON live_locations(session_id, active, updated_at)
  `);

  await addColumnIfMissing("users", "handle", "TEXT");
  await addColumnIfMissing("users", "vibe", "TEXT");

  try {
    await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle)");
  } catch (e) { /* ignore */ }

  await migrate("m010_friends", `
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, friend_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id, status)
  `);

  await addColumnIfMissing("sessions", "cover_url", "TEXT");
}

async function runMigrations_sqlite(rawDb) {
  rawDb.exec("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, ran_at TEXT NOT NULL DEFAULT (datetime('now')))");

  function migrate(id, sql) {
    if (rawDb.prepare("SELECT id FROM _migrations WHERE id=?").get(id)) return;
    rawDb.exec(sql);
    rawDb.prepare("INSERT INTO _migrations (id) VALUES (?)").run(id);
  }

  migrate("m001_messaging", `
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK (type IN ('dm','group')),
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE, title TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id), joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_read_at TEXT, PRIMARY KEY (conversation_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), edited_at TEXT, deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conv_members ON conversation_members(user_id);
  `);

  migrate("m002_verification", `
    CREATE TABLE IF NOT EXISTS verification_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      id_type TEXT NOT NULL DEFAULT 'school_id', id_number TEXT, full_name_on_id TEXT NOT NULL,
      birthdate_on_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected','under_review')),
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT,
      reviewed_by INTEGER REFERENCES users(id), rejection_note TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL REFERENCES users(id),
      flagged_uid INTEGER NOT NULL REFERENCES users(id), group_id INTEGER REFERENCES groups(id),
      reason TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'misconduct'
        CHECK (category IN ('misconduct','fake_id','harassment','spam','other')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
      admin_note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_flags_flagged ON admin_flags(flagged_uid, status);
    CREATE INDEX IF NOT EXISTS idx_verif_status ON verification_submissions(status);
  `);

  if (!rawDb.prepare("SELECT name FROM pragma_table_info('users') WHERE name='avatar_id'").get())
    rawDb.exec("ALTER TABLE users ADD COLUMN avatar_id TEXT");
  if (!rawDb.prepare("SELECT name FROM pragma_table_info('users') WHERE name='avatar_url'").get())
    rawDb.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");

  migrate("m003_profile_requests", `
    CREATE TABLE IF NOT EXISTS profile_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      field TEXT NOT NULL CHECK (field IN ('name','email')), old_value TEXT NOT NULL, new_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT,
      reviewed_by INTEGER REFERENCES users(id), review_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_profile_req_status ON profile_change_requests(status);
    CREATE INDEX IF NOT EXISTS idx_profile_req_user ON profile_change_requests(user_id, status);
  `);

  if (!rawDb.prepare("SELECT name FROM pragma_table_info('users') WHERE name='role'").get())
    rawDb.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");

  migrate("m004_spot_suggestions", `
    CREATE TABLE IF NOT EXISTS spot_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, submitter_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, price_range TEXT, closes_at TEXT, notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      review_note TEXT, reviewed_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_spot_sub_status ON spot_submissions(status, created_at);
  `);

  if (!rawDb.prepare("SELECT name FROM pragma_table_info('users') WHERE name='tos_accepted_at'").get())
    rawDb.exec("ALTER TABLE users ADD COLUMN tos_accepted_at TEXT");
  if (!rawDb.prepare("SELECT name FROM pragma_table_info('verification_submissions') WHERE name='id_photo'").get())
    rawDb.exec("ALTER TABLE verification_submissions ADD COLUMN id_photo TEXT");
  if (!rawDb.prepare("SELECT name FROM pragma_table_info('messages') WHERE name='kind'").get())
    rawDb.exec("ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'");
  if (!rawDb.prepare("SELECT name FROM pragma_table_info('messages') WHERE name='lat'").get())
    rawDb.exec("ALTER TABLE messages ADD COLUMN lat REAL");
  if (!rawDb.prepare("SELECT name FROM pragma_table_info('messages') WHERE name='lng'").get())
    rawDb.exec("ALTER TABLE messages ADD COLUMN lng REAL");
  if (!rawDb.prepare("SELECT name FROM pragma_table_info('conversations') WHERE name='session_id'").get())
    rawDb.exec("ALTER TABLE conversations ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL");

  migrate("m009_live_locations", `
    CREATE TABLE IF NOT EXISTS live_locations (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL, active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (session_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_live_loc_session ON live_locations(session_id, active, updated_at);
  `);

  if (!rawDb.prepare("SELECT name FROM pragma_table_info('users') WHERE name='handle'").get())
    rawDb.exec("ALTER TABLE users ADD COLUMN handle TEXT");
  if (!rawDb.prepare("SELECT name FROM pragma_table_info('users') WHERE name='vibe'").get())
    rawDb.exec("ALTER TABLE users ADD COLUMN vibe TEXT");
  rawDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle)");

  migrate("m010_friends", `
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, friend_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id, status);
  `);

  if (!rawDb.prepare("SELECT name FROM pragma_table_info('sessions') WHERE name='cover_url'").get())
    rawDb.exec("ALTER TABLE sessions ADD COLUMN cover_url TEXT");
}

// ── Seed data (runs in both environments) ────────────────────────────────────
async function seedData_turso(client) {
  const knownHandles = {
    "admin@uwian.dev": { handle: "uwiandev#9999", vibe: "Uwian Platform Ops · Safe routes & fair tabs" },
    "curtney@uwian.dev": { handle: "yuu#12345", vibe: "Night walks & acoustic sets · Quezon City" },
    "albertjhonragasa399@gmail.com": { handle: "ajragasa#54321", vibe: "Tech explorer & weekend hangouts · Makati" },
    "ajragasa@barkada.demo": { handle: "ajragasa#10294", vibe: "Always down for food trips & Poblacion nights" },
    "ana@barkada.demo": { handle: "anareyes#28419", vibe: "Barkada organizer · Always checking who has a ride home" },
    "ben@barkada.demo": { handle: "bencruz#48102", vibe: "Designated Driver champion 🚗 · Manila" },
    "carl@barkada.demo": { handle: "carldomingo#22910", vibe: "Craft cocktails & late diner conversations" },
    "dina@barkada.demo": { handle: "dinaflores#39182", vibe: "Music festivals, indie gigs & rooftop sunset sessions" },
    "ramon@barkada.demo": { handle: "ramonsy#58190", vibe: "Foodie & budget spreadsheet wizard 📊" },
    "ela@barkada.demo": { handle: "elavillanueva#61092", vibe: "Karaoke queen 🎤 · BGC & Pasig" },
  };

  for (const [email, meta] of Object.entries(knownHandles)) {
    await client.execute({ sql: "UPDATE users SET handle=COALESCE(handle, ?), vibe=COALESCE(vibe, ?) WHERE email=?", args: [meta.handle, meta.vibe, email] });
  }

  const extraUsers = [
    { name: "Curtney Trinidad", email: "curtney@uwian.dev", handle: "yuu#12345", avatar_id: "star", vibe: "Night walks & acoustic sets · Quezon City", can_drink: 1 },
    { name: "Maya Santos", email: "maya@barkada.demo", handle: "mayasantos#20481", avatar_id: "orbit", vibe: "Designated Driver & chill playlist curator · BGC", can_drink: 0 },
    { name: "Paolo Reyes", email: "paolo@barkada.demo", handle: "paoloreyes#39182", avatar_id: "bolt", vibe: "Late-night tapsilog & craft beers · Makati", can_drink: 1 },
    { name: "Sofia Chen", email: "sofia@barkada.demo", handle: "sofiachen#77123", avatar_id: "bloom", vibe: "Karaoke champion & midnight boba runs · Manila", can_drink: 1 },
    { name: "Kenzo Tan", email: "kenzo@barkada.demo", handle: "kenzotan#11094", avatar_id: "peak", vibe: "Rooftop lounge & vinyl jazz lover · Ortigas", can_drink: 1 },
  ];

  for (const u of extraUsers) {
    const existing = await client.execute({ sql: "SELECT id FROM users WHERE email=? OR handle=?", args: [u.email, u.handle] });
    if (!existing.rows.length) {
      await client.execute({
        sql: `INSERT INTO users (name, email, password_hash, birthdate, can_drink, avatar_id, handle, vibe)
              VALUES (?, ?, '$2a$10$wT8f6sI09bN7fM2B9Xq9.evb4H6K983y/cWJz7L94Qe4m0zN7JgKi', '2001-05-20', ?, ?, ?, ?)`,
        args: [u.name, u.email, u.can_drink, u.avatar_id, u.handle, u.vibe],
      });
    }
  }
}

async function seedData_sqlite(rawDb) {
  const knownHandles = {
    "admin@uwian.dev": { handle: "uwiandev#9999", vibe: "Uwian Platform Ops · Safe routes & fair tabs" },
    "curtney@uwian.dev": { handle: "yuu#12345", vibe: "Night walks & acoustic sets · Quezon City" },
    "albertjhonragasa399@gmail.com": { handle: "ajragasa#54321", vibe: "Tech explorer & weekend hangouts · Makati" },
    "ajragasa@barkada.demo": { handle: "ajragasa#10294", vibe: "Always down for food trips & Poblacion nights" },
    "ana@barkada.demo": { handle: "anareyes#28419", vibe: "Barkada organizer · Always checking who has a ride home" },
    "ben@barkada.demo": { handle: "bencruz#48102", vibe: "Designated Driver champion 🚗 · Manila" },
    "carl@barkada.demo": { handle: "carldomingo#22910", vibe: "Craft cocktails & late diner conversations" },
    "dina@barkada.demo": { handle: "dinaflores#39182", vibe: "Music festivals, indie gigs & rooftop sunset sessions" },
    "ramon@barkada.demo": { handle: "ramonsy#58190", vibe: "Foodie & budget spreadsheet wizard 📊" },
    "ela@barkada.demo": { handle: "elavillanueva#61092", vibe: "Karaoke queen 🎤 · BGC & Pasig" },
  };

  for (const [email, meta] of Object.entries(knownHandles)) {
    rawDb.prepare("UPDATE users SET handle=COALESCE(handle, ?), vibe=COALESCE(vibe, ?) WHERE email=?").run(meta.handle, meta.vibe, email);
  }

  const extraUsers = [
    { name: "Curtney Trinidad", email: "curtney@uwian.dev", handle: "yuu#12345", avatar_id: "star", vibe: "Night walks & acoustic sets · Quezon City", can_drink: 1 },
    { name: "Maya Santos", email: "maya@barkada.demo", handle: "mayasantos#20481", avatar_id: "orbit", vibe: "Designated Driver & chill playlist curator · BGC", can_drink: 0 },
    { name: "Paolo Reyes", email: "paolo@barkada.demo", handle: "paoloreyes#39182", avatar_id: "bolt", vibe: "Late-night tapsilog & craft beers · Makati", can_drink: 1 },
    { name: "Sofia Chen", email: "sofia@barkada.demo", handle: "sofiachen#77123", avatar_id: "bloom", vibe: "Karaoke champion & midnight boba runs · Manila", can_drink: 1 },
    { name: "Kenzo Tan", email: "kenzo@barkada.demo", handle: "kenzotan#11094", avatar_id: "peak", vibe: "Rooftop lounge & vinyl jazz lover · Ortigas", can_drink: 1 },
  ];

  for (const u of extraUsers) {
    const existing = rawDb.prepare("SELECT id FROM users WHERE email=? OR handle=?").get(u.email, u.handle);
    if (!existing) {
      rawDb.prepare(`INSERT INTO users (name, email, password_hash, birthdate, can_drink, avatar_id, handle, vibe)
        VALUES (?, ?, '$2a$10$wT8f6sI09bN7fM2B9Xq9.evb4H6K983y/cWJz7L94Qe4m0zN7JgKi', '2001-05-20', ?, ?, ?, ?)`
      ).run(u.name, u.email, u.can_drink, u.avatar_id, u.handle, u.vibe);
    }
  }

  // Auto-fill any remaining users without handles
  const missing = rawDb.prepare("SELECT id, name, email FROM users WHERE handle IS NULL").all();
  for (const u of missing) {
    const slug = (u.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "user");
    let num = Math.floor(1000 + Math.random() * 90000);
    let h = `${slug}#${num}`;
    while (rawDb.prepare("SELECT 1 FROM users WHERE handle=?").get(h)) {
      num = Math.floor(1000 + Math.random() * 90000);
      h = `${slug}#${num}`;
    }
    rawDb.prepare("UPDATE users SET handle=? WHERE id=?").run(h, u.id);
  }
}

// ── Turso adapter ─────────────────────────────────────────────────────────────
// Provides: db.get(sql, args?), db.all(sql, args?), db.run(sql, args?), db.exec(sql)
// db.transaction(fn) — fn receives the adapter and should be an async function
function makeTursoAdapter(client) {
  return {
    async get(sql, args = []) {
      const r = await client.execute({ sql, args });
      if (!r.rows.length) return null;
      return rowToObj(r.columns, r.rows[0]);
    },
    async all(sql, args = []) {
      const r = await client.execute({ sql, args });
      return r.rows.map((row) => rowToObj(r.columns, row));
    },
    async run(sql, args = []) {
      const r = await client.execute({ sql, args });
      return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), changes: r.rowsAffected ?? 0 };
    },
    async exec(sql) {
      const stmts = sql.split(";").map((s) => s.trim()).filter(Boolean);
      for (const stmt of stmts) {
        try { await client.execute(stmt + ";"); } catch (e) { if (!e.message?.includes("already exists")) throw e; }
      }
    },
    async transaction(fn) {
      // Turso supports interactive transactions; for simplicity we use batch
      // For the presentation, this is close enough — true ACID not needed for a demo
      return await fn(this);
    },
  };
}

// ── SQLite adapter ────────────────────────────────────────────────────────────
// Wraps better-sqlite3 in Promises so callers can use the same await pattern
function makeSqliteAdapter(rawDb) {
  return {
    async get(sql, args = []) {
      return rawDb.prepare(sql).get(...args) ?? null;
    },
    async all(sql, args = []) {
      return rawDb.prepare(sql).all(...args);
    },
    async run(sql, args = []) {
      const r = rawDb.prepare(sql).run(...args);
      return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
    },
    async exec(sql) {
      rawDb.exec(sql);
    },
    async transaction(fn) {
      let result;
      rawDb.transaction(() => { result = fn(this); })();
      // fn might be async — resolve it
      return await result;
    },
    // Expose raw for local-only helpers (escalation cron)
    _raw: rawDb,
  };
}

function rowToObj(columns, row) {
  const obj = {};
  for (let i = 0; i < columns.length; i++) obj[columns[i]] = row[i];
  return obj;
}
