// Uwian server — friendly by design.
// Privacy rule enforced at the API layer: limit_counters rows are ONLY ever
// returned to their owner, including for admins. No endpoint exposes another
// person's count. See docs/privacy.md.
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import cookieSession from "cookie-session";
import { db } from "./db.js";
import { ageOk, hashPw, checkPw } from "./lib/authz.js";
import { splitExpense } from "../../shared/split.js";
import { computeBalances, settle, ledgerFromTransfers } from "../../shared/settle.js";

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(cookieSession({ name: "uwian", keys: [process.env.UWIAN_SECRET ?? "dev-secret-change-me"], maxAge: 30 * 864e5 }));

const me = async (req) => {
  if (!req.session.uid) return null;
  const u = await db.get(`
    SELECT u.id, u.name, u.email, u.birthdate, u.can_drink, u.avatar_id, u.avatar_url, u.role, u.tos_accepted_at,
           u.handle, u.vibe,
           vs.status AS verification_status
    FROM users u
    LEFT JOIN verification_submissions vs ON vs.user_id = u.id
    WHERE u.id = ?
  `, [req.session.uid]);
  return u ?? null;
};
const requireAuth = async (req, res, next) => {
  const u = await me(req);
  return u ? next() : res.status(401).json({ error: "Please log in first." });
};
const membership = async (groupId, uid) =>
  db.get("SELECT * FROM group_members WHERE group_id=? AND user_id=? AND status='active'", [groupId, uid]);
const requireMember = async (req, res, next) => {
  const u = await me(req); const g = Number(req.params.gid);
  const m = await membership(g, u.id);
  return m ? next() : res.status(403).json({ error: "You are not a member of this group." });
};
const requireAdmin = async (req, res, next) => {
  const u = await me(req); const g = Number(req.params.gid);
  const m = await membership(g, u.id);
  return m && m.role === "admin" ? next() : res.status(403).json({ error: "Admins only." });
};
// Site-wide Uwian operator.
const isSiteAdmin = async (uid) =>
  !!(await db.get("SELECT 1 FROM users WHERE id=? AND role='admin' LIMIT 1", [uid]));
const requireSiteAdmin = async (req, res, next) => {
  const ok = await isSiteAdmin(req.session.uid);
  return ok ? next() : res.status(403).json({ error: "Uwian staff only." });
};
const isAnyAdmin = async (uid) =>
  (await isSiteAdmin(uid)) ||
  !!(await db.get("SELECT 1 FROM group_members WHERE user_id=? AND role='admin' AND status='active' LIMIT 1", [uid]));
const notify = async (userId, kind, payload) =>
  db.run("INSERT INTO notifications (user_id,kind,payload) VALUES (?,?,?)", [userId, kind, JSON.stringify(payload)]);
const audit = async (sessionId, actorId, action, detail) =>
  db.run("INSERT INTO audit_log (session_id,actor_id,action,detail) VALUES (?,?,?,?)", [sessionId, actorId, action, JSON.stringify(detail ?? null)]);

// Profile-picture gallery. Mirrors the client allowlist in web/src/components/avatars.jsx.
const AVATAR_IDS = ["sun", "moon", "star", "bolt", "wave", "peak", "bloom", "orbit",
  "emo-boy", "emo-girl", "skater", "preppy", "goth", "sporty", "artist", "softie"];

// ---------- auth ----------
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password, birthdate } = req.body ?? {};
    if (!name || !email || !password) return res.status(400).json({ error: "Missing required fields." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (!ageOk(birthdate)) return res.status(400).json({ error: "You must be 18 or older to use this app. (Self-declared — see docs/privacy.md)" });
    if (await db.get("SELECT id FROM users WHERE email=?", [email])) return res.status(409).json({ error: "That email is already in use." });

    const slug = (name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "user");
    let num = Math.floor(1000 + Math.random() * 90000);
    let handle = `${slug}#${num}`;
    while (await db.get("SELECT 1 FROM users WHERE handle=?", [handle])) {
      num = Math.floor(1000 + Math.random() * 90000);
      handle = `${slug}#${num}`;
    }

    const r = await db.run("INSERT INTO users (name,email,password_hash,birthdate,handle) VALUES (?,?,?,?,?)",
      [name, email, hashPw(password), birthdate, handle]);
    req.session.uid = r.lastInsertRowid;
    res.json({ ok: true, handle });
  } catch (e) { console.error("signup:", e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const u = await db.get("SELECT * FROM users WHERE email=?", [req.body?.email]);
    if (!u || !checkPw(req.body.password ?? "", u.password_hash)) return res.status(401).json({ error: "Incorrect email or password." });
    req.session.uid = u.id; res.json({ ok: true });
  } catch (e) { console.error("login:", e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/logout", (req, res) => { req.session = null; res.json({ ok: true }); });

// ---------- Google sign-in ----------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "";
const googleRedirectUri = (req) =>
  GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

app.get("/api/auth/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(500).send("Google sign-in is not configured yet.");
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauth_state = state;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect("/login?google=cancelled");
    if (!code || !state || state !== req.session.oauth_state)
      return res.redirect("/login?google=invalid");
    delete req.session.oauth_state;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET)
      return res.redirect("/login?google=unconfigured");
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(req), grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return res.redirect("/login?google=token");
    const { access_token } = await tokenRes.json();
    const uiRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${access_token}` },
    });
    if (!uiRes.ok) return res.redirect("/login?google=profile");
    const profile = await uiRes.json();
    if (!profile.email || profile.email_verified !== true)
      return res.redirect("/login?google=unverified");
    const email = profile.email;
    let u = await db.get("SELECT * FROM users WHERE LOWER(email)=LOWER(?)", [email]);
    if (!u) {
      const name = profile.name || email.split("@")[0];
      const slug = (name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "user");
      let num = Math.floor(1000 + Math.random() * 90000);
      let handle = `${slug}#${num}`;
      while (await db.get("SELECT 1 FROM users WHERE handle=?", [handle])) {
        num = Math.floor(1000 + Math.random() * 90000);
        handle = `${slug}#${num}`;
      }
      const r = await db.run("INSERT INTO users (name,email,password_hash,birthdate,handle) VALUES (?,?,?,?,?)",
        [name, email, hashPw(crypto.randomBytes(32).toString("hex")), null, handle]);
      u = await db.get("SELECT * FROM users WHERE id=?", [r.lastInsertRowid]);
    }
    req.session.uid = u.id;
    res.redirect(u.birthdate ? "/groups" : "/login?need_birthdate=1");
  } catch (e) {
    console.error("google callback:", e.message);
    res.redirect("/login?google=error");
  }
});

app.post("/api/me/birthdate", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    if (u.birthdate) return res.status(409).json({ error: "Birthdate is already set." });
    if (!ageOk(req.body?.birthdate))
      return res.status(400).json({ error: "You must be 18 or older to use this app. (Self-declared — see docs/privacy.md)" });
    await db.run("UPDATE users SET birthdate=? WHERE id=?", [req.body.birthdate, u.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/me", async (req, res) => res.json({ user: await me(req) ?? null }));

app.patch("/api/me", requireAuth, async (req, res) => {
  try {
    const { can_drink, avatar_id, avatar_url, vibe } = req.body ?? {};
    if (can_drink !== undefined) {
      await db.run("UPDATE users SET can_drink=? WHERE id=?", [can_drink ? 1 : 0, req.session.uid]);
    }
    if (vibe !== undefined) {
      await db.run("UPDATE users SET vibe=? WHERE id=?", [vibe ? String(vibe).slice(0, 160) : null, req.session.uid]);
    }
    if (avatar_id !== undefined) {
      if (avatar_id !== null && !AVATAR_IDS.includes(avatar_id))
        return res.status(400).json({ error: "Unknown avatar. Pick one from the gallery." });
      await db.run("UPDATE users SET avatar_id=?, avatar_url=NULL WHERE id=?", [avatar_id, req.session.uid]);
    }
    if (avatar_url !== undefined) {
      if (avatar_url === null) {
        await db.run("UPDATE users SET avatar_url=NULL WHERE id=?", [req.session.uid]);
      } else if (typeof avatar_url === "string" && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(avatar_url)) {
        if (avatar_url.length > 270000)
          return res.status(400).json({ error: "That image is too large. Pick one under 2MB." });
        await db.run("UPDATE users SET avatar_url=?, avatar_id=NULL WHERE id=?", [avatar_url, req.session.uid]);
      } else {
        return res.status(400).json({ error: "Unsupported image. Use a PNG, JPG, or WebP." });
      }
    }
    res.json({ ok: true, user: await me(req) });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/me/verification", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const u = await db.get("SELECT id, name, email, birthdate, can_drink, avatar_id, avatar_url, created_at FROM users WHERE id=?", [uid]);
    const vouchesGiven = (await db.get("SELECT COUNT(*) c FROM vouches WHERE voucher_id=?", [uid])).c;
    const vouchesReceived = (await db.get("SELECT COUNT(*) c FROM vouches WHERE guest_user_id=?", [uid])).c;
    const totalGroups = (await db.get("SELECT COUNT(*) c FROM group_members WHERE user_id=? AND status='active'", [uid])).c;
    const strikes = (await db.get("SELECT COUNT(*) c FROM strikes WHERE user_id=?", [uid])).c;
    const verif = await db.get("SELECT status FROM verification_submissions WHERE user_id=? ORDER BY submitted_at DESC LIMIT 1", [uid]);
    const id_verified = verif?.status === "approved";
    res.json({
      user: u,
      id_verified,
      trust_tier: strikes === 0 ? "Tier 1: High Trust" : "Tier 2: Monitored",
      vouches_given: vouchesGiven,
      vouches_received: vouchesReceived,
      active_crews: totalGroups,
      strikes,
      security_badge: id_verified ? "✓ Government / School ID Verified" : "ID not yet verified"
    });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/sessions/feed", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const rows = await db.all(`
      SELECT s.id, s.group_id, s.spot_id, s.starts_at, s.status, s.uwian_deadline,
             g.name AS group_name, g.vouches_required,
             sp.name AS spot_name, sp.lat, sp.lng, sp.price_range, sp.closes_at, sp.notes AS spot_notes,
             (SELECT COUNT(*) FROM rsvps r WHERE r.session_id=s.id AND r.status='going') AS going_count,
             (SELECT COUNT(*) FROM rsvps r WHERE r.session_id=s.id AND r.status='maybe') AS maybe_count,
             (SELECT status FROM rsvps r WHERE r.session_id=s.id AND r.user_id=?) AS my_rsvp
      FROM sessions s
      JOIN groups g ON g.id = s.group_id
      JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ? AND gm.status='active'
      LEFT JOIN spots sp ON sp.id = s.spot_id
      ORDER BY CASE WHEN s.status IN ('planning','open','wrapped') THEN 0 ELSE 1 END, s.starts_at DESC
      LIMIT 30
    `, [uid, uid]);

    const isVerified = !!(await db.get("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1", [uid]));
    const allUsers = await db.all("SELECT id, name, avatar_id, avatar_url FROM users", []);
    const users = Object.fromEntries(allUsers.map(u => [u.id, u]));

    const results = await Promise.all(rows.map(async (r) => {
      const attendees = await db.all("SELECT user_id, status FROM rsvps WHERE session_id=? AND status='going' LIMIT 5", [r.id]);
      return {
        ...r,
        lat: isVerified ? r.lat : null,
        lng: isVerified ? r.lng : null,
        spot_notes: isVerified ? r.spot_notes : null,
        spot_name: isVerified ? r.spot_name : (r.spot_name ? "Verified Tambayan (Classified)" : "Tambayan TBD"),
        attendees: attendees.map(a => ({
          id: a.user_id,
          name: users[a.user_id]?.name ?? "Friend",
          avatar_id: users[a.user_id]?.avatar_id ?? null,
          avatar_url: users[a.user_id]?.avatar_url ?? null,
        })),
        security_level: "High: ID & Double Vouch Required",
        is_id_checked: true
      };
    }));
    res.json(results);
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- groups / invites / vouching ----------
app.post("/api/groups", requireAuth, async (req, res) => {
  try {
    const g = await db.run("INSERT INTO groups (name,created_by) VALUES (?,?)", [req.body.name, req.session.uid]);
    await db.run("INSERT INTO group_members (group_id,user_id,role,status) VALUES (?,?, 'admin', 'active')", [g.lastInsertRowid, req.session.uid]);
    res.json({ id: g.lastInsertRowid });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/groups", requireAuth, async (req, res) => {
  try {
    res.json(await db.all(`SELECT g.*, gm.role FROM groups g JOIN group_members gm ON gm.group_id=g.id
      WHERE gm.user_id=? AND gm.status='active'`, [req.session.uid]));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/groups/:gid/invite", requireMember, async (req, res) => {
  try {
    const code = await db.get("SELECT * FROM groups WHERE id=?", [Number(req.params.gid)]);
    res.json({ invite_url: `/join/${code.id}`, note: "Share only with people you trust. They'll need vouching before they get in." });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/groups/:gid/join", requireAuth, async (req, res) => {
  try {
    const gid = Number(req.params.gid);
    if (await membership(gid, req.session.uid)) return res.json({ status: "active" });
    const existing = await db.get("SELECT * FROM group_members WHERE group_id=? AND user_id=?", [gid, req.session.uid]);
    if (existing) return res.json({ status: existing.status });
    await db.run("INSERT INTO group_members (group_id,user_id,role,status) VALUES (?,?,'member','pending_guest')", [gid, req.session.uid]);
    res.json({ status: "pending_guest", message: "Waiting for a member to vouch for you." });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/groups/:gid/vouch/:guestUid", requireMember, async (req, res) => {
  try {
    const gid = Number(req.params.gid), guest = Number(req.params.guestUid), voucher = req.session.uid;
    const v = await db.get("SELECT can_vouch FROM group_members WHERE group_id=? AND user_id=?", [gid, voucher]);
    if (!v.can_vouch) return res.status(403).json({ error: "Your vouching privileges have been revoked in this group. (2+ strikes)" });
    if (voucher === guest) return res.status(400).json({ error: "You cannot vouch for yourself." });
    await db.run("INSERT OR IGNORE INTO vouches (group_id,guest_user_id,voucher_id) VALUES (?,?,?)", [gid, guest, voucher]);
    const need = (await db.get("SELECT vouches_required FROM groups WHERE id=?", [gid])).vouches_required;
    const have = (await db.get("SELECT COUNT(*) c FROM vouches WHERE group_id=? AND guest_user_id=?", [gid, guest])).c;
    if (have >= need) {
      await db.run("UPDATE group_members SET status='active' WHERE group_id=? AND user_id=?", [gid, guest]);
      await notify(guest, "vouch", { group_id: gid, accepted: true, message: "You've been vouched in! Welcome to the group." });
    }
    res.json({ have, need, accepted: have >= need });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/groups/:gid/remove/:uid", requireAdmin, async (req, res) => {
  try {
    const gid = Number(req.params.gid), uid = Number(req.params.uid), reason = (req.body?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "A written reason is required." });
    await db.run("UPDATE group_members SET status='removed' WHERE group_id=? AND user_id=?", [gid, uid]);
    const vouchers = await db.all("SELECT voucher_id FROM vouches WHERE group_id=? AND guest_user_id=?", [gid, uid]);
    for (const { voucher_id } of vouchers) {
      await db.run("INSERT INTO strikes (group_id,user_id,source_removed_user_id,reason) VALUES (?,?,?,?)", [gid, voucher_id, uid, reason]);
      await db.run("UPDATE group_members SET strikes=strikes+1, can_vouch=CASE WHEN strikes+1>=2 THEN 0 ELSE can_vouch END WHERE group_id=? AND user_id=?", [gid, voucher_id]);
    }
    await audit(null, req.session.uid, "member_removed", { group_id: gid, user_id: uid, reason });
    res.json({ ok: true, struck: vouchers.length });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- sessions & RSVP ----------
app.post("/api/groups/:gid/sessions", requireMember, async (req, res) => {
  try {
    const gid = Number(req.params.gid);
    const { starts_at, spot_id, designated_driver_id, invited_user_ids } = req.body;
    const uid = req.session.uid;
    const user = await me(req);

    const r = await db.run("INSERT INTO sessions (group_id,spot_id,starts_at,designated_driver_id,status) VALUES (?,?,?,?, 'planning')",
      [gid, spot_id ?? null, starts_at, designated_driver_id ?? null]);
    const sid = r.lastInsertRowid;

    await db.run(`INSERT OR REPLACE INTO rsvps (session_id, user_id, status) VALUES (?, ?, 'going')`, [sid, uid]);

    const group = await db.get("SELECT name FROM groups WHERE id=?", [gid]);
    const dateStr = new Date(starts_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    const chatTitle = `${group?.name ?? "Crew"} · ${dateStr} session`;

    let convRow = await db.get("SELECT id FROM conversations WHERE session_id=?", [sid]);
    let convId = convRow?.id;
    if (!convId) {
      const c = await db.run("INSERT INTO conversations (type,group_id,session_id,title,created_by) VALUES ('group',?,?,?,?)", [gid, sid, chatTitle, uid]);
      convId = c.lastInsertRowid;
      await db.run("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)", [convId, uid]);

      const memberIds = new Set();
      const crewMembers = await db.all("SELECT user_id FROM group_members WHERE group_id=? AND status='active'", [gid]);
      for (const m of crewMembers) memberIds.add(m.user_id);

      if (Array.isArray(invited_user_ids)) {
        for (const id of invited_user_ids) {
          const num = Number(id);
          if (num && num !== uid) {
            memberIds.add(num);
            await db.run("INSERT OR IGNORE INTO rsvps (session_id, user_id, status) VALUES (?, ?, 'maybe')", [sid, num]);
            await notify(num, "session_invite", {
              session_id: sid,
              group_name: group?.name ?? "Crew",
              inviter_name: user?.name ?? "Crew admin",
              starts_at
            });
          }
        }
      }

      for (const mid of memberIds) {
        await db.run("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)", [convId, mid]);
      }

      const rosterCount = memberIds.size;
      await db.run("INSERT INTO messages (conversation_id,sender_id,content) VALUES (?,?,?)",
        [convId, uid, `📅 Session planned for ${dateStr}! ${rosterCount > 1 ? `${rosterCount} people in roster.` : ""} Coordinate rides, pickup spots, and budget here.`]);
    }
    res.json({ id: sid });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.patch("/api/sessions/:sid", requireAuth, async (req, res) => {
  try {
    const s = await db.get("SELECT * FROM sessions WHERE id=?", [Number(req.params.sid)]);
    if (!s) return res.status(404).json({ error: "Session not found." });
    if (!(await membership(s.group_id, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    const { status, designated_driver_id, uwian_deadline, cover_url } = req.body ?? {};
    if (cover_url !== undefined) {
      const mm = await membership(s.group_id, req.session.uid);
      if (!mm || mm.role !== "admin") return res.status(403).json({ error: "Only crew admins can change the session picture." });
      if (cover_url !== null) {
        if (typeof cover_url !== "string" || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(cover_url))
          return res.status(400).json({ error: "Picture must be a PNG, JPEG, or WebP image." });
        if (cover_url.length > 270000)
          return res.status(413).json({ error: "Picture is too large." });
      }
      await db.run("UPDATE sessions SET cover_url=? WHERE id=?", [cover_url, s.id]);
    }
    if (status === "open" && uwian_deadline === undefined) {
      await db.run("UPDATE sessions SET status='open', designated_driver_id=COALESCE(?,designated_driver_id) WHERE id=?",
        [designated_driver_id ?? null, s.id]);
    } else if (status) {
      await db.run("UPDATE sessions SET status=?, uwian_deadline=COALESCE(?,uwian_deadline) WHERE id=?",
        [status, uwian_deadline ?? null, s.id]);
      if (status === "wrapped") await pairUp(s);
      if (status === "closed") await db.run("UPDATE live_locations SET active=0 WHERE session_id=?", [s.id]);
    }
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/sessions/:sid/rsvp", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const s = await db.get("SELECT * FROM sessions WHERE id=?", [sid]);
    if (!(await membership(s.group_id, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    const st = ["going", "maybe", "cant"].includes(req.body.status) ? req.body.status : "maybe";
    await db.run(`INSERT INTO rsvps (session_id,user_id,status) VALUES (?,?,?)
      ON CONFLICT(session_id,user_id) DO UPDATE SET status=excluded.status, updated_at=datetime('now')`,
      [sid, req.session.uid, st]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- expenses (live tab) ----------
async function isInSession(sid) {
  return Object.fromEntries((await db.all("SELECT user_id,status FROM rsvps WHERE session_id=?", [sid]))
    .map((r) => [String(r.user_id), r.status === "going" || r.status === "maybe"]));
}

app.post("/api/sessions/:sid/expenses", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const s = await db.get("SELECT * FROM sessions WHERE id=?", [sid]);
    const m = await membership(s.group_id, req.session.uid);
    if (!m) return res.status(403).json({ error: "Access denied." });
    if (s.status === "closed") return res.status(409).json({ error: "Tab is closed — ask an admin to reopen it." });
    const { amount_centavos, description, is_alcohol = 0, paid_by, participants } = req.body;
    if (!Number.isInteger(amount_centavos) || amount_centavos < 0) return res.status(400).json({ error: "Amount must be a non-negative integer (centavos)." });
    let ppl = participants;
    if (!ppl || ppl.length === 0) {
      const isIn = await isInSession(sid);
      const allDrinkers = await db.all("SELECT id,can_drink FROM users", []);
      const drinkers = Object.fromEntries(allDrinkers.map((u) => [String(u.id), !!u.can_drink]));
      ppl = Object.keys(isIn).filter((uid) => isIn[uid]
        && !(is_alcohol && String(s.designated_driver_id) === uid)
        && !(is_alcohol && !drinkers[uid]));
    }
    const shares = splitExpense(amount_centavos, ppl);
    const e = await db.run("INSERT INTO expenses (session_id,paid_by,amount_centavos,description,is_alcohol) VALUES (?,?,?,?,?)",
      [sid, paid_by ?? req.session.uid, amount_centavos, description, is_alcohol ? 1 : 0]);
    for (const [uid, sh] of Object.entries(shares))
      await db.run("INSERT INTO expense_participants (expense_id,user_id,share_centavos) VALUES (?,?,?)", [e.lastInsertRowid, uid, sh]);
    await audit(sid, req.session.uid, "expense_add", { amount_centavos, description, is_alcohol });
    res.json({ id: e.lastInsertRowid, shares });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.put("/api/expenses/:eid", requireAuth, async (req, res) => {
  try {
    const e = await db.get("SELECT * FROM expenses WHERE id=?", [Number(req.params.eid)]);
    const s = await db.get("SELECT * FROM sessions WHERE id=?", [e.session_id]);
    if (!(await membership(s.group_id, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    const afterClose = s.status === "closed" ? 1 : 0;
    const mm = await membership(s.group_id, req.session.uid);
    if (afterClose && !(mm && mm.role === "admin")) return res.status(403).json({ error: "Tab is closed — only admins can edit (reopen first)." });
    const { amount_centavos, participants, description } = req.body;
    const shares = splitExpense(amount_centavos, participants);
    await db.run("UPDATE expenses SET amount_centavos=?, description=?, edited_after_close=? WHERE id=?",
      [amount_centavos, description ?? e.description, afterClose, e.id]);
    await db.run("DELETE FROM expense_participants WHERE expense_id=?", [e.id]);
    for (const [uid, sh] of Object.entries(shares))
      await db.run("INSERT INTO expense_participants (expense_id,user_id,share_centavos) VALUES (?,?,?)", [e.id, uid, sh]);
    await audit(e.session_id, req.session.uid, "expense_edit", { expense_id: e.id, after_close: !!afterClose });
    res.json({ shares });
  } catch (err) { console.error(err.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- settlement ----------
async function sessionExpenses(sid) {
  const expenses = await db.all("SELECT * FROM expenses WHERE session_id=?", [sid]);
  const shares = {};
  for (const e of expenses) {
    shares[e.id] = Object.fromEntries(
      (await db.all("SELECT user_id, share_centavos FROM expense_participants WHERE expense_id=?", [e.id]))
        .map((r) => [String(r.user_id), r.share_centavos]));
  }
  return { expenses, shares };
}

app.post("/api/sessions/:sid/close-tab", requireAdmin, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const { expenses, shares } = await sessionExpenses(sid);
    const transfers = settle(computeBalances(expenses, shares));
    await db.run("UPDATE sessions SET status='closed', closed_tab_at=datetime('now') WHERE id=?", [sid]);
    await db.run("UPDATE live_locations SET active=0 WHERE session_id=?", [sid]);
    for (const t of transfers)
      await db.run("INSERT INTO settlements (session_id,from_user,to_user,amount_centavos,status) VALUES (?,?,?,?,'open')",
        [sid, t.from, t.to, t.amount_centavos]);
    await audit(sid, req.session.uid, "tab_closed", { transfers: transfers.length });
    res.json(transfers);
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/sessions/:sid/reopen", requireAdmin, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    await db.run("UPDATE settlements SET status='voided' WHERE session_id=? AND status IN ('open','paid_claimed')", [sid]);
    await db.run("UPDATE sessions SET status='open', closed_tab_at=NULL WHERE id=?", [sid]);
    await audit(sid, req.session.uid, "tab_reopened", {});
    res.json({ ok: true, note: "Confirmed payments are preserved. Everything else will be recalculated on close." });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/settlements/:id/claim-paid", requireAuth, async (req, res) => {
  try {
    const t = await db.get("SELECT * FROM settlements WHERE id=?", [Number(req.params.id)]);
    if (t.from_user !== req.session.uid) return res.status(403).json({ error: "Only the payer can claim payment." });
    await db.run("UPDATE settlements SET status='paid_claimed' WHERE id=?", [t.id]);
    await notify(t.to_user, "payment_claim", { settlement_id: t.id, message: "Someone says they've paid you. Please confirm." });
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/settlements/:id/confirm", requireAuth, async (req, res) => {
  try {
    const t = await db.get("SELECT * FROM settlements WHERE id=?", [Number(req.params.id)]);
    if (t.to_user !== req.session.uid) return res.status(403).json({ error: "Only the recipient can confirm payment." });
    await db.run("UPDATE settlements SET status='confirmed' WHERE id=?", [t.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/settlements/:id/dispute", requireAuth, async (req, res) => {
  try {
    const t = await db.get("SELECT * FROM settlements WHERE id=?", [Number(req.params.id)]);
    if (![t.from_user, t.to_user].includes(req.session.uid)) return res.status(403).json({ error: "Only the two parties can dispute this." });
    const note = (req.body?.note ?? "").trim();
    if (!note) return res.status(400).json({ error: "Please describe the issue so the admin can see it." });
    await db.run("UPDATE settlements SET status='disputed', note=? WHERE id=?", [note, t.id]);
    const sessRow = await db.get("SELECT group_id FROM sessions WHERE id=?", [t.session_id]);
    const admins = await db.all("SELECT user_id FROM group_members WHERE group_id=? AND role='admin' AND status='active'", [sessRow.group_id]);
    for (const a of admins) await notify(a.user_id, "dispute", { settlement_id: t.id, note });
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/groups/:gid/ledger", requireMember, async (req, res) => {
  try {
    const rows = await db.all(`SELECT s.from_user, s.to_user, s.amount_centavos FROM settlements s
      JOIN sessions se ON se.id=s.session_id
      WHERE se.group_id=? AND s.status IN ('open','paid_claimed','disputed')`, [Number(req.params.gid)]);
    res.json(ledgerFromTransfers(rows.map((r) => ({ from: String(r.from_user), to: String(r.to_user), amount_centavos: r.amount_centavos }))));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- uwian: check-in, buddies, escalation ----------
async function pairUp(s) {
  const going = (await db.all("SELECT user_id FROM rsvps WHERE session_id=? AND status='going'", [s.id])).map((r) => r.user_id);
  const byTag = {};
  for (const uid of going) {
    const gm = await db.get("SELECT direction_tag_id FROM group_members WHERE group_id=? AND user_id=?", [s.group_id, uid]);
    const key = gm.direction_tag_id ?? "no-direction";
    (byTag[key] ??= []).push(uid);
  }
  await db.run("DELETE FROM buddy_pairs WHERE session_id=?", [s.id]);
  for (const list of Object.values(byTag)) {
    const tmp = [...list];
    while (tmp.length) {
      const grp = tmp.length === 3 ? tmp.splice(0, 3) : tmp.splice(0, 2);
      if (grp.length === 1 && tmp.length === 0) {
        const existingPairs = await db.all("SELECT * FROM buddy_pairs WHERE session_id=?", [s.id]);
        const last = existingPairs[existingPairs.length - 1];
        if (last && !last.user_c) {
          await db.run("UPDATE buddy_pairs SET user_c=? WHERE session_id=? AND user_a=? AND user_b=?", [grp[0], s.id, last.user_a, last.user_b]);
          continue;
        }
      }
      if (grp.length >= 2) await db.run("INSERT INTO buddy_pairs (session_id,user_a,user_b,user_c) VALUES (?,?,?,?)",
        [s.id, grp[0], grp[1], grp[2] ?? null]);
      else if (grp.length === 1) await db.run("INSERT INTO buddy_pairs (session_id,user_a,user_b) VALUES (?,?,-1)",
        [s.id, grp[0]]);
    }
  }
}

app.post("/api/sessions/:sid/checkin", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const s = await db.get("SELECT * FROM sessions WHERE id=?", [sid]);
    if (!(await membership(s.group_id, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    const mode = req.body.mode ?? "other";
    await db.run(`INSERT INTO checkins (session_id,user_id,mode,home_confirmed_at) VALUES (?,?,?, datetime('now'))
      ON CONFLICT(session_id,user_id) DO UPDATE SET mode=excluded.mode, home_confirmed_at=datetime('now'), flag_stage=0`,
      [sid, req.session.uid, mode]);
    if (mode === "own_drive" && s.designated_driver_id !== req.session.uid) {
      const mates = await db.all("SELECT user_id FROM rsvps WHERE session_id=? AND status='going' AND user_id!=?", [sid, req.session.uid]);
      for (const mt of mates) await notify(mt.user_id, "ride_request", { session_id: sid, message: "Someone is driving. Can you offer a ride?" });
    }
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/buddies/:sid/:a/:b/clear-flag", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const pair = await db.get("SELECT * FROM buddy_pairs WHERE session_id=? AND user_a=? AND user_b=?", [sid, Number(req.params.a), Number(req.params.b)]);
    if (!pair) return res.status(404).json({ error: "Buddy pair not found." });
    const members = [pair.user_a, pair.user_b, pair.user_c].filter((x) => x != null && x > 0);
    if (!members.includes(req.session.uid)) return res.status(403).json({ error: "Only members of this buddy pair can clear the flag." });
    const other = members.find((x) => x !== req.session.uid);
    await db.run("UPDATE checkins SET flag_stage=0, flag_cleared_by=? WHERE session_id=? AND user_id=? AND home_confirmed_at IS NULL",
      [req.session.uid, sid, other]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// Escalation tick — called by cron and also on page load.
export async function runEscalation(now = new Date()) {
  const open = await db.all("SELECT * FROM sessions WHERE status IN ('open','wrapped') AND uwian_deadline IS NOT NULL", []);
  for (const s of open) {
    const g = await db.get("SELECT buddy_notify_min, admin_notify_min FROM groups WHERE id=?", [s.group_id]);
    const mins = (now - new Date(s.uwian_deadline)) / 60000;
    if (mins < 0) continue;
    const missing = await db.all(`SELECT r.user_id FROM rsvps r LEFT JOIN checkins c
      ON c.session_id=r.session_id AND c.user_id=r.user_id
      WHERE r.session_id=? AND r.status='going' AND c.home_confirmed_at IS NULL`, [s.id]);
    for (const { user_id } of missing) {
      const c = (await db.get("SELECT * FROM checkins WHERE session_id=? AND user_id=?", [s.id, user_id])) ?? { flag_stage: 0 };
      const stage = mins >= g.admin_notify_min ? 3 : mins >= g.buddy_notify_min ? 2 : 1;
      if (stage <= c.flag_stage) continue;
      await db.run(`INSERT INTO checkins (session_id,user_id,flag_stage) VALUES (?,?,?)
        ON CONFLICT(session_id,user_id) DO UPDATE SET flag_stage=excluded.flag_stage`, [s.id, user_id, stage]);
      if (stage === 1) await notify(user_id, "uwian_reminder", { message: "Have you made it home? Tap check-in." });
      if (stage === 2) {
        const pair = await db.get("SELECT * FROM buddy_pairs WHERE session_id=? AND (user_a=? OR user_b=? OR user_c=?)", [s.id, user_id, user_id, user_id]);
        for (const b of [pair?.user_a, pair?.user_b, pair?.user_c].filter((x) => x && x !== user_id && x > 0))
          await notify(b, "buddy_alert", { message: "Your buddy hasn't checked in yet.", user_id });
      }
      if (stage === 3) {
        const admins = await db.all("SELECT user_id FROM group_members WHERE group_id=? AND role='admin' AND status='active'", [s.group_id]);
        for (const a of admins) await notify(a.user_id, "escalation", { session_id: s.id, user_id, message: "No sign of life. Check the group page." });
      }
    }
  }
}

app.post("/api/escalation-tick", async (req, res) => { await runEscalation(); res.json({ ok: true }); });

// ---------- S3 hangganan — OWNER-ONLY reads ----------
app.put("/api/sessions/:sid/limit", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const lim = req.body.limit == null ? null : Math.max(1, Math.floor(req.body.limit));
    await db.run(`INSERT INTO limit_counters (session_id,user_id,lim) VALUES (?,?,?)
      ON CONFLICT(session_id,user_id) DO UPDATE SET lim=excluded.lim`, [sid, req.session.uid, lim]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/sessions/:sid/limit/tap", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    await db.run(`INSERT INTO limit_counters (session_id,user_id,count) VALUES (?,?,1)
      ON CONFLICT(session_id,user_id) DO UPDATE SET count=count+1`, [sid, req.session.uid]);
    const row = await db.get("SELECT lim,count FROM limit_counters WHERE session_id=? AND user_id=?", [sid, req.session.uid]);
    const level = row.lim ? (row.count >= row.lim ? "at_limit" : row.count >= Math.ceil(row.lim * 0.8) ? "approaching" : null) : null;
    if (level) await notify(req.session.uid, "nudge", { message: level === "at_limit"
      ? "You've hit your limit. Sort out your ride home?"
      : "You're getting close to your limit. Sort out your ride home?", open_checkin: true });
    res.json({ count: row.count, lim: row.lim, level });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/sessions/:sid/limit", requireAuth, async (req, res) => {
  try {
    res.json(await db.get("SELECT lim,count FROM limit_counters WHERE session_id=? AND user_id=?",
      [Number(req.params.sid), req.session.uid]) ?? { lim: null, count: 0 });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- spots / tambayan map ----------
app.get("/api/map/radar", requireAuth, async (req, res) => {
  try {
    const verified = !!(await db.get("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1", [req.session.uid]));
    if (!verified) {
      return res.status(403).json({ error: "ID verification required to view live spots and map locations.", code: "VERIFICATION_REQUIRED" });
    }
    const spots = await db.all(`SELECT sp.*, g.name AS group_name FROM spots sp
      JOIN groups g ON g.id = sp.group_id ORDER BY sp.id DESC`, []);

    const results = await Promise.all(spots.map(async (sp) => {
      const sessions = await db.all(`
        SELECT s.id, s.starts_at, s.status, s.uwian_deadline, g.name AS group_name,
               (SELECT COUNT(*) FROM rsvps r WHERE r.session_id=s.id AND r.status='going') AS going_count
        FROM sessions s JOIN groups g ON g.id = s.group_id
        WHERE s.spot_id = ? AND s.status IN ('planning','open','wrapped')
        ORDER BY s.starts_at ASC
      `, [sp.id]);
      const hasActive = sessions.some((s) => s.status === "open" || s.status === "wrapped");
      return {
        ...sp,
        stale: !sp.last_confirmed_at || (Date.now() - new Date(sp.last_confirmed_at)) > 60 * 864e5,
        sessions,
        has_active_session: hasActive,
        active_count: sessions.reduce((sum, s) => sum + s.going_count, 0),
        closing_time: sp.closes_at || "Late",
        verified_secure: true,
      };
    }));
    res.json(results);
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/groups/:gid/spots", requireMember, async (req, res) => {
  try {
    const verified = !!(await db.get("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1", [req.session.uid]));
    if (!verified) {
      return res.status(403).json({ error: "ID verification required to view crew spot locations.", code: "VERIFICATION_REQUIRED" });
    }
    const spots = await db.all("SELECT * FROM spots WHERE group_id=?", [Number(req.params.gid)]);
    res.json(spots.map((sp) => ({
      ...sp,
      stale: !sp.last_confirmed_at || (Date.now() - new Date(sp.last_confirmed_at)) > 60 * 864e5,
    })));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/groups/:gid/spots", requireMember, async (req, res) => {
  try {
    const { name, lat, lng, price_range, closes_at, notes } = req.body;
    const r = await db.run("INSERT INTO spots (group_id,name,lat,lng,price_range,closes_at,notes,added_by,last_confirmed_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))",
      [Number(req.params.gid), name, lat, lng, price_range ?? null, closes_at ?? null, notes ?? null, req.session.uid]);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/spot-suggestions", requireAuth, async (req, res) => {
  try {
    const { name, lat, lng, price_range, closes_at, notes } = req.body ?? {};
    const n = String(name ?? "").trim();
    const flat = /^-?\d+(\.\d+)?$/.test(String(lat)) && /^-?\d+(\.\d+)?$/.test(String(lng));
    if (!n || n.length > 80) return res.status(400).json({ error: "Give the spot a name (80 chars max)." });
    if (!flat) return res.status(400).json({ error: "Drop the pin on the map first." });
    const la = Number(lat), ln = Number(lng);
    if (la < -90 || la > 90 || ln < -180 || ln > 180)
      return res.status(400).json({ error: "That pin is off the planet." });
    if (await db.get("SELECT id FROM spots WHERE lat=? AND lng=?", [la, ln]))
      return res.status(409).json({ error: "There is already a spot pinned there." });
    const r = await db.run(`INSERT INTO spot_submissions (submitter_id,name,lat,lng,price_range,closes_at,notes) VALUES (?,?,?,?,?,?,?)`,
      [req.session.uid, n, la, ln, price_range ?? null, closes_at ?? null, String(notes ?? "").trim() || null]);
    res.json({ id: r.lastInsertRowid, status: "pending" });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/me/spot-suggestions", requireAuth, async (req, res) => {
  try {
    res.json(await db.all(`SELECT id,name,lat,lng,status,review_note,created_at,reviewed_at
      FROM spot_submissions WHERE submitter_id=? ORDER BY id DESC LIMIT 20`, [req.session.uid]));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/admin/spot-suggestions", requireSiteAdmin, async (req, res) => {
  try {
    const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
    res.json(await db.all(`SELECT ss.*, u.name AS submitter_name, u.email AS submitter_email
      FROM spot_submissions ss JOIN users u ON u.id=ss.submitter_id
      WHERE ss.status=? ORDER BY ss.created_at ASC LIMIT 100`, [status]));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/admin/spot-suggestions/:id/review", requireSiteAdmin, async (req, res) => {
  try {
    const { action, note } = req.body ?? {};
    if (!["approved", "rejected"].includes(action))
      return res.status(400).json({ error: "action must be 'approved' or 'rejected'." });
    const sub = await db.get("SELECT * FROM spot_submissions WHERE id=?", [Number(req.params.id)]);
    if (!sub) return res.status(404).json({ error: "Suggestion not found." });
    if (sub.status !== "pending") return res.status(409).json({ error: "Already reviewed." });
    if (action === "approved") {
      if (await db.get("SELECT id FROM spots WHERE lat=? AND lng=?", [sub.lat, sub.lng]))
        return res.status(409).json({ error: "Someone pinned a spot at that location already. Reject instead." });
      const ops = await db.get("SELECT id FROM groups ORDER BY id LIMIT 1", []);
      if (!ops) return res.status(409).json({ error: "No crew exists yet, so there is nowhere to attach the spot." });
      await db.run(`INSERT INTO spots (group_id,name,lat,lng,price_range,closes_at,notes,added_by,last_confirmed_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`,
        [ops.id, sub.name, sub.lat, sub.lng, sub.price_range, sub.closes_at, sub.notes, sub.submitter_id]);
    }
    await db.run(`UPDATE spot_submissions SET status=?, review_note=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`,
      [action, String(note ?? "").trim() || null, req.session.uid, sub.id]);
    await notify(sub.submitter_id, action === "approved" ? "verification_approved" : "verification_rejected", {
      message: action === "approved"
        ? `Your spot "${sub.name}" is live on the map. Salamat!`
        : `Your spot "${sub.name}" was not approved${note ? `: ${note}` : "."}`,
    });
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/spots/:id/confirm", requireAuth, async (req, res) => {
  try {
    const sp = await db.get("SELECT * FROM spots WHERE id=?", [Number(req.params.id)]);
    if (!(await membership(sp.group_id, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    const answer = ["yes", "no", "changed"].includes(req.body.answer) ? req.body.answer : "yes";
    await db.run("INSERT INTO spot_confirmations (spot_id,user_id,answer,new_details) VALUES (?,?,?,?)",
      [sp.id, req.session.uid, answer, req.body.new_details ?? null]);
    if (answer !== "no") await db.run("UPDATE spots SET last_confirmed_at=datetime('now'), closes_at=COALESCE(?,closes_at) WHERE id=?",
      [req.body.closes_at ?? null, sp.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- admin console ----------
app.get("/api/admin/overview", requireSiteAdmin, async (req, res) => {
  try {
    const count = async (sql) => (await db.get(sql, [])).c;
    res.json({
      users: await count("SELECT COUNT(*) c FROM users"),
      crews: await count("SELECT COUNT(*) c FROM groups"),
      sessions: await count("SELECT COUNT(*) c FROM sessions"),
      live_spots: await count("SELECT COUNT(*) c FROM spots"),
      pending_spots: await count("SELECT COUNT(*) c FROM spot_submissions WHERE status='pending'"),
      pending_verifications: await count("SELECT COUNT(*) c FROM verification_submissions WHERE status IN ('pending','under_review')"),
      open_flags: await count("SELECT COUNT(*) c FROM admin_flags WHERE status='open'"),
      pending_profiles: await count("SELECT COUNT(*) c FROM profile_change_requests WHERE status='pending'"),
      recent_users: await db.all(`SELECT id,name,email,role,created_at FROM users ORDER BY id DESC LIMIT 8`, []),
    });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- misc reads ----------
app.get("/api/sessions/:sid", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const s = await db.get("SELECT * FROM sessions WHERE id=?", [sid]);
    if (!(await membership(s.group_id, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    const { expenses, shares } = await sessionExpenses(sid);
    const allUsers = await db.all("SELECT id,name FROM users", []);
    const names = Object.fromEntries(allUsers.map((u) => [u.id, u.name]));
    const isVerified = !!(await db.get("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1", [req.session.uid]));
    const rawSpot = s.spot_id ? await db.get("SELECT * FROM spots WHERE id=?", [s.spot_id]) : null;
    const spot = rawSpot ? {
      ...rawSpot,
      lat: isVerified ? rawSpot.lat : null,
      lng: isVerified ? rawSpot.lng : null,
      notes: isVerified ? rawSpot.notes : null,
      name: isVerified ? rawSpot.name : "Verified Tambayan (Classified)",
    } : null;
    res.json({
      session: { ...s, designated_driver_name: s.designated_driver_id ? names[s.designated_driver_id] : null },
      spot,
      members: await db.all(`SELECT gm.user_id, gm.role, gm.direction_tag_id, u.name, u.avatar_id, u.avatar_url, u.can_drink,
          u.handle, dt.label AS tag FROM group_members gm JOIN users u ON u.id=gm.user_id
          LEFT JOIN direction_tags dt ON dt.id=gm.direction_tag_id
          WHERE gm.group_id=? AND gm.status='active'`, [s.group_id]),
      rsvps: await db.all("SELECT r.*, u.name, u.avatar_id, u.avatar_url, u.handle FROM rsvps r JOIN users u ON u.id=r.user_id WHERE r.session_id=?", [sid]),
      expenses: expenses.map((e) => ({ ...e, payer_name: names[e.paid_by] })), shares,
      settlements: (await db.all("SELECT * FROM settlements WHERE session_id=? AND status!='voided'", [sid]))
        .map((t) => ({ ...t, from_name: names[t.from_user], to_name: names[t.to_user] })),
      checkins: await db.all("SELECT c.session_id,c.user_id,u.name,u.avatar_id,u.avatar_url,c.mode,c.home_confirmed_at,c.flag_stage,c.ride_offer_from FROM checkins c JOIN users u ON u.id=c.user_id WHERE c.session_id=?", [sid]),
      buddy_pairs: (await db.all("SELECT * FROM buddy_pairs WHERE session_id=?", [sid]))
        .map((p) => ({ ...p, names: [p.user_a, p.user_b, p.user_c].filter((x) => x > 0).map((x) => names[x]) })),
    });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/me/notifications", requireAuth, async (req, res) => {
  try {
    res.json(await db.all("SELECT * FROM notifications WHERE user_id=? AND read_at IS NULL ORDER BY id DESC", [req.session.uid]));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    await db.run("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND user_id=?", [Number(req.params.id), req.session.uid]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- group detail & settings ----------
app.get("/api/groups/:gid", requireMember, async (req, res) => {
  try {
    const gid = Number(req.params.gid);
    const g = await db.get("SELECT * FROM groups WHERE id=?", [gid]);
    res.json({
      group: g,
      tags: await db.all("SELECT * FROM direction_tags WHERE group_id=?", [gid]),
      members: await db.all(`SELECT gm.user_id, gm.role, gm.status, gm.direction_tag_id, gm.can_vouch, gm.strikes,
          dt.label AS tag, u.name, u.email, u.avatar_id, u.avatar_url, u.can_drink, u.handle, u.vibe
        FROM group_members gm JOIN users u ON u.id=gm.user_id
        LEFT JOIN direction_tags dt ON dt.id=gm.direction_tag_id
        WHERE gm.group_id=? AND gm.status IN ('active','pending_guest')`, [gid]),
      pending: await db.all(`SELECT gm.user_id, u.name, u.avatar_id, u.avatar_url, u.handle,
          (SELECT COUNT(*) FROM vouches v WHERE v.group_id=gm.group_id AND v.guest_user_id=gm.user_id) AS vouches
        FROM group_members gm JOIN users u ON u.id=gm.user_id
        WHERE gm.group_id=? AND gm.status='pending_guest'`, [gid]),
      sessions: await db.all("SELECT * FROM sessions WHERE group_id=? ORDER BY starts_at DESC LIMIT 20", [gid]),
    });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.patch("/api/groups/:gid/settings", requireAdmin, async (req, res) => {
  try {
    const gid = Number(req.params.gid);
    const { vouches_required, buddy_notify_min, admin_notify_min } = req.body ?? {};
    await db.run(`UPDATE groups SET
        vouches_required=COALESCE(?,vouches_required),
        buddy_notify_min=COALESCE(?,buddy_notify_min),
        admin_notify_min=COALESCE(?,admin_notify_min) WHERE id=?`,
      [[1, 2].includes(vouches_required) ? vouches_required : null,
        Number.isInteger(buddy_notify_min) && buddy_notify_min > 0 ? buddy_notify_min : null,
        Number.isInteger(admin_notify_min) && admin_notify_min > 0 ? admin_notify_min : null, gid]);
    await audit(null, req.session.uid, "group_settings", { group_id: gid, ...req.body });
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/groups/:gid/tags", requireAdmin, async (req, res) => {
  try {
    const label = (req.body?.label ?? "").trim();
    if (!label) return res.status(400).json({ error: "Direction tag name is required." });
    const r = await db.run("INSERT INTO direction_tags (group_id,label) VALUES (?,?)", [Number(req.params.gid), label]);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.put("/api/me/direction", requireAuth, async (req, res) => {
  try {
    const gid = Number(req.body?.group_id), tagId = req.body?.direction_tag_id ?? null;
    if (!(await membership(gid, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    await db.run("UPDATE group_members SET direction_tag_id=? WHERE group_id=? AND user_id=?", [tagId, gid, req.session.uid]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/buddies/:sid/:a/:b/offer-ride", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const s = await db.get("SELECT * FROM sessions WHERE id=?", [sid]);
    if (!(await membership(s.group_id, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    const uid = Number(req.params.a);
    await db.run("UPDATE checkins SET ride_offer_from=? WHERE session_id=? AND user_id=?", [req.session.uid, sid, uid]);
    await notify(uid, "ride_offer", { message: "Someone offered you a ride.", session_id: sid });
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- messaging ----------
const convMember = async (cid, uid) =>
  db.get("SELECT * FROM conversation_members WHERE conversation_id=? AND user_id=?", [cid, uid]);

app.get("/api/conversations", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const convs = await db.all(`
      SELECT c.*, cm.last_read_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL
          AND m.created_at > COALESCE(cm.last_read_at,'1970-01-01')) AS unread_count,
        (SELECT m2.content FROM messages m2 WHERE m2.conversation_id=c.id AND m2.deleted_at IS NULL
          ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
        (SELECT m2.created_at FROM messages m2 WHERE m2.conversation_id=c.id AND m2.deleted_at IS NULL
          ORDER BY m2.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT u2.name FROM messages m2 JOIN users u2 ON u2.id=m2.sender_id
          WHERE m2.conversation_id=c.id AND m2.deleted_at IS NULL ORDER BY m2.created_at DESC LIMIT 1) AS last_sender_name
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=?
      ORDER BY COALESCE(last_message_at, c.created_at) DESC
    `, [uid]);

    const result = await Promise.all(convs.map(async (c) => {
      const members = await db.all("SELECT cm.user_id, u.name, u.avatar_id, u.avatar_url FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=?", [c.id]);
      const other = c.type === "dm" ? members.find(m => m.user_id !== uid) : null;
      return {
        ...c,
        display_name: c.type === "dm" ? (other?.name ?? "Unknown") : (c.title ?? "Group Chat"),
        members,
        other_user: other,
      };
    }));
    res.json(result);
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/conversations/dm", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const { target_user_id } = req.body ?? {};
    if (!target_user_id || target_user_id === uid) return res.status(400).json({ error: "Invalid target user." });
    const target = await db.get("SELECT id,name FROM users WHERE id=?", [Number(target_user_id)]);
    if (!target) return res.status(404).json({ error: "User not found." });

    const existing = await db.get(`
      SELECT c.id FROM conversations c
      JOIN conversation_members cm1 ON cm1.conversation_id=c.id AND cm1.user_id=?
      JOIN conversation_members cm2 ON cm2.conversation_id=c.id AND cm2.user_id=?
      WHERE c.type='dm'
    `, [uid, Number(target_user_id)]);
    if (existing) return res.json({ id: existing.id, existing: true });

    const c = await db.run("INSERT INTO conversations (type,created_by) VALUES ('dm',?)", [uid]);
    await db.run("INSERT INTO conversation_members (conversation_id,user_id) VALUES (?,?)", [c.lastInsertRowid, uid]);
    await db.run("INSERT INTO conversation_members (conversation_id,user_id) VALUES (?,?)", [c.lastInsertRowid, Number(target_user_id)]);
    res.json({ id: c.lastInsertRowid, existing: false });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/conversations/group", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const { group_id, title } = req.body ?? {};
    if (!group_id) return res.status(400).json({ error: "group_id required." });
    if (!(await membership(Number(group_id), uid))) return res.status(403).json({ error: "Not a member of this crew." });

    const existing = await db.get("SELECT id FROM conversations WHERE type='group' AND group_id=?", [Number(group_id)]);
    if (existing) return res.json({ id: existing.id, existing: true });

    const members = await db.all("SELECT user_id FROM group_members WHERE group_id=? AND status='active'", [Number(group_id)]);
    const c = await db.run("INSERT INTO conversations (type,group_id,title,created_by) VALUES ('group',?,?,?)", [Number(group_id), title ?? null, uid]);
    for (const m of members)
      await db.run("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)", [c.lastInsertRowid, m.user_id]);
    res.json({ id: c.lastInsertRowid, existing: false });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/conversations/:cid/messages", requireAuth, async (req, res) => {
  try {
    const cid = Number(req.params.cid), uid = req.session.uid;
    if (!(await convMember(cid, uid))) return res.status(403).json({ error: "Not a member of this conversation." });
    const before = req.query.before;
    const msgs = await db.all(`
      SELECT m.*, u.name AS sender_name, u.avatar_id AS sender_avatar, u.avatar_url AS sender_avatar_url
      FROM messages m JOIN users u ON u.id=m.sender_id
      WHERE m.conversation_id=? AND m.deleted_at IS NULL
        ${before ? "AND m.id < ?" : ""}
      ORDER BY m.created_at DESC LIMIT 40
    `, before ? [cid, Number(before)] : [cid]);
    await db.run("UPDATE conversation_members SET last_read_at=datetime('now') WHERE conversation_id=? AND user_id=?", [cid, uid]);
    res.json(msgs.reverse());
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/conversations/:cid/messages", requireAuth, async (req, res) => {
  try {
    const cid = Number(req.params.cid), uid = req.session.uid;
    if (!(await convMember(cid, uid))) return res.status(403).json({ error: "Not a member of this conversation." });
    const kind = req.body?.kind === "location" ? "location" : "text";

    if (kind === "location") {
      const verified = !!(await db.get("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1", [uid]));
      if (!verified) return res.status(403).json({ error: "ID verification required to share your location.", code: "VERIFICATION_REQUIRED" });
      const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return res.status(400).json({ error: "Valid lat/lng coordinates required." });
      const r = await db.run("INSERT INTO messages (conversation_id,sender_id,content,kind,lat,lng) VALUES (?,?,?,?,?,?)",
        [cid, uid, "📍 Location shared", "location", lat, lng]);
      const conv = await db.get("SELECT session_id FROM conversations WHERE id=?", [cid]);
      if (conv?.session_id) {
        await db.run(`
          INSERT INTO live_locations (session_id,user_id,lat,lng,accuracy,active,updated_at)
          VALUES (?,?,?,?,?,1,datetime('now'))
          ON CONFLICT(session_id,user_id) DO UPDATE SET
            lat=excluded.lat, lng=excluded.lng, accuracy=excluded.accuracy,
            active=1, updated_at=datetime('now')
        `, [conv.session_id, uid, lat, lng, req.body?.accuracy ?? null]);
      }
      const others = await db.all("SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?", [cid, uid]);
      const sender = await db.get("SELECT name FROM users WHERE id=?", [uid]);
      for (const o of others)
        await notify(o.user_id, "message", { conversation_id: cid, message: `${sender.name}: shared their location` });
      return res.json({ id: r.lastInsertRowid });
    }

    const content = (req.body?.content ?? "").trim();
    if (!content || content.length > 2000) return res.status(400).json({ error: "Message content required (max 2000 chars)." });
    const r = await db.run("INSERT INTO messages (conversation_id,sender_id,content) VALUES (?,?,?)", [cid, uid, content]);
    const others = await db.all("SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?", [cid, uid]);
    const meUser = await db.get("SELECT name FROM users WHERE id=?", [uid]);
    for (const o of others)
      await notify(o.user_id, "message", { conversation_id: cid, message: `${meUser.name}: ${content.slice(0, 80)}` });
    res.json({ id: r.lastInsertRowid });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.delete("/api/messages/:mid", requireAuth, async (req, res) => {
  try {
    const mid = Number(req.params.mid), uid = req.session.uid;
    const msg = await db.get("SELECT * FROM messages WHERE id=?", [mid]);
    if (!msg || msg.sender_id !== uid) return res.status(403).json({ error: "You can only delete your own messages." });
    await db.run("UPDATE messages SET deleted_at=datetime('now') WHERE id=?", [mid]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/sessions/:sid/chat", requireAuth, async (req, res) => {
  try {
    const sid = Number(req.params.sid);
    const s = await db.get("SELECT * FROM sessions WHERE id=?", [sid]);
    if (!s) return res.status(404).json({ error: "Session not found." });
    if (!(await membership(s.group_id, req.session.uid))) return res.status(403).json({ error: "Access denied." });
    const conv = await db.get("SELECT * FROM conversations WHERE session_id=?", [sid]);
    if (conv) return res.json({ id: conv.id, existing: true });
    const uid = req.session.uid;
    const group = await db.get("SELECT name FROM groups WHERE id=?", [s.group_id]);
    const chatTitle = `${group?.name ?? "Crew"} · ${new Date(s.starts_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} session`;
    const members = await db.all("SELECT user_id FROM group_members WHERE group_id=? AND status='active'", [s.group_id]);
    const c = await db.run("INSERT INTO conversations (type,group_id,session_id,title,created_by) VALUES ('group',?,?,?,?)",
      [s.group_id, sid, chatTitle, uid]);
    const cid = c.lastInsertRowid;
    for (const m of members)
      await db.run("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)", [cid, m.user_id]);
    await db.run("INSERT INTO messages (conversation_id,sender_id,content) VALUES (?,?,?)",
      [cid, uid, `📅 Session chat created! Use this group to coordinate before, during, and after the hangout.`]);
    res.json({ id: cid, existing: false });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- live GPS during sessions ----------
const requireVerifiedMember = async (req, res, next) => {
  const u = await me(req);
  if (!u) return res.status(401).json({ error: "Please log in first." });
  const verified = !!(await db.get("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1", [u.id]));
  if (!verified) return res.status(403).json({ error: "ID verification required for live location sharing.", code: "VERIFICATION_REQUIRED" });
  const sid = Number(req.params.sid);
  const s = await db.get("SELECT * FROM sessions WHERE id=?", [sid]);
  if (!s) return res.status(404).json({ error: "Session not found." });
  if (!(await membership(s.group_id, u.id))) return res.status(403).json({ error: "You are not in this session's crew." });
  req.session_row = s;
  next();
};

app.put("/api/sessions/:sid/location", requireVerifiedMember, async (req, res) => {
  try {
    const uid = req.session.uid, sid = Number(req.params.sid);
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    const accuracy = req.body?.accuracy != null ? Number(req.body.accuracy) : null;
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
      return res.status(400).json({ error: "Valid lat/lng required." });
    await db.run(`
      INSERT INTO live_locations (session_id,user_id,lat,lng,accuracy,active,updated_at)
      VALUES (?,?,?,?,?,1,datetime('now'))
      ON CONFLICT(session_id,user_id) DO UPDATE SET
        lat=excluded.lat, lng=excluded.lng, accuracy=excluded.accuracy,
        active=1, updated_at=datetime('now')
    `, [sid, uid, lat, lng, accuracy]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.delete("/api/sessions/:sid/location", requireVerifiedMember, async (req, res) => {
  try {
    await db.run("UPDATE live_locations SET active=0, updated_at=datetime('now') WHERE session_id=? AND user_id=?",
      [Number(req.params.sid), req.session.uid]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/sessions/:sid/locations", requireVerifiedMember, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT ll.user_id, ll.lat, ll.lng, ll.accuracy, ll.updated_at, u.name, u.avatar_id, u.avatar_url
      FROM live_locations ll JOIN users u ON u.id = ll.user_id
      WHERE ll.session_id = ? AND ll.active = 1 AND ll.updated_at >= datetime('now', '-5 minutes')
      ORDER BY ll.updated_at DESC
    `, [Number(req.params.sid)]);
    res.json(rows);
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/conversations/unread-count", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const row = await db.get(`
      SELECT COALESCE(SUM(
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=cm.conversation_id AND m.deleted_at IS NULL
          AND m.created_at > COALESCE(cm.last_read_at,'1970-01-01'))
      ), 0) AS total
      FROM conversation_members cm WHERE cm.user_id=?
    `, [uid]);
    res.json({ unread: row.total });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- friends & discovery ----------
app.get("/api/friends", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const friends = await db.all(`
      SELECT f.id AS friendship_id, f.status, f.created_at,
             u.id, u.name, u.email, u.handle, u.avatar_id, u.avatar_url, u.can_drink, u.vibe,
             (SELECT COUNT(*) FROM group_members gm1
              JOIN group_members gm2 ON gm1.group_id = gm2.group_id
              WHERE gm1.user_id = ? AND gm2.user_id = u.id AND gm1.status='active' AND gm2.status='active') AS mutual_crews,
             (SELECT vs.status FROM verification_submissions vs WHERE vs.user_id = u.id) AS verification_status
      FROM friends f
      JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END) = u.id
      WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
      ORDER BY u.name ASC
    `, [uid, uid, uid, uid]);

    const incoming = await db.all(`
      SELECT f.id AS request_id, f.created_at,
             u.id, u.name, u.email, u.handle, u.avatar_id, u.avatar_url, u.can_drink, u.vibe,
             (SELECT vs.status FROM verification_submissions vs WHERE vs.user_id = u.id) AS verification_status
      FROM friends f JOIN users u ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `, [uid]);

    const outgoing = await db.all(`
      SELECT f.id AS request_id, f.created_at,
             u.id, u.name, u.email, u.handle, u.avatar_id, u.avatar_url, u.can_drink, u.vibe
      FROM friends f JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `, [uid]);

    res.json({ friends, incoming, outgoing });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/users/past-crew", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const rows = await db.all(`
      SELECT u.id, u.name, u.handle, u.avatar_id, u.avatar_url, u.can_drink,
             s.id AS session_id, s.starts_at, sp.name AS spot_name
      FROM sessions s
      JOIN rsvps r1 ON r1.session_id = s.id AND r1.user_id = ? AND r1.status = 'going'
      JOIN rsvps r2 ON r2.session_id = s.id AND r2.user_id != ? AND r2.status = 'going'
      JOIN users u ON u.id = r2.user_id
      LEFT JOIN spots sp ON sp.id = s.spot_id
      WHERE s.status = 'closed'
      ORDER BY s.starts_at DESC
    `, [uid, uid]);
    const seen = new Set();
    res.json(rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/users/discover", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const users = await db.all(`
      SELECT u.id, u.name, u.handle, u.avatar_id, u.avatar_url, u.can_drink, u.vibe,
             (SELECT f.status FROM friends f WHERE (f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?)) AS friend_status,
             (SELECT f.user_id FROM friends f WHERE (f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?)) AS requester_id,
             (SELECT COUNT(*) FROM group_members gm1
              JOIN group_members gm2 ON gm1.group_id = gm2.group_id
              WHERE gm1.user_id = ? AND gm2.user_id = u.id AND gm1.status='active' AND gm2.status='active') AS mutual_crews,
             (SELECT vs.status FROM verification_submissions vs WHERE vs.user_id = u.id) AS verification_status
      FROM users u
      WHERE u.id != ?
        AND (
          (SELECT f.status FROM friends f WHERE ((f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?))) != 'accepted'
          OR (SELECT f.status FROM friends f WHERE ((f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?))) IS NULL
        )
      ORDER BY RANDOM()
      LIMIT 20
    `, [uid, uid, uid, uid, uid, uid, uid, uid, uid, uid]);
    res.json({ users });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/friends/request", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const { handle, target_user_id } = req.body ?? {};
    let target = null;
    if (handle) {
      const raw = String(handle).trim();
      const match = raw.match(/^[\w.-]{2,24}#(\d{1,5})$/i);
      if (!match) return res.status(400).json({ error: "Invalid ID format. Use name#12345 (up to 5 numbers only)." });
      target = await db.get("SELECT id, name, handle FROM users WHERE LOWER(handle) = LOWER(?)", [raw]);
    } else if (target_user_id) {
      target = await db.get("SELECT id, name, handle FROM users WHERE id = ?", [Number(target_user_id)]);
    }

    if (!target) return res.status(404).json({ error: "User not found. Check the ID tag and try again." });
    if (target.id === uid) return res.status(400).json({ error: "You cannot add yourself as a friend." });

    const existing = await db.get(`
      SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `, [uid, target.id, target.id, uid]);

    if (existing) {
      if (existing.status === "accepted") return res.status(400).json({ error: `You and ${target.name} are already friends!` });
      if (existing.status === "pending") {
        if (existing.user_id === target.id) {
          await db.run("UPDATE friends SET status='accepted', updated_at=datetime('now') WHERE id=?", [existing.id]);
          return res.json({ ok: true, status: "accepted", message: `You are now friends with ${target.name}!` });
        }
        return res.status(400).json({ error: "Friend request already sent." });
      }
      await db.run("UPDATE friends SET user_id=?, friend_id=?, status='pending', updated_at=datetime('now') WHERE id=?",
        [uid, target.id, existing.id]);
    } else {
      await db.run("INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')", [uid, target.id]);
    }

    const sender = await me(req);
    await notify(target.id, "friend_request", {
      from_id: uid,
      from_name: sender?.name ?? "Someone",
      handle: sender?.handle
    });
    res.json({ ok: true, status: "pending", message: `Friend request sent to ${target.name} (${target.handle})!` });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/friends/:id/accept", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const reqId = Number(req.params.id);
    const row = await db.get("SELECT * FROM friends WHERE id = ?", [reqId]);
    if (!row || row.friend_id !== uid) return res.status(403).json({ error: "Request not found or unauthorized." });
    await db.run("UPDATE friends SET status='accepted', updated_at=datetime('now') WHERE id=?", [reqId]);
    const sender = await db.get("SELECT name FROM users WHERE id=?", [row.user_id]);
    const meUser = await me(req);
    await notify(row.user_id, "friend_accepted", { from_id: uid, from_name: meUser?.name ?? "Someone" });
    res.json({ ok: true, message: `Connected with ${sender?.name ?? "friend"}!` });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/friends/:id/reject", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const reqId = Number(req.params.id);
    const row = await db.get("SELECT * FROM friends WHERE id = ?", [reqId]);
    if (!row || (row.friend_id !== uid && row.user_id !== uid)) return res.status(403).json({ error: "Unauthorized." });
    await db.run("UPDATE friends SET status='rejected', updated_at=datetime('now') WHERE id=?", [reqId]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.delete("/api/friends/:id", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const reqId = Number(req.params.id);
    const row = await db.get("SELECT * FROM friends WHERE id = ?", [reqId]);
    if (!row || (row.friend_id !== uid && row.user_id !== uid)) return res.status(403).json({ error: "Unauthorized." });
    await db.run("DELETE FROM friends WHERE id=?", [reqId]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

const TOS_VERSION = "2026-10-13";

app.post("/api/me/accept-tos", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const row = await db.get("SELECT tos_accepted_at FROM users WHERE id=?", [uid]);
    await db.run("UPDATE users SET tos_accepted_at=datetime('now') WHERE id=?", [uid]);
    res.json({ ok: true, accepted_at: row?.tos_accepted_at ?? null, version: TOS_VERSION });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/me/tos", requireAuth, async (req, res) => {
  try {
    const row = await db.get("SELECT tos_accepted_at FROM users WHERE id=?", [req.session.uid]);
    res.json({ accepted: !!row?.tos_accepted_at, accepted_at: row?.tos_accepted_at ?? null, version: TOS_VERSION });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- verification moderation ----------
app.post("/api/me/submit-verification", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const tosRow = await db.get("SELECT tos_accepted_at FROM users WHERE id=?", [uid]);
    if (!tosRow?.tos_accepted_at) return res.status(403).json({ error: "Please accept the Terms of Service first." });
    const { id_type, id_number, full_name_on_id, birthdate_on_id, id_photo } = req.body ?? {};
    if (!full_name_on_id || !birthdate_on_id) return res.status(400).json({ error: "Full name and birthdate on ID are required." });
    if (!id_photo) return res.status(400).json({ error: "A photo of your ID is required." });
    if (!String(id_photo).startsWith("data:image/")) return res.status(400).json({ error: "Invalid photo format." });
    if (id_photo.length > 11_000_000) return res.status(400).json({ error: "Photo is too large. Please use a smaller image." });
    const validTypes = ["school_id", "drivers_license", "passport", "national_id", "umid", "sss", "philhealth"];
    const type = validTypes.includes(id_type) ? id_type : "school_id";
    await db.run(`INSERT INTO verification_submissions (user_id,id_type,id_number,full_name_on_id,birthdate_on_id,id_photo,status,submitted_at)
      VALUES (?,?,?,?,?,?,'pending',datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        id_type=excluded.id_type, id_number=excluded.id_number,
        full_name_on_id=excluded.full_name_on_id, birthdate_on_id=excluded.birthdate_on_id,
        id_photo=excluded.id_photo,
        status='pending', submitted_at=datetime('now'), reviewed_at=NULL, rejection_note=NULL`,
      [uid, type, id_number ?? null, full_name_on_id, birthdate_on_id, id_photo]);
    res.json({ ok: true, message: "Verification submitted. An admin will review within 24 hours." });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/me/verification-status", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const sub = await db.get("SELECT id_type, status, submitted_at, reviewed_at, rejection_note FROM verification_submissions WHERE user_id=?", [uid]);
    const tosRow = await db.get("SELECT tos_accepted_at FROM users WHERE id=?", [uid]);
    const tos = tosRow?.tos_accepted_at ?? null;
    res.json({ submission: sub ?? null, tos_accepted: !!tos, tos_accepted_at: tos, tos_version: TOS_VERSION });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/admin/verifications", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    if (!(await isAnyAdmin(uid))) return res.status(403).json({ error: "Admins only." });
    const rows = await db.all(`
      SELECT vs.user_id, vs.id_type, vs.id_number, vs.full_name_on_id, vs.birthdate_on_id,
             vs.id_photo, vs.status, vs.submitted_at, vs.reviewed_at, vs.rejection_note,
             u.name, u.email, u.created_at AS user_created_at
      FROM verification_submissions vs JOIN users u ON u.id=vs.user_id
      WHERE vs.status IN ('pending','under_review')
      ORDER BY vs.submitted_at ASC LIMIT 50
    `, []);
    res.json(rows);
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/admin/verifications/:uid/approve", requireAuth, async (req, res) => {
  try {
    const adminUid = req.session.uid;
    if (!(await isAnyAdmin(adminUid))) return res.status(403).json({ error: "Admins only." });
    const targetUid = Number(req.params.uid);
    await db.run("UPDATE verification_submissions SET status='approved', reviewed_at=datetime('now'), reviewed_by=? WHERE user_id=?", [adminUid, targetUid]);
    await notify(targetUid, "verification_approved", { message: "Your ID verification has been approved! You now have full trust status." });
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/admin/verifications/:uid/reject", requireAuth, async (req, res) => {
  try {
    const adminUid = req.session.uid;
    if (!(await isAnyAdmin(adminUid))) return res.status(403).json({ error: "Admins only." });
    const targetUid = Number(req.params.uid), note = (req.body?.note ?? "").trim();
    if (!note) return res.status(400).json({ error: "Rejection note is required." });
    await db.run("UPDATE verification_submissions SET status='rejected', reviewed_at=datetime('now'), reviewed_by=?, rejection_note=? WHERE user_id=?", [adminUid, note, targetUid]);
    await notify(targetUid, "verification_rejected", { message: `ID verification not approved: ${note}` });
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/users/:uid/flag", requireAuth, async (req, res) => {
  try {
    const reporterUid = req.session.uid;
    const flaggedUid = Number(req.params.uid);
    if (flaggedUid === reporterUid) return res.status(400).json({ error: "You cannot flag yourself." });
    const { reason, category, group_id } = req.body ?? {};
    if (!reason || reason.trim().length < 10) return res.status(400).json({ error: "Reason must be at least 10 characters." });
    const validCats = ["misconduct", "fake_id", "harassment", "spam", "other"];
    const cat = validCats.includes(category) ? category : "other";
    await db.run("INSERT INTO admin_flags (reporter_id,flagged_uid,group_id,reason,category) VALUES (?,?,?,?,?)",
      [reporterUid, flaggedUid, group_id ?? null, reason.trim(), cat]);
    if (group_id) {
      const admins = await db.all("SELECT user_id FROM group_members WHERE group_id=? AND role='admin' AND status='active'", [Number(group_id)]);
      for (const a of admins) await notify(a.user_id, "flag_report", { flagged_uid: flaggedUid, message: `A user has been reported in your crew.` });
    }
    res.json({ ok: true, message: "Report submitted. Crew admins and the Uwian team have been notified." });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/admin/flags", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    if (!(await isAnyAdmin(uid))) return res.status(403).json({ error: "Admins only." });
    const rows = await db.all(`
      SELECT af.*, u1.name AS reporter_name, u2.name AS flagged_name, u2.email AS flagged_email
      FROM admin_flags af
      JOIN users u1 ON u1.id=af.reporter_id
      JOIN users u2 ON u2.id=af.flagged_uid
      WHERE af.status='open'
      ORDER BY af.created_at DESC LIMIT 50
    `, []);
    res.json(rows);
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/admin/flags/:id/review", requireAuth, async (req, res) => {
  try {
    const adminUid = req.session.uid;
    if (!(await isAnyAdmin(adminUid))) return res.status(403).json({ error: "Admins only." });
    const { action, note } = req.body ?? {};
    if (!["reviewed", "dismissed"].includes(action)) return res.status(400).json({ error: "action must be 'reviewed' or 'dismissed'." });
    await db.run("UPDATE admin_flags SET status=?, admin_note=?, reviewed_at=datetime('now') WHERE id=?",
      [action, note ?? null, Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

// ---------- profile change requests ----------
app.post("/api/me/profile-request", requireAuth, async (req, res) => {
  try {
    const uid = req.session.uid;
    const { field, value } = req.body ?? {};
    if (!["name", "email"].includes(field)) return res.status(400).json({ error: "field must be 'name' or 'email'." });
    const v = String(value ?? "").trim();
    if (field === "name") {
      if (v.length < 1 || v.length > 60) return res.status(400).json({ error: "Name must be 1–60 characters." });
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return res.status(400).json({ error: "Enter a valid email address." });
      if (await db.get("SELECT id FROM users WHERE email=? AND id!=?", [v, uid]))
        return res.status(409).json({ error: "That email is already in use." });
    }
    const current = await db.get("SELECT name, email FROM users WHERE id=?", [uid]);
    if (current[field] === v) return res.status(400).json({ error: "That's already your current value." });
    const dup = await db.get("SELECT id FROM profile_change_requests WHERE user_id=? AND field=? AND status='pending'", [uid, field]);
    if (dup) return res.status(409).json({ error: "You already have a pending request for this. Wait for review first." });
    const r = await db.run(`INSERT INTO profile_change_requests (user_id,field,old_value,new_value) VALUES (?,?,?,?)`,
      [uid, field, current[field], v]);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/me/profile-requests", requireAuth, async (req, res) => {
  try {
    res.json(await db.all(`SELECT pr.*, u.name AS user_name FROM profile_change_requests pr
      JOIN users u ON u.id=pr.user_id WHERE pr.user_id=? ORDER BY pr.id DESC LIMIT 20`, [req.session.uid]));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.get("/api/admin/profile-requests", requireAuth, async (req, res) => {
  try {
    if (!(await isAnyAdmin(req.session.uid))) return res.status(403).json({ error: "Admins only." });
    res.json(await db.all(`SELECT pr.*, u.name AS user_name, u.email AS user_email FROM profile_change_requests pr
      JOIN users u ON u.id=pr.user_id WHERE pr.status='pending' ORDER BY pr.submitted_at ASC LIMIT 50`, []));
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

app.post("/api/admin/profile-requests/:id/review", requireAuth, async (req, res) => {
  try {
    const adminUid = req.session.uid;
    if (!(await isAnyAdmin(adminUid))) return res.status(403).json({ error: "Admins only." });
    const { action, note } = req.body ?? {};
    if (!["approved", "rejected"].includes(action)) return res.status(400).json({ error: "action must be 'approved' or 'rejected'." });
    const pr = await db.get("SELECT * FROM profile_change_requests WHERE id=?", [Number(req.params.id)]);
    if (!pr) return res.status(404).json({ error: "Request not found." });
    if (pr.status !== "pending") return res.status(409).json({ error: "Already reviewed." });
    if (action === "approved") {
      if (pr.field === "email" && await db.get("SELECT id FROM users WHERE email=? AND id!=?", [pr.new_value, pr.user_id]))
        return res.status(409).json({ error: "That email was taken while waiting. Reject instead." });
      await db.run(`UPDATE users SET ${pr.field === "name" ? "name" : "email"}=? WHERE id=?`, [pr.new_value, pr.user_id]);
      await db.run("UPDATE profile_change_requests SET status='approved', reviewed_at=datetime('now'), reviewed_by=?, review_note=? WHERE id=?",
        [adminUid, note ?? null, pr.id]);
      await notify(pr.user_id, "verification_approved", { message: `Your ${pr.field} change to "${pr.new_value}" was approved.` });
    } else {
      if (!(note ?? "").trim()) return res.status(400).json({ error: "A rejection note is required." });
      await db.run("UPDATE profile_change_requests SET status='rejected', reviewed_at=datetime('now'), reviewed_by=?, review_note=? WHERE id=?",
        [adminUid, note.trim(), pr.id]);
      await notify(pr.user_id, "verification_rejected", { message: `Your ${pr.field} change was not approved: ${note.trim()}` });
    }
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Server error." }); }
});

const PORT = process.env.PORT ?? 3000;
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === pathToFileURL(process.argv[1]).href)) {
  // serve the React client (vite build output) with an SPA fallback.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.join(here, "../../web/dist");
  app.use(express.static(dist));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) =>
    res.sendFile(path.join(dist, "index.html")));
  setInterval(() => { try { runEscalation(); } catch {} }, 60_000).unref();
  app.listen(PORT, () => console.log(`Uwian server: http://localhost:${PORT}`));
}

export default app;
