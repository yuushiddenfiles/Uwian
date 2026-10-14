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

const me = (req) => {
  if (!req.session.uid) return null;
  const u = db.prepare(`
    SELECT u.id, u.name, u.email, u.birthdate, u.can_drink, u.avatar_id, u.avatar_url, u.role, u.tos_accepted_at,
           u.handle, u.vibe,
           vs.status AS verification_status
    FROM users u
    LEFT JOIN verification_submissions vs ON vs.user_id = u.id
    WHERE u.id = ?
  `).get(req.session.uid);
  return u ?? null;
};
const requireAuth = (req, res, next) => (me(req) ? next() : res.status(401).json({ error: "Please log in first." }));
const membership = (groupId, uid) =>
  db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=? AND status='active'").get(groupId, uid);
const requireMember = (req, res, next) => {
  const u = me(req); const g = Number(req.params.gid);
  return membership(g, u.id) ? next() : res.status(403).json({ error: "You are not a member of this group." });
};
const requireAdmin = (req, res, next) => {
  const u = me(req); const g = Number(req.params.gid);
  const m = membership(g, u.id);
  return m && m.role === "admin" ? next() : res.status(403).json({ error: "Admins only." });
};
// Site-wide Uwian operator. Distinct from crew admins (group_members.role),
// who only ever govern their own crew. Operators run the whole instance.
const isSiteAdmin = (uid) =>
  !!db.prepare("SELECT 1 FROM users WHERE id=? AND role='admin' LIMIT 1").get(uid);
const requireSiteAdmin = (req, res, next) =>
  isSiteAdmin(req.session.uid) ? next() : res.status(403).json({ error: "Uwian staff only." });
// Crew admins AND site operators can moderate. Operators need no crew membership.
const isAnyAdmin = (uid) =>
  isSiteAdmin(uid) ||
  !!db.prepare("SELECT 1 FROM group_members WHERE user_id=? AND role='admin' AND status='active' LIMIT 1").get(uid);
const notify = (userId, kind, payload) =>
  db.prepare("INSERT INTO notifications (user_id,kind,payload) VALUES (?,?,?)").run(userId, kind, JSON.stringify(payload));
const audit = (sessionId, actorId, action, detail) =>
  db.prepare("INSERT INTO audit_log (session_id,actor_id,action,detail) VALUES (?,?,?,?)").run(sessionId, actorId, action, JSON.stringify(detail ?? null));
// Profile-picture gallery. Mirrors the client allowlist in web/src/components/avatars.jsx.
const AVATAR_IDS = ["sun", "moon", "star", "bolt", "wave", "peak", "bloom", "orbit",
  "emo-boy", "emo-girl", "skater", "preppy", "goth", "sporty", "artist", "softie"];

// ---------- auth ----------
app.post("/api/signup", (req, res) => {
  const { name, email, password, birthdate } = req.body ?? {};
  if (!name || !email || !password) return res.status(400).json({ error: "Missing required fields." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!ageOk(birthdate)) return res.status(400).json({ error: "You must be 18 or older to use this app. (Self-declared — see docs/privacy.md)" });
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) return res.status(409).json({ error: "That email is already in use." });

  // Generate unique handle: slug#12345 (max 5 digit numbers)
  const slug = (name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "user");
  let num = Math.floor(1000 + Math.random() * 90000);
  let handle = `${slug}#${num}`;
  while (db.prepare("SELECT 1 FROM users WHERE handle=?").get(handle)) {
    num = Math.floor(1000 + Math.random() * 90000);
    handle = `${slug}#${num}`;
  }

  const r = db.prepare("INSERT INTO users (name,email,password_hash,birthdate,handle) VALUES (?,?,?,?,?)")
    .run(name, email, hashPw(password), birthdate, handle);
  req.session.uid = r.lastInsertRowid;
  res.json({ ok: true, handle });
});
app.post("/api/login", (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(req.body?.email);
  if (!u || !checkPw(req.body.password ?? "", u.password_hash)) return res.status(401).json({ error: "Incorrect email or password." });
  req.session.uid = u.id; res.json({ ok: true });
});
app.post("/api/logout", (req, res) => { req.session = null; res.json({ ok: true }); });

// ---------- Google sign-in ----------
// Owner one-time setup in Google Cloud Console: OAuth client (Web app),
// redirect URI http://localhost:3000/api/auth/google/callback (plus the
// production URL later), scopes openid + email + profile. Secrets come from
// env only — never from the repo. No new npm deps: code exchange and
// userinfo are plain fetch calls.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
// Absolute override for deployments behind a TLS-terminating proxy, where
// req.protocol would otherwise say http. Must match a URI authorized above.
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
    // Code → tokens, server to server. The secret never touches the browser.
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
    // Who-am-I over the fresh access token (no JWT verification needed).
    const uiRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${access_token}` },
    });
    if (!uiRes.ok) return res.redirect("/login?google=profile");
    const profile = await uiRes.json();
    if (!profile.email || profile.email_verified !== true)
      return res.redirect("/login?google=unverified");
    const email = profile.email;
    let u = db.prepare("SELECT * FROM users WHERE LOWER(email)=LOWER(?)").get(email);
    if (!u) {
      // New account. No password exists (random unusable hash, so password
      // login can never work) and no birthdate yet — Google shares neither.
      const name = profile.name || email.split("@")[0];
      const slug = (name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "user");
      let num = Math.floor(1000 + Math.random() * 90000);
      let handle = `${slug}#${num}`;
      while (db.prepare("SELECT 1 FROM users WHERE handle=?").get(handle)) {
        num = Math.floor(1000 + Math.random() * 90000);
        handle = `${slug}#${num}`;
      }
      const r = db.prepare("INSERT INTO users (name,email,password_hash,birthdate,handle) VALUES (?,?,?,?,?)")
        .run(name, email, hashPw(crypto.randomBytes(32).toString("hex")), null, handle);
      u = db.prepare("SELECT * FROM users WHERE id=?").get(r.lastInsertRowid);
    }
    req.session.uid = u.id;
    // Google users skip the signup form, so the 18+ self-declaration happens
    // here instead — once, before they can do anything else.
    res.redirect(u.birthdate ? "/groups" : "/login?need_birthdate=1");
  } catch (e) {
    console.error("google callback:", e.message);
    res.redirect("/login?google=error");
  }
});

// One-time 18+ self-declaration for accounts created via Google (which have
// no birthdate). Refuses to overwrite an existing one.
app.post("/api/me/birthdate", requireAuth, (req, res) => {
  const u = me(req);
  if (u.birthdate) return res.status(409).json({ error: "Birthdate is already set." });
  if (!ageOk(req.body?.birthdate))
    return res.status(400).json({ error: "You must be 18 or older to use this app. (Self-declared — see docs/privacy.md)" });
  db.prepare("UPDATE users SET birthdate=? WHERE id=?").run(req.body.birthdate, u.id);
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => res.json({ user: me(req) ?? null }));
app.patch("/api/me", requireAuth, (req, res) => {
  const { can_drink, avatar_id, avatar_url, vibe } = req.body ?? {};
  if (can_drink !== undefined) {
    db.prepare("UPDATE users SET can_drink=? WHERE id=?").run(can_drink ? 1 : 0, req.session.uid);
  }
  if (vibe !== undefined) {
    db.prepare("UPDATE users SET vibe=? WHERE id=?").run(vibe ? String(vibe).slice(0, 160) : null, req.session.uid);
  }
  if (avatar_id !== undefined) {
    if (avatar_id !== null && !AVATAR_IDS.includes(avatar_id))
      return res.status(400).json({ error: "Unknown avatar. Pick one from the gallery." });
    // Picking a gallery mark clears any custom upload so the two never fight.
    db.prepare("UPDATE users SET avatar_id=?, avatar_url=NULL WHERE id=?").run(avatar_id, req.session.uid);
  }
  if (avatar_url !== undefined) {
    if (avatar_url === null) {
      db.prepare("UPDATE users SET avatar_url=NULL WHERE id=?").run(req.session.uid);
    } else if (typeof avatar_url === "string" && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(avatar_url)) {
      // ~200KB of base64 is plenty for the downscaled 256px image the client sends.
      if (avatar_url.length > 270000)
        return res.status(400).json({ error: "That image is too large. Pick one under 2MB." });
      db.prepare("UPDATE users SET avatar_url=?, avatar_id=NULL WHERE id=?").run(avatar_url, req.session.uid);
    } else {
      return res.status(400).json({ error: "Unsupported image. Use a PNG, JPG, or WebP." });
    }
  }
  res.json({ ok: true, user: me(req) });
});
app.get("/api/me/verification", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const u = db.prepare("SELECT id, name, email, birthdate, can_drink, avatar_id, avatar_url, created_at FROM users WHERE id=?").get(uid);
  const vouchesGiven = db.prepare("SELECT COUNT(*) c FROM vouches WHERE voucher_id=?").get(uid).c;
  const vouchesReceived = db.prepare("SELECT COUNT(*) c FROM vouches WHERE guest_user_id=?").get(uid).c;
  const totalGroups = db.prepare("SELECT COUNT(*) c FROM group_members WHERE user_id=? AND status='active'").get(uid).c;
  const strikes = db.prepare("SELECT COUNT(*) c FROM strikes WHERE user_id=?").get(uid).c;
  const verif = db.prepare("SELECT status FROM verification_submissions WHERE user_id=? ORDER BY submitted_at DESC LIMIT 1").get(uid);
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
});
app.get("/api/sessions/feed", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const rows = db.prepare(`
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
  `).all(uid, uid);

  const isVerified = !!db
    .prepare("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1")
    .get(uid);

  const users = Object.fromEntries(db.prepare("SELECT id, name, avatar_id, avatar_url FROM users").all().map(u => [u.id, u]));
  const results = rows.map(r => {
    const attendees = db.prepare("SELECT user_id, status FROM rsvps WHERE session_id=? AND status='going' LIMIT 5").all(r.id);
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
  });
  res.json(results);
});

// ---------- groups / invites / vouching ----------
app.post("/api/groups", requireAuth, (req, res) => {
  const g = db.prepare("INSERT INTO groups (name,created_by) VALUES (?,?)").run(req.body.name, req.session.uid);
  db.prepare("INSERT INTO group_members (group_id,user_id,role,status) VALUES (?,?, 'admin', 'active')").run(g.lastInsertRowid, req.session.uid);
  res.json({ id: g.lastInsertRowid });
});
app.get("/api/groups", requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT g.*, gm.role FROM groups g JOIN group_members gm ON gm.group_id=g.id
    WHERE gm.user_id=? AND gm.status='active'`).all(req.session.uid));
});
// Invite link: creates a pending guest row when the invited user opens it.
app.post("/api/groups/:gid/invite", requireMember, (req, res) => {
  const code = db.prepare("SELECT * FROM groups WHERE id=?").get(Number(req.params.gid));
  res.json({ invite_url: `/join/${code.id}`, note: "Share only with people you trust. They'll need vouching before they get in." });
});
app.post("/api/groups/:gid/join", requireAuth, (req, res) => {
  const gid = Number(req.params.gid);
  if (membership(gid, req.session.uid)) return res.json({ status: "active" });
  const existing = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(gid, req.session.uid);
  if (existing) return res.json({ status: existing.status });
  db.prepare("INSERT INTO group_members (group_id,user_id,role,status) VALUES (?,?,'member','pending_guest')").run(gid, req.session.uid);
  res.json({ status: "pending_guest", message: "Waiting for a member to vouch for you." });
});
app.post("/api/groups/:gid/vouch/:guestUid", requireMember, (req, res) => {
  const gid = Number(req.params.gid), guest = Number(req.params.guestUid), voucher = req.session.uid;
  const v = db.prepare("SELECT can_vouch FROM group_members WHERE group_id=? AND user_id=?").get(gid, voucher);
  if (!v.can_vouch) return res.status(403).json({ error: "Your vouching privileges have been revoked in this group. (2+ strikes)" });
  if (voucher === guest) return res.status(400).json({ error: "You cannot vouch for yourself." });
  db.prepare("INSERT OR IGNORE INTO vouches (group_id,guest_user_id,voucher_id) VALUES (?,?,?)").run(gid, guest, voucher);
  const need = db.prepare("SELECT vouches_required FROM groups WHERE id=?").get(gid).vouches_required;
  const have = db.prepare("SELECT COUNT(*) c FROM vouches WHERE group_id=? AND guest_user_id=?").get(gid, guest).c;
  if (have >= need) {
    db.prepare("UPDATE group_members SET status='active' WHERE group_id=? AND user_id=?").run(gid, guest);
    notify(guest, "vouch", { group_id: gid, accepted: true, message: "You've been vouched in! Welcome to the group." });
  }
  res.json({ have, need, accepted: have >= need });
});
// S6: admin removes member with written reason → vouchers get strikes.
app.post("/api/groups/:gid/remove/:uid", requireAdmin, (req, res) => {
  const gid = Number(req.params.gid), uid = Number(req.params.uid), reason = (req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ error: "A written reason is required." });
  db.prepare("UPDATE group_members SET status='removed' WHERE group_id=? AND user_id=?").run(gid, uid);
  const vouchers = db.prepare("SELECT voucher_id FROM vouches WHERE group_id=? AND guest_user_id=?").all(gid, uid);
  for (const { voucher_id } of vouchers) {
    db.prepare("INSERT INTO strikes (group_id,user_id,source_removed_user_id,reason) VALUES (?,?,?,?)").run(gid, voucher_id, uid, reason);
    const m = db.prepare("UPDATE group_members SET strikes=strikes+1, can_vouch=CASE WHEN strikes+1>=2 THEN 0 ELSE can_vouch END WHERE group_id=? AND user_id=?").run(gid, voucher_id);
    void m;
  }
  audit(null, req.session.uid, "member_removed", { group_id: gid, user_id: uid, reason });
  res.json({ ok: true, struck: vouchers.length });
});

// ---------- sessions & RSVP ----------
app.post("/api/groups/:gid/sessions", requireMember, (req, res) => {
  const gid = Number(req.params.gid);
  const { starts_at, spot_id, designated_driver_id, invited_user_ids } = req.body;
  const uid = req.session.uid;
  const user = me(req);
  const sessionId = db.transaction(() => {
    const r = db.prepare("INSERT INTO sessions (group_id,spot_id,starts_at,designated_driver_id,status) VALUES (?,?,?,?, 'planning')")
      .run(gid, spot_id ?? null, starts_at, designated_driver_id ?? null);
    const sid = r.lastInsertRowid;

    // Creator RSVP: default 'going'
    db.prepare(`INSERT OR REPLACE INTO rsvps (session_id, user_id, status) VALUES (?, ?, 'going')`).run(sid, uid);

    // Auto-create (or reuse) a session-linked group chat so the crew and invited friends can coordinate immediately
    const group = db.prepare("SELECT name FROM groups WHERE id=?").get(gid);
    const dateStr = new Date(starts_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    const chatTitle = `${group?.name ?? "Crew"} · ${dateStr} session`;

    let convId = db.prepare("SELECT id FROM conversations WHERE session_id=?").get(sid)?.id;
    if (!convId) {
      const c = db.prepare("INSERT INTO conversations (type,group_id,session_id,title,created_by) VALUES ('group',?,?,?,?)").run(gid, sid, chatTitle, uid);
      convId = c.lastInsertRowid;
      db.prepare("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(convId, uid);

      // Collect users to add: active crew members + explicitly invited users
      const memberIds = new Set();
      const crewMembers = db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND status='active'").all(gid);
      for (const m of crewMembers) memberIds.add(m.user_id);

      if (Array.isArray(invited_user_ids)) {
        for (const id of invited_user_ids) {
          const num = Number(id);
          if (num && num !== uid) {
            memberIds.add(num);
            // RSVP invited friends/members
            db.prepare("INSERT OR IGNORE INTO rsvps (session_id, user_id, status) VALUES (?, ?, 'maybe')").run(sid, num);
            notify(num, "session_invite", {
              session_id: sid,
              group_name: group?.name ?? "Crew",
              inviter_name: user?.name ?? "Crew admin",
              starts_at
            });
          }
        }
      }

      for (const mid of memberIds) {
        db.prepare("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(convId, mid);
      }

      // System welcome message
      const rosterCount = memberIds.size;
      db.prepare("INSERT INTO messages (conversation_id,sender_id,content) VALUES (?,?,?)")
        .run(convId, uid, `📅 Session planned for ${dateStr}! ${rosterCount > 1 ? `${rosterCount} people in roster.` : ""} Coordinate rides, pickup spots, and budget here.`);
    }
    return sid;
  })();
  res.json({ id: sessionId });
});
app.patch("/api/sessions/:sid", requireAuth, (req, res) => {
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(Number(req.params.sid));
  if (!s) return res.status(404).json({ error: "Session not found." });
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  const { status, designated_driver_id, uwian_deadline, cover_url } = req.body ?? {};
  if (cover_url !== undefined) {
    // Session pictures are crew-admin only (mirrors close-tab/reopen).
    // Same validation as avatar_url: real image data URLs only, size-capped,
    // svg and javascript: URIs rejected by the mime allowlist.
    const mm = membership(s.group_id, req.session.uid);
    if (!mm || mm.role !== "admin") return res.status(403).json({ error: "Only crew admins can change the session picture." });
    if (cover_url !== null) {
      if (typeof cover_url !== "string" || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(cover_url))
        return res.status(400).json({ error: "Picture must be a PNG, JPEG, or WebP image." });
      if (cover_url.length > 270000)
        return res.status(413).json({ error: "Picture is too large." });
    }
    db.prepare("UPDATE sessions SET cover_url=? WHERE id=?").run(cover_url, s.id);
  }
  if (status === "open" && uwian_deadline === undefined) {
    db.prepare("UPDATE sessions SET status='open', designated_driver_id=COALESCE(?,designated_driver_id) WHERE id=?")
      .run(designated_driver_id ?? null, s.id);
  } else if (status) {
    db.prepare("UPDATE sessions SET status=?, uwian_deadline=COALESCE(?,uwian_deadline) WHERE id=?")
      .run(status, uwian_deadline ?? null, s.id);
    if (status === "wrapped") pairUp(s); // S2 buddy pairing fires on "Uwian na"
    if (status === "closed") db.prepare("UPDATE live_locations SET active=0 WHERE session_id=?").run(s.id);
  }
  res.json({ ok: true });
});
app.post("/api/sessions/:sid/rsvp", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  const st = ["going", "maybe", "cant"].includes(req.body.status) ? req.body.status : "maybe";
  db.prepare(`INSERT INTO rsvps (session_id,user_id,status) VALUES (?,?,?)
    ON CONFLICT(session_id,user_id) DO UPDATE SET status=excluded.status, updated_at=datetime('now')`)
    .run(sid, req.session.uid, st);
  res.json({ ok: true });
});

// ---------- expenses (live tab) ----------
function isInSession(sid) {
  return Object.fromEntries(db.prepare("SELECT user_id,status FROM rsvps WHERE session_id=?").all(sid)
    .map((r) => [String(r.user_id), r.status === "going" || r.status === "maybe"]));
}
app.post("/api/sessions/:sid/expenses", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  const m = membership(s.group_id, req.session.uid);
  if (!m) return res.status(403).json({ error: "Access denied." });
  if (s.status === "closed") return res.status(409).json({ error: "Tab is closed — ask an admin to reopen it." });
  const { amount_centavos, description, is_alcohol = 0, paid_by, participants } = req.body;
  if (!Number.isInteger(amount_centavos) || amount_centavos < 0) return res.status(400).json({ error: "Amount must be a non-negative integer (centavos)." });
  let ppl = participants;
  if (!ppl || ppl.length === 0) {
    // Friendly auto-defaults: alcohol excludes DD + non-drinkers; food includes everyone.
    const isIn = isInSession(sid);
    const drinkers = Object.fromEntries(db.prepare("SELECT id,can_drink FROM users").all().map((u) => [String(u.id), !!u.can_drink]));
    ppl = Object.keys(isIn).filter((uid) => isIn[uid]
      && !(is_alcohol && String(s.designated_driver_id) === uid)
      && !(is_alcohol && !drinkers[uid]));
  }
  const shares = splitExpense(amount_centavos, ppl);
  const tx = db.transaction(() => {
    const e = db.prepare("INSERT INTO expenses (session_id,paid_by,amount_centavos,description,is_alcohol) VALUES (?,?,?,?,?)")
      .run(sid, paid_by ?? req.session.uid, amount_centavos, description, is_alcohol ? 1 : 0);
    for (const [uid, sh] of Object.entries(shares))
      db.prepare("INSERT INTO expense_participants (expense_id,user_id,share_centavos) VALUES (?,?,?)").run(e.lastInsertRowid, uid, sh);
    audit(sid, req.session.uid, "expense_add", { amount_centavos, description, is_alcohol });
    return e.lastInsertRowid;
  });
  res.json({ id: tx(), shares });
});
app.put("/api/expenses/:eid", requireAuth, (req, res) => {
  const e = db.prepare("SELECT * FROM expenses WHERE id=?").get(Number(req.params.eid));
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(e.session_id);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  const afterClose = s.status === "closed" ? 1 : 0;
  if (afterClose && !requireAdminGate(s)) return res.status(403).json({ error: "Tab is closed — only admins can edit (reopen first)." });
  function requireAdminGate(sess) { const mm = membership(sess.group_id, req.session.uid); return mm && mm.role === "admin"; }
  const { amount_centavos, participants, description } = req.body;
  const shares = splitExpense(amount_centavos, participants);
  db.transaction(() => {
    db.prepare("UPDATE expenses SET amount_centavos=?, description=?, edited_after_close=? WHERE id=?")
      .run(amount_centavos, description ?? e.description, afterClose, e.id);
    db.prepare("DELETE FROM expense_participants WHERE expense_id=?").run(e.id);
    for (const [uid, sh] of Object.entries(shares))
      db.prepare("INSERT INTO expense_participants (expense_id,user_id,share_centavos) VALUES (?,?,?)").run(e.id, uid, sh);
    audit(e.session_id, req.session.uid, "expense_edit", { expense_id: e.id, after_close: !!afterClose });
  })();
  res.json({ shares });
});

// ---------- settlement ----------
function sessionExpenses(sid) {
  const expenses = db.prepare("SELECT * FROM expenses WHERE session_id=?").all(sid);
  const shares = {};
  for (const e of expenses) {
    shares[e.id] = Object.fromEntries(
      db.prepare("SELECT user_id, share_centavos FROM expense_participants WHERE expense_id=?").all(e.id)
        .map((r) => [String(r.user_id), r.share_centavos]));
  }
  return { expenses, shares };
}
app.post("/api/sessions/:sid/close-tab", requireAdmin, (req, res) => {
  const sid = Number(req.params.sid);
  const { expenses, shares } = sessionExpenses(sid);
  const transfers = settle(computeBalances(expenses, shares));
  db.transaction(() => {
    db.prepare("UPDATE sessions SET status='closed', closed_tab_at=datetime('now') WHERE id=?").run(sid);
    db.prepare("UPDATE live_locations SET active=0 WHERE session_id=?").run(sid);
    for (const t of transfers)
      db.prepare("INSERT INTO settlements (session_id,from_user,to_user,amount_centavos,status) VALUES (?,?,?,?,'open')")
        .run(sid, t.from, t.to, t.amount_centavos);
    audit(sid, req.session.uid, "tab_closed", { transfers: transfers.length });
  })();
  res.json(transfers);
});
app.post("/api/sessions/:sid/reopen", requireAdmin, (req, res) => {
  const sid = Number(req.params.sid);
  db.transaction(() => {
    // void unpaid/unclaimed; keep confirmed (money already moved)
    // disputed rows are NOT voided: they wait for the admin to fix and re-close,
    // so a complaint never silently disappears on reopen.
    db.prepare("UPDATE settlements SET status='voided' WHERE session_id=? AND status IN ('open','paid_claimed')").run(sid);
    db.prepare("UPDATE sessions SET status='open', closed_tab_at=NULL WHERE id=?").run(sid);
    audit(sid, req.session.uid, "tab_reopened", {});
  })();
  res.json({ ok: true, note: "Confirmed payments are preserved. Everything else will be recalculated on close." });
});
// payment confirmation flow: payer claims → receiver confirms/disputes
app.post("/api/settlements/:id/claim-paid", requireAuth, (req, res) => {
  const t = db.prepare("SELECT * FROM settlements WHERE id=?").get(Number(req.params.id));
  if (t.from_user !== req.session.uid) return res.status(403).json({ error: "Only the payer can claim payment." });
  db.prepare("UPDATE settlements SET status='paid_claimed' WHERE id=?").run(t.id);
  notify(t.to_user, "payment_claim", { settlement_id: t.id, message: "Someone says they've paid you. Please confirm." });
  res.json({ ok: true });
});
app.post("/api/settlements/:id/confirm", requireAuth, (req, res) => {
  const t = db.prepare("SELECT * FROM settlements WHERE id=?").get(Number(req.params.id));
  if (t.to_user !== req.session.uid) return res.status(403).json({ error: "Only the recipient can confirm payment." });
  db.prepare("UPDATE settlements SET status='confirmed' WHERE id=?").run(t.id);
  res.json({ ok: true });
});
app.post("/api/settlements/:id/dispute", requireAuth, (req, res) => {
  const t = db.prepare("SELECT * FROM settlements WHERE id=?").get(Number(req.params.id));
  if (![t.from_user, t.to_user].includes(req.session.uid)) return res.status(403).json({ error: "Only the two parties can dispute this." });
  const note = (req.body?.note ?? "").trim();
  if (!note) return res.status(400).json({ error: "Please describe the issue so the admin can see it." });
  db.prepare("UPDATE settlements SET status='disputed', note=? WHERE id=?").run(note, t.id);
  const admins = db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND role='admin' AND status='active'")
    .all(db.prepare("SELECT group_id FROM sessions WHERE id=?").get(t.session_id).group_id);
  for (const a of admins) notify(a.user_id, "dispute", { settlement_id: t.id, note });
  res.json({ ok: true });
});
// S4 ledger = query over unconfirmed, un-voided settlements across sessions
app.get("/api/groups/:gid/ledger", requireMember, (req, res) => {
  const rows = db.prepare(`SELECT s.from_user, s.to_user, s.amount_centavos FROM settlements s
    JOIN sessions se ON se.id=s.session_id
    WHERE se.group_id=? AND s.status IN ('open','paid_claimed','disputed')`).all(Number(req.params.gid));
  res.json(ledgerFromTransfers(rows.map((r) => ({ from: String(r.from_user), to: String(r.to_user), amount_centavos: r.amount_centavos }))));
});

// ---------- uwian: check-in, buddies, escalation ----------
function pairUp(s) {
  const going = db.prepare("SELECT user_id FROM rsvps WHERE session_id=? AND status='going'").all(s.id).map((r) => r.user_id);
  const byTag = {};
  for (const uid of going) {
    const gm = db.prepare("SELECT direction_tag_id FROM group_members WHERE group_id=? AND user_id=?").get(s.group_id, uid);
    const key = gm.direction_tag_id ?? "no-direction";
    (byTag[key] ??= []).push(uid);
  }
  db.prepare("DELETE FROM buddy_pairs WHERE session_id=?").run(s.id);
  for (const list of Object.values(byTag)) {
    const tmp = [...list];
    while (tmp.length) {
      const grp = tmp.length === 3 ? tmp.splice(0, 3) : tmp.splice(0, 2);
      if (grp.length === 1 && tmp.length === 0 && db.prepare("SELECT COUNT(*) c FROM buddy_pairs WHERE session_id=?").get(s.id).c > 0) {
        // fold lone member into last trio? simpler: give them to the previous pair as trio
        const last = db.prepare("SELECT * FROM buddy_pairs WHERE session_id=? ORDER BY user_a LIMIT 1").all(s.id).pop();
        if (last && !last.user_c) { db.prepare("UPDATE buddy_pairs SET user_c=? WHERE session_id=? AND user_a=? AND user_b=?").run(grp[0], s.id, last.user_a, last.user_b); continue; }
      }
      if (grp.length >= 2) db.prepare("INSERT INTO buddy_pairs (session_id,user_a,user_b,user_c) VALUES (?,?,?,?)")
        .run(s.id, grp[0], grp[1], grp[2] ?? null);
      else if (grp.length === 1) db.prepare("INSERT INTO buddy_pairs (session_id,user_a,user_b) VALUES (?,?,-1)")
        .run(s.id, grp[0]); // placeholder self-pair so nobody is orphaned (UI shows "no buddy yet — ask an admin")
    }
  }
}
app.post("/api/sessions/:sid/checkin", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  const mode = req.body.mode ?? "other";
  db.prepare(`INSERT INTO checkins (session_id,user_id,mode,home_confirmed_at) VALUES (?,?,?, datetime('now'))
    ON CONFLICT(session_id,user_id) DO UPDATE SET mode=excluded.mode, home_confirmed_at=datetime('now'), flag_stage=0`)
    .run(sid, req.session.uid, mode);
  // friendly nudge: own-drive while not being THE designated driver → ask for ride offers, never block
  if (mode === "own_drive" && s.designated_driver_id !== req.session.uid) {
    const mates = db.prepare("SELECT user_id FROM rsvps WHERE session_id=? AND status='going' AND user_id!=?").all(sid, req.session.uid);
    for (const mt of mates) notify(mt.user_id, "ride_request", { session_id: sid, message: "Someone is driving. Can you offer a ride?" });
  }
  res.json({ ok: true });
});
app.post("/api/buddies/:sid/:a/:b/clear-flag", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const pair = db.prepare("SELECT * FROM buddy_pairs WHERE session_id=? AND user_a=? AND user_b=?").get(sid, Number(req.params.a), Number(req.params.b));
  if (!pair) return res.status(404).json({ error: "Buddy pair not found." });
  const members = [pair.user_a, pair.user_b, pair.user_c].filter((x) => x != null && x > 0);
  if (!members.includes(req.session.uid)) return res.status(403).json({ error: "Only members of this buddy pair can clear the flag." });
  const other = members.find((x) => x !== req.session.uid);
  db.prepare("UPDATE checkins SET flag_stage=0, flag_cleared_by=? WHERE session_id=? AND user_id=? AND home_confirmed_at IS NULL")
    .run(req.session.uid, sid, other);
  res.json({ ok: true });
});
// Escalation tick — called by cron and also lazily on page load (no external scheduler needed).
export function runEscalation(now = new Date()) {
  const open = db.prepare("SELECT * FROM sessions WHERE status IN ('open','wrapped') AND uwian_deadline IS NOT NULL").all();
  for (const s of open) {
    const g = db.prepare("SELECT buddy_notify_min, admin_notify_min FROM groups WHERE id=?").get(s.group_id);
    const mins = (now - new Date(s.uwian_deadline)) / 60000;
    if (mins < 0) continue;
    const missing = db.prepare(`SELECT r.user_id FROM rsvps r LEFT JOIN checkins c
      ON c.session_id=r.session_id AND c.user_id=r.user_id
      WHERE r.session_id=? AND r.status='going' AND c.home_confirmed_at IS NULL`).all(s.id);
    for (const { user_id } of missing) {
      const c = db.prepare("SELECT * FROM checkins WHERE session_id=? AND user_id=?").get(s.id, user_id)
        ?? { flag_stage: 0 };
      const stage = mins >= g.admin_notify_min ? 3 : mins >= g.buddy_notify_min ? 2 : 1;
      if (stage <= c.flag_stage) continue;
      db.prepare(`INSERT INTO checkins (session_id,user_id,flag_stage) VALUES (?,?,?)
        ON CONFLICT(session_id,user_id) DO UPDATE SET flag_stage=excluded.flag_stage`).run(s.id, user_id, stage);
      if (stage === 1) notify(user_id, "uwian_reminder", { message: "Have you made it home? Tap check-in." });
      if (stage === 2) {
        const pair = db.prepare("SELECT * FROM buddy_pairs WHERE session_id=? AND (user_a=? OR user_b=? OR user_c=?)").get(s.id, user_id, user_id, user_id);
        for (const b of [pair?.user_a, pair?.user_b, pair?.user_c].filter((x) => x && x !== user_id && x > 0))
          notify(b, "buddy_alert", { message: "Your buddy hasn't checked in yet.", user_id });
      }
      if (stage === 3) {
        const admins = db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND role='admin' AND status='active'").all(s.group_id);
        for (const a of admins) notify(a.user_id, "escalation", { session_id: s.id, user_id, message: "No sign of life. Check the group page." });
      }
    }
  }
}
app.post("/api/escalation-tick", (req, res) => { runEscalation(); res.json({ ok: true }); });

// ---------- S3 hangganan — OWNER-ONLY reads ----------
app.put("/api/sessions/:sid/limit", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const lim = req.body.limit == null ? null : Math.max(1, Math.floor(req.body.limit));
  db.prepare(`INSERT INTO limit_counters (session_id,user_id,lim) VALUES (?,?,?)
    ON CONFLICT(session_id,user_id) DO UPDATE SET lim=excluded.lim`).run(sid, req.session.uid, lim);
  res.json({ ok: true });
});
app.post("/api/sessions/:sid/limit/tap", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  db.prepare(`INSERT INTO limit_counters (session_id,user_id,count) VALUES (?,?,1)
    ON CONFLICT(session_id,user_id) DO UPDATE SET count=count+1`).run(sid, req.session.uid);
  const row = db.prepare("SELECT lim,count FROM limit_counters WHERE session_id=? AND user_id=?").get(sid, req.session.uid);
  const level = row.lim ? (row.count >= row.lim ? "at_limit" : row.count >= Math.ceil(row.lim * 0.8) ? "approaching" : null) : null;
  if (level) notify(req.session.uid, "nudge", { message: level === "at_limit"
    ? "You've hit your limit. Sort out your ride home?"
    : "You're getting close to your limit. Sort out your ride home?", open_checkin: true });
  res.json({ count: row.count, lim: row.lim, level }); // returned ONLY to this user's own request
});
app.get("/api/sessions/:sid/limit", requireAuth, (req, res) => {
  // privacy invariant: always filtered by the caller's own id — no admin bypass exists
  res.json(db.prepare("SELECT lim,count FROM limit_counters WHERE session_id=? AND user_id=?")
    .get(Number(req.params.sid), req.session.uid) ?? { lim: null, count: 0 });
});

// ---------- spots / tambayan map (S5 freshness & Public Verified Radar) ----------
// The radar is a verified-members map. An account with no approved ID cannot
// view the map or pins: physical locations are protected from unverified tracking.
app.get("/api/map/radar", requireAuth, (req, res) => {
  const verified =
    !!db
      .prepare("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1")
      .get(req.session.uid);
  if (!verified) {
    return res.status(403).json({
      error: "ID verification required to view live spots and map locations.",
      code: "VERIFICATION_REQUIRED",
    });
  }
  const spots = db.prepare(`
    SELECT sp.*, g.name AS group_name
    FROM spots sp
    JOIN groups g ON g.id = sp.group_id
    ORDER BY sp.id DESC
  `).all();

  const results = spots.map((sp) => {
    const sessions = db.prepare(`
      SELECT s.id, s.starts_at, s.status, s.uwian_deadline, g.name AS group_name,
             (SELECT COUNT(*) FROM rsvps r WHERE r.session_id=s.id AND r.status='going') AS going_count
      FROM sessions s
      JOIN groups g ON g.id = s.group_id
      WHERE s.spot_id = ? AND s.status IN ('planning','open','wrapped')
      ORDER BY s.starts_at ASC
    `).all(sp.id);

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
  });

  res.json(results);
});

app.get("/api/groups/:gid/spots", requireMember, (req, res) => {
  const verified =
    !!db
      .prepare("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1")
      .get(req.session.uid);
  if (!verified) {
    return res.status(403).json({
      error: "ID verification required to view crew spot locations.",
      code: "VERIFICATION_REQUIRED",
    });
  }
  const spots = db.prepare("SELECT * FROM spots WHERE group_id=?").all(Number(req.params.gid));
  res.json(spots.map((sp) => ({
    ...sp,
    stale: !sp.last_confirmed_at || (Date.now() - new Date(sp.last_confirmed_at)) > 60 * 864e5, // 60 days
  })));
});
app.post("/api/groups/:gid/spots", requireMember, (req, res) => {
  const { name, lat, lng, price_range, closes_at, notes } = req.body;
  const r = db.prepare("INSERT INTO spots (group_id,name,lat,lng,price_range,closes_at,notes,added_by,last_confirmed_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))")
    .run(Number(req.params.gid), name, lat, lng, price_range ?? null, closes_at ?? null, notes ?? null, req.session.uid);
  res.json({ id: r.lastInsertRowid });
});
// ---------- spot suggestions (anyone proposes, Uwian staff approve) ----------
// Public map stays trustworthy: nothing a member pins reaches the radar until
// a staff account has looked at it.
app.post("/api/spot-suggestions", requireAuth, (req, res) => {
  const { name, lat, lng, price_range, closes_at, notes } = req.body ?? {};
  const n = String(name ?? "").trim();
  const flat = /^-?\d+(\.\d+)?$/.test(String(lat)) && /^-?\d+(\.\d+)?$/.test(String(lng));
  if (!n || n.length > 80) return res.status(400).json({ error: "Give the spot a name (80 chars max)." });
  if (!flat) return res.status(400).json({ error: "Drop the pin on the map first." });
  const la = Number(lat), ln = Number(lng);
  if (la < -90 || la > 90 || ln < -180 || ln > 180)
    return res.status(400).json({ error: "That pin is off the planet." });
  if (db.prepare("SELECT id FROM spots WHERE lat=? AND lng=?").get(la, ln))
    return res.status(409).json({ error: "There is already a spot pinned there." });
  const r = db.prepare(`INSERT INTO spot_submissions (submitter_id,name,lat,lng,price_range,closes_at,notes)
    VALUES (?,?,?,?,?,?,?)`)
    .run(req.session.uid, n, la, ln, price_range ?? null, closes_at ?? null, String(notes ?? "").trim() || null);
  res.json({ id: r.lastInsertRowid, status: "pending" });
});

// Your own submissions, so the "waiting for approval" state is visible.
app.get("/api/me/spot-suggestions", requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT id,name,lat,lng,status,review_note,created_at,reviewed_at
    FROM spot_submissions WHERE submitter_id=? ORDER BY id DESC LIMIT 20`).all(req.session.uid));
});

app.get("/api/admin/spot-suggestions", requireSiteAdmin, (req, res) => {
  const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
  res.json(db.prepare(`SELECT ss.*, u.name AS submitter_name, u.email AS submitter_email
    FROM spot_submissions ss JOIN users u ON u.id=ss.submitter_id
    WHERE ss.status=? ORDER BY ss.created_at ASC LIMIT 100`).all(status));
});

app.post("/api/admin/spot-suggestions/:id/review", requireSiteAdmin, (req, res) => {
  const { action, note } = req.body ?? {}; // 'approved' | 'rejected'
  if (!["approved", "rejected"].includes(action))
    return res.status(400).json({ error: "action must be 'approved' or 'rejected'." });
  const sub = db.prepare("SELECT * FROM spot_submissions WHERE id=?").get(Number(req.params.id));
  if (!sub) return res.status(404).json({ error: "Suggestion not found." });
  if (sub.status !== "pending") return res.status(409).json({ error: "Already reviewed." });

  if (action === "approved") {
    if (db.prepare("SELECT id FROM spots WHERE lat=? AND lng=?").get(sub.lat, sub.lng))
      return res.status(409).json({ error: "Someone pinned a spot at that location already. Reject instead." });
    // group_id is NOT NULL on spots, and an approved public spot belongs to no
    // single crew. Staff suggestions attach to the ops group (id 1), the only
    // row we can guarantee exists on a seeded instance.
    const ops = db.prepare("SELECT id FROM groups ORDER BY id LIMIT 1").get();
    if (!ops) return res.status(409).json({ error: "No crew exists yet, so there is nowhere to attach the spot." });
    db.prepare(`INSERT INTO spots (group_id,name,lat,lng,price_range,closes_at,notes,added_by,last_confirmed_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(ops.id, sub.name, sub.lat, sub.lng, sub.price_range, sub.closes_at, sub.notes, sub.submitter_id);
  }
  db.prepare(`UPDATE spot_submissions SET status=?, review_note=?, reviewed_by=?, reviewed_at=datetime('now')
    WHERE id=?`).run(action, String(note ?? "").trim() || null, req.session.uid, sub.id);
  notify(sub.submitter_id, action === "approved" ? "verification_approved" : "verification_rejected", {
    message: action === "approved"
      ? `Your spot "${sub.name}" is live on the map. Salamat!`
      : `Your spot "${sub.name}" was not approved${note ? `: ${note}` : "."}`,
  });
  res.json({ ok: true });
});

app.post("/api/spots/:id/confirm", requireAuth, (req, res) => {
  const sp = db.prepare("SELECT * FROM spots WHERE id=?").get(Number(req.params.id));
  if (!membership(sp.group_id, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  const answer = ["yes", "no", "changed"].includes(req.body.answer) ? req.body.answer : "yes";
  db.prepare("INSERT INTO spot_confirmations (spot_id,user_id,answer,new_details) VALUES (?,?,?,?)")
    .run(sp.id, req.session.uid, answer, req.body.new_details ?? null);
  if (answer !== "no") db.prepare("UPDATE spots SET last_confirmed_at=datetime('now'), closes_at=COALESCE(?,closes_at) WHERE id=?")
    .run(req.body.closes_at ?? null, sp.id);
  res.json({ ok: true });
});

// ---------- admin console (Uwian staff) ----------
app.get("/api/admin/overview", requireSiteAdmin, (req, res) => {
  const count = (sql) => db.prepare(sql).get().c;
  res.json({
    users: count("SELECT COUNT(*) c FROM users"),
    crews: count("SELECT COUNT(*) c FROM groups"),
    sessions: count("SELECT COUNT(*) c FROM sessions"),
    live_spots: count("SELECT COUNT(*) c FROM spots"),
    pending_spots: count("SELECT COUNT(*) c FROM spot_submissions WHERE status='pending'"),
    pending_verifications: count("SELECT COUNT(*) c FROM verification_submissions WHERE status IN ('pending','under_review')"),
    open_flags: count("SELECT COUNT(*) c FROM admin_flags WHERE status='open'"),
    pending_profiles: count("SELECT COUNT(*) c FROM profile_change_requests WHERE status='pending'"),
    recent_users: db.prepare(`SELECT id,name,email,role,created_at FROM users ORDER BY id DESC LIMIT 8`).all(),
  });
});

// ---------- misc reads ----------
const withNames = (sql) => (params) => {
  const names = Object.fromEntries(db.prepare("SELECT id,name FROM users").all().map((u) => [u.id, u.name]));
  return sql(params).map((r) => ({ ...r, name: names[r.user_id] ?? names[r.id] ?? null }));
};
app.get("/api/sessions/:sid", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  const { expenses, shares } = sessionExpenses(sid);
  const names = Object.fromEntries(db.prepare("SELECT id,name FROM users").all().map((u) => [u.id, u.name]));
  const isVerified = !!db
    .prepare("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1")
    .get(req.session.uid);
  const rawSpot = db.prepare("SELECT * FROM spots WHERE id=?").get(s.spot_id) ?? null;
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
    members: db.prepare(`SELECT gm.user_id, gm.role, gm.direction_tag_id, u.name, u.avatar_id, u.avatar_url, u.can_drink,
        u.handle, dt.label AS tag FROM group_members gm JOIN users u ON u.id=gm.user_id
        LEFT JOIN direction_tags dt ON dt.id=gm.direction_tag_id
        WHERE gm.group_id=? AND gm.status='active'`).all(s.group_id),
    rsvps: db.prepare("SELECT r.*, u.name, u.avatar_id, u.avatar_url, u.handle FROM rsvps r JOIN users u ON u.id=r.user_id WHERE r.session_id=?").all(sid),
    expenses: expenses.map((e) => ({ ...e, payer_name: names[e.paid_by] })), shares,
    settlements: db.prepare("SELECT * FROM settlements WHERE session_id=? AND status!='voided'").all(sid)
      .map((t) => ({ ...t, from_name: names[t.from_user], to_name: names[t.to_user] })),
    checkins: db.prepare("SELECT c.session_id,c.user_id,u.name,u.avatar_id,u.avatar_url,c.mode,c.home_confirmed_at,c.flag_stage,c.ride_offer_from FROM checkins c JOIN users u ON u.id=c.user_id WHERE c.session_id=?").all(sid),
    buddy_pairs: db.prepare("SELECT * FROM buddy_pairs WHERE session_id=?").all(sid)
      .map((p) => ({ ...p, names: [p.user_a, p.user_b, p.user_c].filter((x) => x > 0).map((x) => names[x]) })),
    // NOTE: limit_counters intentionally absent — even the owner fetches it via its own endpoint.
  });
});
app.get("/api/me/notifications", requireAuth, (req, res) => {
  res.json(db.prepare("SELECT * FROM notifications WHERE user_id=? AND read_at IS NULL ORDER BY id DESC").all(req.session.uid));
});
app.post("/api/notifications/:id/read", requireAuth, (req, res) => {
  db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND user_id=?").run(Number(req.params.id), req.session.uid);
  res.json({ ok: true });
});

// ---------- group detail & settings ----------
app.get("/api/groups/:gid", requireMember, (req, res) => {
  const gid = Number(req.params.gid);
  const g = db.prepare("SELECT * FROM groups WHERE id=?").get(gid);
  res.json({
    group: g,
    tags: db.prepare("SELECT * FROM direction_tags WHERE group_id=?").all(gid),
    members: db.prepare(`SELECT gm.user_id, gm.role, gm.status, gm.direction_tag_id, gm.can_vouch, gm.strikes,
        dt.label AS tag, u.name, u.email, u.avatar_id, u.avatar_url, u.can_drink, u.handle, u.vibe
      FROM group_members gm JOIN users u ON u.id=gm.user_id
      LEFT JOIN direction_tags dt ON dt.id=gm.direction_tag_id
      WHERE gm.group_id=? AND gm.status IN ('active','pending_guest')`).all(gid),
    pending: db.prepare(`SELECT gm.user_id, u.name, u.avatar_id, u.avatar_url, u.handle,
        (SELECT COUNT(*) FROM vouches v WHERE v.group_id=gm.group_id AND v.guest_user_id=gm.user_id) AS vouches
      FROM group_members gm JOIN users u ON u.id=gm.user_id
      WHERE gm.group_id=? AND gm.status='pending_guest'`).all(gid),
    sessions: db.prepare("SELECT * FROM sessions WHERE group_id=? ORDER BY starts_at DESC LIMIT 20").all(gid),
  });
});
app.patch("/api/groups/:gid/settings", requireAdmin, (req, res) => {
  const gid = Number(req.params.gid);
  const { vouches_required, buddy_notify_min, admin_notify_min } = req.body ?? {};
  db.prepare(`UPDATE groups SET
      vouches_required=COALESCE(?,vouches_required),
      buddy_notify_min=COALESCE(?,buddy_notify_min),
      admin_notify_min=COALESCE(?,admin_notify_min) WHERE id=?`)
    .run([1, 2].includes(vouches_required) ? vouches_required : null,
      Number.isInteger(buddy_notify_min) && buddy_notify_min > 0 ? buddy_notify_min : null,
      Number.isInteger(admin_notify_min) && admin_notify_min > 0 ? admin_notify_min : null, gid);
  audit(null, req.session.uid, "group_settings", { group_id: gid, ...req.body });
  res.json({ ok: true });
});
app.post("/api/groups/:gid/tags", requireAdmin, (req, res) => {
  const label = (req.body?.label ?? "").trim();
  if (!label) return res.status(400).json({ error: "Direction tag name is required." });
  const r = db.prepare("INSERT INTO direction_tags (group_id,label) VALUES (?,?)").run(Number(req.params.gid), label);
  res.json({ id: r.lastInsertRowid });
});
app.put("/api/me/direction", requireAuth, (req, res) => {
  // member picks their own direction tag per group
  const gid = Number(req.body?.group_id), tagId = req.body?.direction_tag_id ?? null;
  if (!membership(gid, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  db.prepare("UPDATE group_members SET direction_tag_id=? WHERE group_id=? AND user_id=?").run(tagId, gid, req.session.uid);
  res.json({ ok: true });
});
app.post("/api/buddies/:sid/:a/:b/offer-ride", requireAuth, (req, res) => {
  // friendly response to "someone is driving": someone offers a ride (never blocks anyone)
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  const uid = Number(req.params.a);
  db.prepare("UPDATE checkins SET ride_offer_from=? WHERE session_id=? AND user_id=?").run(req.session.uid, sid, uid);
  notify(uid, "ride_offer", { message: "Someone offered you a ride.", session_id: sid });
  res.json({ ok: true });
});

// ---------- messaging ----------
// helper: ensure caller is in a conversation
const convMember = (cid, uid) =>
  db.prepare("SELECT * FROM conversation_members WHERE conversation_id=? AND user_id=?").get(cid, uid);

// List all conversations for the current user
app.get("/api/conversations", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const convs = db.prepare(`
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
  `).all(uid);

  const names = Object.fromEntries(db.prepare("SELECT id,name FROM users").all().map(u => [u.id, u.name]));
  const result = convs.map(c => {
    const members = db.prepare("SELECT cm.user_id, u.name, u.avatar_id, u.avatar_url FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=?").all(c.id);
    const other = c.type === "dm" ? members.find(m => m.user_id !== uid) : null;
    return {
      ...c,
      display_name: c.type === "dm" ? (other?.name ?? "Unknown") : (c.title ?? "Group Chat"),
      members,
      other_user: other,
    };
  });
  res.json(result);
});

// Create a DM conversation (or return existing)
app.post("/api/conversations/dm", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const { target_user_id } = req.body ?? {};
  if (!target_user_id || target_user_id === uid) return res.status(400).json({ error: "Invalid target user." });
  const target = db.prepare("SELECT id,name FROM users WHERE id=?").get(Number(target_user_id));
  if (!target) return res.status(404).json({ error: "User not found." });

  // Check if DM already exists between these two
  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id=c.id AND cm1.user_id=?
    JOIN conversation_members cm2 ON cm2.conversation_id=c.id AND cm2.user_id=?
    WHERE c.type='dm'
  `).get(uid, Number(target_user_id));
  if (existing) return res.json({ id: existing.id, existing: true });

  const tx = db.transaction(() => {
    const c = db.prepare("INSERT INTO conversations (type,created_by) VALUES ('dm',?)").run(uid);
    db.prepare("INSERT INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(c.lastInsertRowid, uid);
    db.prepare("INSERT INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(c.lastInsertRowid, Number(target_user_id));
    return c.lastInsertRowid;
  })();
  res.json({ id: tx, existing: false });
});

// Create a group conversation (tied to a crew group)
app.post("/api/conversations/group", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const { group_id, title } = req.body ?? {};
  if (!group_id) return res.status(400).json({ error: "group_id required." });
  if (!membership(Number(group_id), uid)) return res.status(403).json({ error: "Not a member of this crew." });

  // Check if group chat already exists for this group
  const existing = db.prepare("SELECT id FROM conversations WHERE type='group' AND group_id=?").get(Number(group_id));
  if (existing) return res.json({ id: existing.id, existing: true });

  const members = db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND status='active'").all(Number(group_id));
  const tx = db.transaction(() => {
    const c = db.prepare("INSERT INTO conversations (type,group_id,title,created_by) VALUES ('group',?,?,?)").run(Number(group_id), title ?? null, uid);
    for (const m of members)
      db.prepare("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(c.lastInsertRowid, m.user_id);
    return c.lastInsertRowid;
  })();
  res.json({ id: tx, existing: false });
});

// Get messages in a conversation (paginated)
app.get("/api/conversations/:cid/messages", requireAuth, (req, res) => {
  const cid = Number(req.params.cid), uid = req.session.uid;
  if (!convMember(cid, uid)) return res.status(403).json({ error: "Not a member of this conversation." });
  const before = req.query.before;
  const msgs = db.prepare(`
    SELECT m.*, u.name AS sender_name, u.avatar_id AS sender_avatar, u.avatar_url AS sender_avatar_url
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE m.conversation_id=? AND m.deleted_at IS NULL
      ${before ? "AND m.id < ?" : ""}
    ORDER BY m.created_at DESC LIMIT 40
  `).all(...(before ? [cid, Number(before)] : [cid]));
  // Mark as read
  db.prepare("UPDATE conversation_members SET last_read_at=datetime('now') WHERE conversation_id=? AND user_id=?").run(cid, uid);
  res.json(msgs.reverse());
});

// Send a message (text or location ping)
app.post("/api/conversations/:cid/messages", requireAuth, (req, res) => {
  const cid = Number(req.params.cid), uid = req.session.uid;
  if (!convMember(cid, uid)) return res.status(403).json({ error: "Not a member of this conversation." });
  const kind = req.body?.kind === "location" ? "location" : "text";

  if (kind === "location") {
    // Only verified members may broadcast their coordinates.
    const verified = !!db
      .prepare("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1")
      .get(uid);
    if (!verified) return res.status(403).json({ error: "ID verification required to share your location.", code: "VERIFICATION_REQUIRED" });
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
      return res.status(400).json({ error: "Valid lat/lng coordinates required." });
    const r = db.prepare("INSERT INTO messages (conversation_id,sender_id,content,kind,lat,lng) VALUES (?,?,?,?,?,?)").run(cid, uid, "📍 Location shared", "location", lat, lng);
    const conv = db.prepare("SELECT session_id FROM conversations WHERE id=?").get(cid);
    if (conv?.session_id) {
      db.prepare(`
        INSERT INTO live_locations (session_id,user_id,lat,lng,accuracy,active,updated_at)
        VALUES (?,?,?,?,?,1,datetime('now'))
        ON CONFLICT(session_id,user_id) DO UPDATE SET
          lat=excluded.lat, lng=excluded.lng, accuracy=excluded.accuracy,
          active=1, updated_at=datetime('now')
      `).run(conv.session_id, uid, lat, lng, req.body?.accuracy ?? null);
    }
    const others = db.prepare("SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?").all(cid, uid);
    const sender = db.prepare("SELECT name FROM users WHERE id=?").get(uid);
    for (const o of others)
      notify(o.user_id, "message", { conversation_id: cid, message: `${sender.name}: shared their location` });
    return res.json({ id: r.lastInsertRowid });
  }

  const content = (req.body?.content ?? "").trim();
  if (!content || content.length > 2000) return res.status(400).json({ error: "Message content required (max 2000 chars)." });
  const r = db.prepare("INSERT INTO messages (conversation_id,sender_id,content) VALUES (?,?,?)").run(cid, uid, content);
  // Notify other members
  const others = db.prepare("SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?").all(cid, uid);
  const me = db.prepare("SELECT name FROM users WHERE id=?").get(uid);
  for (const o of others)
    notify(o.user_id, "message", { conversation_id: cid, message: `${me.name}: ${content.slice(0, 80)}` });
  res.json({ id: r.lastInsertRowid });
});

// Delete a message (soft delete, own messages only)
app.delete("/api/messages/:mid", requireAuth, (req, res) => {
  const mid = Number(req.params.mid), uid = req.session.uid;
  const msg = db.prepare("SELECT * FROM messages WHERE id=?").get(mid);
  if (!msg || msg.sender_id !== uid) return res.status(403).json({ error: "You can only delete your own messages." });
  db.prepare("UPDATE messages SET deleted_at=datetime('now') WHERE id=?").run(mid);
  res.json({ ok: true });
});

// Get-or-create the session-linked chat (shortcut used by session page)
app.get("/api/sessions/:sid/chat", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!s) return res.status(404).json({ error: "Session not found." });
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Access denied." });
  const conv = db.prepare("SELECT * FROM conversations WHERE session_id=?").get(sid);
  if (conv) return res.json({ id: conv.id, existing: true });
  // create on-demand if session predates the feature
  const uid = req.session.uid;
  const group = db.prepare("SELECT name FROM groups WHERE id=?").get(s.group_id);
  const chatTitle = `${group?.name ?? "Crew"} · ${new Date(s.starts_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} session`;
  const members = db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND status='active'").all(s.group_id);
  const convId = db.transaction(() => {
    const c = db.prepare("INSERT INTO conversations (type,group_id,session_id,title,created_by) VALUES ('group',?,?,?,?)").run(s.group_id, sid, chatTitle, uid);
    const cid = c.lastInsertRowid;
    for (const m of members)
      db.prepare("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(cid, m.user_id);
    db.prepare("INSERT INTO messages (conversation_id,sender_id,content) VALUES (?,?,?)").run(cid, uid, `📅 Session chat created! Use this group to coordinate before, during, and after the hangout.`);
    return cid;
  })();
  res.json({ id: convId, existing: false });
});

// ---------- live GPS during sessions ----------
// Verified session members can broadcast their live position.
// Positions are upserted: one row per (session, user), updated in place.
// Clients poll GET every 15 s; rows older than 5 min are excluded server-side.

const requireVerifiedMember = (req, res, next) => {
  const u = me(req);
  if (!u) return res.status(401).json({ error: "Please log in first." });
  const verified = !!db
    .prepare("SELECT 1 FROM verification_submissions WHERE user_id=? AND status='approved' LIMIT 1")
    .get(u.id);
  if (!verified) return res.status(403).json({ error: "ID verification required for live location sharing.", code: "VERIFICATION_REQUIRED" });
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!s) return res.status(404).json({ error: "Session not found." });
  if (!membership(s.group_id, u.id)) return res.status(403).json({ error: "You are not in this session's crew." });
  req.session_row = s;
  next();
};

// PUT — broadcast/update your live location
app.put("/api/sessions/:sid/location", requireVerifiedMember, (req, res) => {
  const uid = req.session.uid, sid = Number(req.params.sid);
  const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
  const accuracy = req.body?.accuracy != null ? Number(req.body.accuracy) : null;
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
    return res.status(400).json({ error: "Valid lat/lng required." });
  db.prepare(`
    INSERT INTO live_locations (session_id,user_id,lat,lng,accuracy,active,updated_at)
    VALUES (?,?,?,?,?,1,datetime('now'))
    ON CONFLICT(session_id,user_id) DO UPDATE SET
      lat=excluded.lat, lng=excluded.lng, accuracy=excluded.accuracy,
      active=1, updated_at=datetime('now')
  `).run(sid, uid, lat, lng, accuracy);
  res.json({ ok: true });
});

// DELETE — stop sharing (sets active=0, keeps row for audit)
app.delete("/api/sessions/:sid/location", requireVerifiedMember, (req, res) => {
  const uid = req.session.uid, sid = Number(req.params.sid);
  db.prepare("UPDATE live_locations SET active=0, updated_at=datetime('now') WHERE session_id=? AND user_id=?").run(sid, uid);
  res.json({ ok: true });
});

// GET — all active member positions for this session (updated within last 5 min)
app.get("/api/sessions/:sid/locations", requireVerifiedMember, (req, res) => {
  const sid = Number(req.params.sid);
  const rows = db.prepare(`
    SELECT ll.user_id, ll.lat, ll.lng, ll.accuracy, ll.updated_at, u.name, u.avatar_id, u.avatar_url
    FROM live_locations ll
    JOIN users u ON u.id = ll.user_id
    WHERE ll.session_id = ?
      AND ll.active = 1
      AND ll.updated_at >= datetime('now', '-5 minutes')
    ORDER BY ll.updated_at DESC
  `).all(sid);
  res.json(rows);
});

app.get("/api/conversations/unread-count", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=cm.conversation_id AND m.deleted_at IS NULL
        AND m.created_at > COALESCE(cm.last_read_at,'1970-01-01'))
    ), 0) AS total
    FROM conversation_members cm WHERE cm.user_id=?
  `).get(uid);
  res.json({ unread: row.total });
});

// ---------- friends & discovery ----------

// List friends, incoming requests, and outgoing requests
app.get("/api/friends", requireAuth, (req, res) => {
  const uid = req.session.uid;
  // Accepted friends (bi-directional: either user_id = uid or friend_id = uid where status='accepted')
  const friends = db.prepare(`
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
  `).all(uid, uid, uid, uid);

  // Incoming pending requests (others requested current user)
  const incoming = db.prepare(`
    SELECT f.id AS request_id, f.created_at,
           u.id, u.name, u.email, u.handle, u.avatar_id, u.avatar_url, u.can_drink, u.vibe,
           (SELECT vs.status FROM verification_submissions vs WHERE vs.user_id = u.id) AS verification_status
    FROM friends f
    JOIN users u ON f.user_id = u.id
    WHERE f.friend_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(uid);

  // Outgoing pending requests (current user requested others)
  const outgoing = db.prepare(`
    SELECT f.id AS request_id, f.created_at,
           u.id, u.name, u.email, u.handle, u.avatar_id, u.avatar_url, u.can_drink, u.vibe
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(uid);

  res.json({ friends, incoming, outgoing });
});

// Past crew for the session invite picker: people you shared a *successful*
// session with. Successful = the session ran its full cycle (status 'closed')
// and both of you were RSVP'd going. One row per person, most recent shared
// session first, labeled so the picker can show where you know them from.
app.get("/api/users/past-crew", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const rows = db.prepare(`
    SELECT u.id, u.name, u.handle, u.avatar_id, u.avatar_url, u.can_drink,
           s.id AS session_id, s.starts_at, sp.name AS spot_name
    FROM sessions s
    JOIN rsvps r1 ON r1.session_id = s.id AND r1.user_id = ? AND r1.status = 'going'
    JOIN rsvps r2 ON r2.session_id = s.id AND r2.user_id != ? AND r2.status = 'going'
    JOIN users u ON u.id = r2.user_id
    LEFT JOIN spots sp ON sp.id = s.spot_id
    WHERE s.status = 'closed'
    ORDER BY s.starts_at DESC
  `).all(uid, uid);
  const seen = new Set();
  res.json(rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))));
});

// Discover users for the Find Friends Stack
app.get("/api/users/discover", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const users = db.prepare(`
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
  `).all(uid, uid, uid, uid, uid, uid, uid, uid, uid, uid);

  res.json({ users });
});

// Send a friend request by handle (name#12345) or by target_user_id
app.post("/api/friends/request", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const { handle, target_user_id } = req.body ?? {};
  let target = null;
  if (handle) {
    const raw = String(handle).trim();
    // Validate tag format: letters/numbers/symbols#digits(1-5)
    // "uwiandev#9999 the maximum number slots should only be 5, so uwiandev#12345 and it should be limited to numbers only"
    const match = raw.match(/^([\w.-]{2,24})#(\d{1,5})$/i);
    if (!match) {
      return res.status(400).json({ error: "Invalid ID format. Use name#12345 (up to 5 numbers only)." });
    }
    target = db.prepare("SELECT id, name, handle FROM users WHERE LOWER(handle) = LOWER(?)").get(raw);
  } else if (target_user_id) {
    target = db.prepare("SELECT id, name, handle FROM users WHERE id = ?").get(Number(target_user_id));
  }

  if (!target) return res.status(404).json({ error: "User not found. Check the ID tag and try again." });
  if (target.id === uid) return res.status(400).json({ error: "You cannot add yourself as a friend." });

  const existing = db.prepare(`
    SELECT * FROM friends
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).get(uid, target.id, target.id, uid);

  if (existing) {
    if (existing.status === "accepted") {
      return res.status(400).json({ error: `You and ${target.name} are already friends!` });
    }
    if (existing.status === "pending") {
      // If the target had requested us first, auto-accept immediately!
      if (existing.user_id === target.id) {
        db.prepare("UPDATE friends SET status='accepted', updated_at=datetime('now') WHERE id=?").run(existing.id);
        return res.json({ ok: true, status: "accepted", message: `You are now friends with ${target.name}!` });
      }
      return res.status(400).json({ error: "Friend request already sent." });
    }
    // If previously rejected, allow re-requesting as pending
    db.prepare("UPDATE friends SET user_id=?, friend_id=?, status='pending', updated_at=datetime('now') WHERE id=?")
      .run(uid, target.id, existing.id);
  } else {
    db.prepare("INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')").run(uid, target.id);
  }

  const sender = me(req);
  notify(target.id, "friend_request", {
    from_id: uid,
    from_name: sender?.name ?? "Someone",
    handle: sender?.handle
  });

  res.json({ ok: true, status: "pending", message: `Friend request sent to ${target.name} (${target.handle})!` });
});

// Accept incoming friend request
app.post("/api/friends/:id/accept", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const reqId = Number(req.params.id);
  const row = db.prepare("SELECT * FROM friends WHERE id = ?").get(reqId);
  if (!row || row.friend_id !== uid) return res.status(403).json({ error: "Request not found or unauthorized." });

  db.prepare("UPDATE friends SET status='accepted', updated_at=datetime('now') WHERE id=?").run(reqId);
  const sender = db.prepare("SELECT name FROM users WHERE id=?").get(row.user_id);
  notify(row.user_id, "friend_accepted", {
    from_id: uid,
    from_name: me(req)?.name ?? "Someone"
  });
  res.json({ ok: true, message: `Connected with ${sender?.name ?? "friend"}!` });
});

// Reject incoming friend request
app.post("/api/friends/:id/reject", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const reqId = Number(req.params.id);
  const row = db.prepare("SELECT * FROM friends WHERE id = ?").get(reqId);
  if (!row || (row.friend_id !== uid && row.user_id !== uid)) return res.status(403).json({ error: "Unauthorized." });

  db.prepare("UPDATE friends SET status='rejected', updated_at=datetime('now') WHERE id=?").run(reqId);
  res.json({ ok: true });
});

// Remove/unfriend
app.delete("/api/friends/:id", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const reqId = Number(req.params.id);
  const row = db.prepare("SELECT * FROM friends WHERE id = ?").get(reqId);
  if (!row || (row.friend_id !== uid && row.user_id !== uid)) return res.status(403).json({ error: "Unauthorized." });

  db.prepare("DELETE FROM friends WHERE id=?").run(reqId);
  res.json({ ok: true });
});

const TOS_VERSION = "2026-10-13";

// ---------- terms of service (gate in front of ID collection) ----------
// We do not accept a government ID from anyone who has not agreed to the terms,
// and acceptance has to be provable after the fact, so it is stamped, not just
// flashed past.
app.post("/api/me/accept-tos", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const acceptedAt = db.prepare("SELECT tos_accepted_at FROM users WHERE id=?").get(uid)?.tos_accepted_at ?? null;
  db.prepare("UPDATE users SET tos_accepted_at=datetime('now') WHERE id=?").run(uid);
  res.json({ ok: true, accepted_at: acceptedAt, version: TOS_VERSION });
});

app.get("/api/me/tos", requireAuth, (req, res) => {
  const row = db.prepare("SELECT tos_accepted_at FROM users WHERE id=?").get(req.session.uid);
  res.json({ accepted: !!row?.tos_accepted_at, accepted_at: row?.tos_accepted_at ?? null, version: TOS_VERSION });
});

// ---------- verification moderation ----------
// Submit / update verification
app.post("/api/me/submit-verification", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const tos = db.prepare("SELECT tos_accepted_at FROM users WHERE id=?").get(uid)?.tos_accepted_at;
  if (!tos) return res.status(403).json({ error: "Please accept the Terms of Service first." });
  const { id_type, id_number, full_name_on_id, birthdate_on_id, id_photo } = req.body ?? {};
  if (!full_name_on_id || !birthdate_on_id) return res.status(400).json({ error: "Full name and birthdate on ID are required." });
  if (!id_photo) return res.status(400).json({ error: "A photo of your ID is required." });
  if (!String(id_photo).startsWith("data:image/")) return res.status(400).json({ error: "Invalid photo format." });
  if (id_photo.length > 11_000_000) return res.status(400).json({ error: "Photo is too large. Please use a smaller image." });
  const validTypes = ["school_id", "drivers_license", "passport", "national_id", "umid", "sss", "philhealth"];
  const type = validTypes.includes(id_type) ? id_type : "school_id";
  db.prepare(`INSERT INTO verification_submissions (user_id,id_type,id_number,full_name_on_id,birthdate_on_id,id_photo,status,submitted_at)
    VALUES (?,?,?,?,?,?,'pending',datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      id_type=excluded.id_type, id_number=excluded.id_number,
      full_name_on_id=excluded.full_name_on_id, birthdate_on_id=excluded.birthdate_on_id,
      id_photo=excluded.id_photo,
      status='pending', submitted_at=datetime('now'), reviewed_at=NULL, rejection_note=NULL`
  ).run(uid, type, id_number ?? null, full_name_on_id, birthdate_on_id, id_photo);
  res.json({ ok: true, message: "Verification submitted. An admin will review within 24 hours." });
});

// Get own verification status
app.get("/api/me/verification-status", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const sub = db.prepare("SELECT id_type, status, submitted_at, reviewed_at, rejection_note FROM verification_submissions WHERE user_id=?").get(uid);
  const tos = db.prepare("SELECT tos_accepted_at FROM users WHERE id=?").get(uid)?.tos_accepted_at ?? null;
  res.json({ submission: sub ?? null, tos_accepted: !!tos, tos_accepted_at: tos, tos_version: TOS_VERSION });
});

// Admin: list pending verifications
app.get("/api/admin/verifications", requireAuth, (req, res) => {
  const uid = req.session.uid;
  if (!isAnyAdmin(uid)) return res.status(403).json({ error: "Admins only." });
  const rows = db.prepare(`
    SELECT vs.user_id, vs.id_type, vs.id_number, vs.full_name_on_id, vs.birthdate_on_id,
           vs.id_photo, vs.status, vs.submitted_at, vs.reviewed_at, vs.rejection_note,
           u.name, u.email, u.created_at AS user_created_at
    FROM verification_submissions vs JOIN users u ON u.id=vs.user_id
    WHERE vs.status IN ('pending','under_review')
    ORDER BY vs.submitted_at ASC LIMIT 50
  `).all();
  res.json(rows);
});

// Admin: approve verification
app.post("/api/admin/verifications/:uid/approve", requireAuth, (req, res) => {
  const adminUid = req.session.uid;
  if (!isAnyAdmin(adminUid)) return res.status(403).json({ error: "Admins only." });
  const targetUid = Number(req.params.uid);
  db.prepare("UPDATE verification_submissions SET status='approved', reviewed_at=datetime('now'), reviewed_by=? WHERE user_id=?").run(adminUid, targetUid);
  notify(targetUid, "verification_approved", { message: "Your ID verification has been approved! You now have full trust status." });
  res.json({ ok: true });
});

// Admin: reject verification
app.post("/api/admin/verifications/:uid/reject", requireAuth, (req, res) => {
  const adminUid = req.session.uid;
  if (!isAnyAdmin(adminUid)) return res.status(403).json({ error: "Admins only." });
  const targetUid = Number(req.params.uid), note = (req.body?.note ?? "").trim();
  if (!note) return res.status(400).json({ error: "Rejection note is required." });
  db.prepare("UPDATE verification_submissions SET status='rejected', reviewed_at=datetime('now'), reviewed_by=?, rejection_note=? WHERE user_id=?").run(adminUid, note, targetUid);
  notify(targetUid, "verification_rejected", { message: `ID verification not approved: ${note}` });
  res.json({ ok: true });
});

// Flag / report a user
app.post("/api/users/:uid/flag", requireAuth, (req, res) => {
  const reporterUid = req.session.uid;
  const flaggedUid = Number(req.params.uid);
  if (flaggedUid === reporterUid) return res.status(400).json({ error: "You cannot flag yourself." });
  const { reason, category, group_id } = req.body ?? {};
  if (!reason || reason.trim().length < 10) return res.status(400).json({ error: "Reason must be at least 10 characters." });
  const validCats = ["misconduct", "fake_id", "harassment", "spam", "other"];
  const cat = validCats.includes(category) ? category : "other";
  db.prepare("INSERT INTO admin_flags (reporter_id,flagged_uid,group_id,reason,category) VALUES (?,?,?,?,?)").run(reporterUid, flaggedUid, group_id ?? null, reason.trim(), cat);
  // Notify group admins
  if (group_id) {
    const admins = db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND role='admin' AND status='active'").all(Number(group_id));
    for (const a of admins) notify(a.user_id, "flag_report", { flagged_uid: flaggedUid, message: `A user has been reported in your crew.` });
  }
  res.json({ ok: true, message: "Report submitted. Crew admins and the Uwian team have been notified." });
});

// Admin: list open flags
app.get("/api/admin/flags", requireAuth, (req, res) => {
  const uid = req.session.uid;
  if (!isAnyAdmin(uid)) return res.status(403).json({ error: "Admins only." });
  const rows = db.prepare(`
    SELECT af.*, u1.name AS reporter_name, u2.name AS flagged_name, u2.email AS flagged_email
    FROM admin_flags af
    JOIN users u1 ON u1.id=af.reporter_id
    JOIN users u2 ON u2.id=af.flagged_uid
    WHERE af.status='open'
    ORDER BY af.created_at DESC LIMIT 50
  `).all();
  res.json(rows);
});

// Admin: review flag
app.post("/api/admin/flags/:id/review", requireAuth, (req, res) => {
  const adminUid = req.session.uid;
  if (!isAnyAdmin(adminUid)) return res.status(403).json({ error: "Admins only." });
  const { action, note } = req.body ?? {}; // action: 'reviewed' | 'dismissed'
  if (!["reviewed", "dismissed"].includes(action)) return res.status(400).json({ error: "action must be 'reviewed' or 'dismissed'." });
  db.prepare("UPDATE admin_flags SET status=?, admin_note=?, reviewed_at=datetime('now') WHERE id=?").run(action, note ?? null, Number(req.params.id));
  res.json({ ok: true });
});

// ---------- profile change requests (admin-approved name/email) ----------
const profileIsAdmin = (uid) => isAnyAdmin(uid);

app.post("/api/me/profile-request", requireAuth, (req, res) => {
  const uid = req.session.uid;
  const { field, value } = req.body ?? {};
  if (!["name", "email"].includes(field)) return res.status(400).json({ error: "field must be 'name' or 'email'." });
  const v = String(value ?? "").trim();
  if (field === "name") {
    if (v.length < 1 || v.length > 60) return res.status(400).json({ error: "Name must be 1–60 characters." });
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return res.status(400).json({ error: "Enter a valid email address." });
    if (db.prepare("SELECT id FROM users WHERE email=? AND id!=?").get(v, uid))
      return res.status(409).json({ error: "That email is already in use." });
  }
  const current = db.prepare("SELECT name, email FROM users WHERE id=?").get(uid);
  if (current[field] === v) return res.status(400).json({ error: "That's already your current value." });
  const dup = db.prepare("SELECT id FROM profile_change_requests WHERE user_id=? AND field=? AND status='pending'").get(uid, field);
  if (dup) return res.status(409).json({ error: "You already have a pending request for this. Wait for review first." });
  const r = db.prepare(`INSERT INTO profile_change_requests (user_id,field,old_value,new_value)
    VALUES (?,?,?,?)`).run(uid, field, current[field], v);
  res.json({ id: r.lastInsertRowid });
});

app.get("/api/me/profile-requests", requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT pr.*, u.name AS user_name FROM profile_change_requests pr
    JOIN users u ON u.id=pr.user_id WHERE pr.user_id=? ORDER BY pr.id DESC LIMIT 20`).all(req.session.uid));
});

app.get("/api/admin/profile-requests", requireAuth, (req, res) => {
  if (!profileIsAdmin(req.session.uid)) return res.status(403).json({ error: "Admins only." });
  res.json(db.prepare(`SELECT pr.*, u.name AS user_name, u.email AS user_email FROM profile_change_requests pr
    JOIN users u ON u.id=pr.user_id WHERE pr.status='pending' ORDER BY pr.submitted_at ASC LIMIT 50`).all());
});

app.post("/api/admin/profile-requests/:id/review", requireAuth, (req, res) => {
  const adminUid = req.session.uid;
  if (!profileIsAdmin(adminUid)) return res.status(403).json({ error: "Admins only." });
  const { action, note } = req.body ?? {}; // action: 'approved' | 'rejected'
  if (!["approved", "rejected"].includes(action)) return res.status(400).json({ error: "action must be 'approved' or 'rejected'." });
  const pr = db.prepare("SELECT * FROM profile_change_requests WHERE id=?").get(Number(req.params.id));
  if (!pr) return res.status(404).json({ error: "Request not found." });
  if (pr.status !== "pending") return res.status(409).json({ error: "Already reviewed." });
  if (action === "approved") {
    if (pr.field === "email" && db.prepare("SELECT id FROM users WHERE email=? AND id!=?").get(pr.new_value, pr.user_id))
      return res.status(409).json({ error: "That email was taken while waiting. Reject instead." });
    db.prepare(`UPDATE users SET ${pr.field === "name" ? "name" : "email"}=? WHERE id=?`).run(pr.new_value, pr.user_id);
    db.prepare("UPDATE profile_change_requests SET status='approved', reviewed_at=datetime('now'), reviewed_by=?, review_note=? WHERE id=?")
      .run(adminUid, note ?? null, pr.id);
    notify(pr.user_id, "verification_approved", { message: `Your ${pr.field} change to "${pr.new_value}" was approved.` });
  } else {
    if (!(note ?? "").trim()) return res.status(400).json({ error: "A rejection note is required." });
    db.prepare("UPDATE profile_change_requests SET status='rejected', reviewed_at=datetime('now'), reviewed_by=?, review_note=? WHERE id=?")
      .run(adminUid, note.trim(), pr.id);
    notify(pr.user_id, "verification_rejected", { message: `Your ${pr.field} change was not approved: ${note.trim()}` });
  }
  res.json({ ok: true });
});

const PORT = process.env.PORT ?? 3000;
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === pathToFileURL(process.argv[1]).href)) {
  // serve the React client (vite build output) with an SPA fallback.
  // API routes are registered above, so this only catches non-/api paths.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.join(here, "../../web/dist");
  app.use(express.static(dist));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) =>
    res.sendFile(path.join(dist, "index.html")));
  setInterval(() => { try { runEscalation(); } catch {} }, 60_000).unref(); // lazy cron, configurable thresholds live in DB
  app.listen(PORT, () => console.log(`Uwian server: http://localhost:${PORT}`));
}
export default app;

