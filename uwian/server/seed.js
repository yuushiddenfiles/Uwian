// Demo seed — fresh roster for testing.
// 1 operator (uwiandev) + 2 verified + 2 unverified + 5 random faces for the
// friend-finder cards, plus a crew, spots, sessions (open + planning + one
// closed so the past-crew picker has something to show), and a group chat.
// Shared demo password for every account (see login page insta-sign-in).
import { db } from "./src/db.js";
import { hashPw } from "./src/lib/authz.js";

if (db.prepare("SELECT id FROM users WHERE email='uwiandev@uwian.dev'").get()) {
  console.log("Seeded na — uwiandev exists.");
  process.exit(0);
}
// Note: db.js auto-seeds a few extra users (Curtney, Maya, Paolo, Sofia,
// Kenzo) on every boot. They stay as bonus random faces; this seed only
// skips emails it owns.

const PW = "BarkadaDemo!2026"; // shared demo password, clearly not test123
const addUser = (name, email, birthdate, can_drink = 1) => {
  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (existing) return existing.id;
  return db.prepare("INSERT INTO users (name,email,password_hash,birthdate,can_drink) VALUES (?,?,?,?,?)")
    .run(name, email, hashPw(PW), birthdate, can_drink).lastInsertRowid;
};
const style = (uid, { role = "user", handle, vibe, avatar_id }) =>
  db.prepare("UPDATE users SET role=?, handle=?, vibe=?, avatar_id=? WHERE id=?")
    .run(role, handle, vibe, avatar_id, uid);

// ── 1 operator ──
const dev = addUser("Uwian Dev", "uwiandev@uwian.dev", "1990-01-01");
style(dev, { role: "admin", handle: "uwidev#20000", vibe: "Uwian operator · Keeps the map honest", avatar_id: null });

// ── 2 verified members ──
const mika = addUser("Mika Torres", "mika@barkada.demo", "1999-04-12");
style(mika, { handle: "mika#20101", vibe: "Barkada organizer · Always checking who has a ride home", avatar_id: "emo-girl" });
const jolo = addUser("Jolo Ramos", "jolo@barkada.demo", "1998-11-03");
style(jolo, { handle: "jolo#20102", vibe: "Weekend inuman regular · QC South", avatar_id: "skater" });

// ── 2 unverified members ──
const tara = addUser("Tara Lim", "tara@barkada.demo", "2001-06-15", 0); // non-drinker → DD badge
style(tara, { handle: "tara#20103", vibe: "Karaoke + soju · New to the crew", avatar_id: "softie" });
const rafi = addUser("Rafi Cruz", "rafi@barkada.demo", "2000-01-27");
style(rafi, { handle: "rafi#20104", vibe: "Craft beer curious · Makati", avatar_id: "preppy" });

// ── 5 random faces for the friend-finder cards ──
const ivy = addUser("Ivy Chen", "ivy@barkada.demo", "2001-02-14");
style(ivy, { handle: "ivy#20105", vibe: "Indie gigs & midnight boba · Manila", avatar_id: "artist" });
const noah = addUser("Noah Garcia", "noah@barkada.demo", "1999-09-30");
style(noah, { handle: "noah#20106", vibe: "Rooftop nights & vinyl · Ortigas", avatar_id: "goth" });
const lena = addUser("Lena Park", "lena@barkada.demo", "2000-12-01");
style(lena, { handle: "lena#20107", vibe: "Runner · Sunrise sessions", avatar_id: "sporty" });
const kai = addUser("Kai Aquino", "kai@barkada.demo", "2002-03-22");
style(kai, { handle: "kai#20108", vibe: "Bedroom pop & late drives", avatar_id: "emo-boy" });
const sari = addUser("Sari Mendoza", "sari@barkada.demo", "2001-07-19");
style(sari, { handle: "sari#20109", vibe: "Food trips & night markets", avatar_id: "emo-girl" });

const crew = [mika, jolo, tara, rafi, ivy, noah, lena, kai, sari];

// ── verification: 2 approved, 1 pending (ops queue demo) ──
const approve = (uid, id_type, full, dob) =>
  db.prepare(`INSERT INTO verification_submissions
    (user_id,id_type,full_name_on_id,birthdate_on_id,status,reviewed_at,reviewed_by)
    VALUES (?,?,?,?,'approved',datetime('now','-2 days'),?)`).run(uid, id_type, full, dob, dev);
approve(mika, "school_id", "Mika Santos Torres", "1999-04-12");
approve(jolo, "drivers_license", "Jolo Cruz Ramos", "1998-11-03");
db.prepare(`INSERT INTO verification_submissions
  (user_id,id_type,full_name_on_id,birthdate_on_id,status,submitted_at)
  VALUES (?,'national_id','Ivy Lim Chen','2001-02-14','pending',datetime('now','-5 hours'))`).run(ivy);

// ── friendships: 1 accepted (Friends tab demo), 1 incoming request ──
db.prepare("INSERT INTO friends (user_id,friend_id,status) VALUES (?,?,'accepted')").run(mika, jolo);
db.prepare("INSERT INTO friends (user_id,friend_id,status) VALUES (?,?,'pending')").run(kai, mika);

// ── crew ──
const gid = db.prepare("INSERT INTO groups (name,created_by,vouches_required) VALUES ('Barkada Sabado',?,2)")
  .run(mika).lastInsertRowid;
db.prepare("INSERT INTO group_members (group_id,user_id,role,status) VALUES (?,?,'admin','active')").run(gid, mika);
for (const uid of [jolo, tara, rafi, ivy, noah, lena, kai, sari])
  db.prepare("INSERT INTO group_members (group_id,user_id,role,status) VALUES (?,?,'member','active')").run(gid, uid);

// ── spots ──
const spot1 = db.prepare(`INSERT INTO spots (group_id,name,lat,lng,price_range,closes_at,notes,added_by,last_confirmed_at)
  VALUES (?,?,?,?,?,?,?, ?, datetime('now','-70 days'))`) // deliberately stale → S5 badge
  .run(gid, "Aling Nena's Ilawan", 14.676, 121.0437, "$$", "02:00",
    "Maganda ang sisig pero mainit ang away sa upuan. May labasan sa likod.", mika).lastInsertRowid;
const spot2 = db.prepare(`INSERT INTO spots (group_id,name,lat,lng,price_range,closes_at,notes,added_by,last_confirmed_at)
  VALUES (?,?,?,?,?,?,?, ?, datetime('now','-2 hours'))`)
  .run(gid, "Southside Tapsilog", 14.6731, 121.0412, "$", "03:00",
    "Tapsilog + extra rice. Parking is tight after 10pm.", jolo).lastInsertRowid;

// ── sessions: 1 open (tonight), 1 planning, 1 closed (past-crew picker) ──
const openSid = db.prepare("INSERT INTO sessions (group_id,spot_id,starts_at,status,designated_driver_id) VALUES (?,?,datetime('now','+2 hours'),'open',?)")
  .run(gid, spot2, tara).lastInsertRowid;
for (const u of [mika, jolo, tara]) db.prepare("INSERT INTO rsvps (session_id,user_id,status) VALUES (?,?,'going')").run(openSid, u);
db.prepare("INSERT INTO rsvps (session_id,user_id,status) VALUES (?,?,'maybe')").run(openSid, rafi);

const planSid = db.prepare("INSERT INTO sessions (group_id,spot_id,starts_at,status) VALUES (?,?,datetime('now','+3 days'),'planning')")
  .run(gid, spot1).lastInsertRowid;
db.prepare("INSERT INTO rsvps (session_id,user_id,status) VALUES (?,?,'going')").run(planSid, mika);

const oldSid = db.prepare("INSERT INTO sessions (group_id,spot_id,starts_at,status,designated_driver_id) VALUES (?,?,datetime('now','-14 days'),'closed',?)")
  .run(gid, spot1, jolo).lastInsertRowid;
for (const u of [mika, jolo, tara, rafi])
  db.prepare("INSERT INTO rsvps (session_id,user_id,status) VALUES (?,?,'going')").run(oldSid, u);

// ── group chat with a little life in it ──
const gcid = db.prepare("INSERT INTO conversations (type,group_id,title,created_by) VALUES ('group',?,?,?)").run(gid, "Barkada Sabado Chat", mika).lastInsertRowid;
for (const u of crew) db.prepare("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(gcid, u);
db.prepare("INSERT INTO messages (conversation_id,sender_id,content,created_at) VALUES (?,?,?,datetime('now','-2 hours'))")
  .run(gcid, mika, "Game Saturday? Southside tapsilog + inuman after.");
db.prepare("INSERT INTO messages (conversation_id,sender_id,content,created_at) VALUES (?,?,?,datetime('now','-1 hour'))")
  .run(gcid, jolo, "G! Ako na bahala sa yelo.");

console.log(`Seeded. group=${gid} open=${openSid} planning=${planSid} closed=${oldSid} spots=${spot1},${spot2}`);
console.log(`Logins (pw ${PW}): uwiandev@uwian.dev, mika@, jolo@, tara@, rafi@, ivy@, noah@, lena@, kai@, sari@barkada.demo`);
