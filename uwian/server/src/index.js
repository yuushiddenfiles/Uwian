// Uwian server — friendly by design.
// Privacy rule enforced at the API layer: limit_counters rows are ONLY ever
// returned to their owner, including for admins. No endpoint exposes another
// person's count. See docs/privacy.md.
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieSession from "cookie-session";
import { db } from "./db.js";
import { ageOk, hashPw, checkPw } from "./lib/authz.js";
import { splitExpense } from "../../shared/split.js";
import { computeBalances, settle, ledgerFromTransfers } from "../../shared/settle.js";

const app = express();
app.use(express.json());
app.use(cookieSession({ name: "uwian", keys: [process.env.UWIAN_SECRET ?? "dev-secret-change-me"], maxAge: 30 * 864e5 }));

const me = (req) => req.session.uid ? db.prepare("SELECT id,name,email,can_drink FROM users WHERE id=?").get(req.session.uid) : null;
const requireAuth = (req, res, next) => (me(req) ? next() : res.status(401).json({ error: "Mag-log in muna." }));
const membership = (groupId, uid) =>
  db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=? AND status='active'").get(groupId, uid);
const requireMember = (req, res, next) => {
  const u = me(req); const g = Number(req.params.gid);
  return membership(g, u.id) ? next() : res.status(403).json({ error: "Hindi ka kasama ng grupo na ito." });
};
const requireAdmin = (req, res, next) => {
  const u = me(req); const g = Number(req.params.gid);
  const m = membership(g, u.id);
  return m && m.role === "admin" ? next() : res.status(403).json({ error: "Admin lang pwede." });
};
const notify = (userId, kind, payload) =>
  db.prepare("INSERT INTO notifications (user_id,kind,payload) VALUES (?,?,?)").run(userId, kind, JSON.stringify(payload));
const audit = (sessionId, actorId, action, detail) =>
  db.prepare("INSERT INTO audit_log (session_id,actor_id,action,detail) VALUES (?,?,?,?)").run(sessionId, actorId, action, JSON.stringify(detail ?? null));

// ---------- auth ----------
app.post("/api/signup", (req, res) => {
  const { name, email, password, birthdate } = req.body ?? {};
  if (!name || !email || !password) return res.status(400).json({ error: "Kulang ang impo." });
  if (password.length < 8) return res.status(400).json({ error: "Password: 8+ characters." });
  if (!ageOk(birthdate)) return res.status(400).json({ error: "Kailangan 18 pataas para gumamit. (Self-declared — tingnan docs/privacy.md)" });
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) return res.status(409).json({ error: "Nagagamit na ang email na iyan." });
  const r = db.prepare("INSERT INTO users (name,email,password_hash,birthdate) VALUES (?,?,?,?)")
    .run(name, email, hashPw(password), birthdate);
  req.session.uid = r.lastInsertRowid;
  res.json({ ok: true });
});
app.post("/api/login", (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(req.body?.email);
  if (!u || !checkPw(req.body.password ?? "", u.password_hash)) return res.status(401).json({ error: "Mali ang email o password." });
  req.session.uid = u.id; res.json({ ok: true });
});
app.post("/api/logout", (req, res) => { req.session = null; res.json({ ok: true }); });
app.get("/api/me", (req, res) => res.json({ user: me(req) ?? null }));

// ---------- groups / invites / vouching ----------
app.post("/api/groups", requireAuth, (req, res) => {
  const g = db.prepare("INSERT INTO groups (name,created_by) VALUES (?,?)").run(req.body.name, req.session.uid);
  db.prepare("INSERT INTO group_members (group_id,user_id,role) VALUES (?,?, 'admin')").run(g.lastInsertRowid, req.session.uid);
  res.json({ id: g.lastInsertRowid });
});
app.get("/api/groups", requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT g.*, gm.role FROM groups g JOIN group_members gm ON gm.group_id=g.id
    WHERE gm.user_id=? AND gm.status='active'`).all(req.session.uid));
});
// Invite link: creates a pending guest row when the invited user opens it.
app.post("/api/groups/:gid/invite", requireMember, (req, res) => {
  const code = db.prepare("SELECT * FROM groups WHERE id=?").get(Number(req.params.gid));
  res.json({ invite_url: `/join/${code.id}`, note: "I-share sa barkada lang. Dadaan sa vouch bago makapasok." });
});
app.post("/api/groups/:gid/join", requireAuth, (req, res) => {
  const gid = Number(req.params.gid);
  if (membership(gid, req.session.uid)) return res.json({ status: "active" });
  const existing = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(gid, req.session.uid);
  if (existing) return res.json({ status: existing.status });
  db.prepare("INSERT INTO group_members (group_id,user_id,role,status) VALUES (?,?,'member','pending_guest')").run(gid, req.session.uid);
  res.json({ status: "pending_guest", message: "Hihintayin ang vouch ng mga kasama." });
});
app.post("/api/groups/:gid/vouch/:guestUid", requireMember, (req, res) => {
  const gid = Number(req.params.gid), guest = Number(req.params.guestUid), voucher = req.session.uid;
  const v = db.prepare("SELECT can_vouch FROM group_members WHERE group_id=? AND user_id=?").get(gid, voucher);
  if (!v.can_vouch) return res.status(403).json({ error: "Wala nang karapatang mag-vouch ang account mo sa grupong ito. (S6 strikes)" });
  if (voucher === guest) return res.status(400).json({ error: "Hindi mo sarili mo pwedeng i-vouch." });
  db.prepare("INSERT OR IGNORE INTO vouches (group_id,guest_user_id,voucher_id) VALUES (?,?,?)").run(gid, guest, voucher);
  const need = db.prepare("SELECT vouches_required FROM groups WHERE id=?").get(gid).vouches_required;
  const have = db.prepare("SELECT COUNT(*) c FROM vouches WHERE group_id=? AND guest_user_id=?").get(gid, guest).c;
  if (have >= need) {
    db.prepare("UPDATE group_members SET status='active' WHERE group_id=? AND user_id=?").run(gid, guest);
    notify(guest, "vouch", { group_id: gid, accepted: true, message: "Pasok ka na sa grupo. Welcome!" });
  }
  res.json({ have, need, accepted: have >= need });
});
// S6: admin removes member with written reason → vouchers get strikes.
app.post("/api/groups/:gid/remove/:uid", requireAdmin, (req, res) => {
  const gid = Number(req.params.gid), uid = Number(req.params.uid), reason = (req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ error: "Kailangan ng nakasulat na dahilan." });
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
  const { starts_at, spot_id, designated_driver_id } = req.body;
  const r = db.prepare("INSERT INTO sessions (group_id,spot_id,starts_at,designated_driver_id,status) VALUES (?,?,?,?, 'planning')")
    .run(Number(req.params.gid), spot_id ?? null, starts_at, designated_driver_id ?? null);
  res.json({ id: r.lastInsertRowid });
});
app.patch("/api/sessions/:sid", requireAuth, (req, res) => {
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(Number(req.params.sid));
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Bawal." });
  const { status, designated_driver_id, uwian_deadline } = req.body;
  if (status === "open" && uwian_deadline === undefined) {
    db.prepare("UPDATE sessions SET status='open', designated_driver_id=COALESCE(?,designated_driver_id) WHERE id=?")
      .run(designated_driver_id ?? null, s.id);
  } else if (status) {
    db.prepare("UPDATE sessions SET status=?, uwian_deadline=COALESCE(?,uwian_deadline) WHERE id=?")
      .run(status, uwian_deadline ?? null, s.id);
    if (status === "wrapped") pairUp(s); // S2 buddy pairing fires on "Uwian na"
  }
  res.json({ ok: true });
});
app.post("/api/sessions/:sid/rsvp", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Bawal." });
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
  if (!m) return res.status(403).json({ error: "Bawal." });
  if (s.status === "closed") return res.status(409).json({ error: "Sarado na ang tab — hilingin sa admin na i-reopen." });
  const { amount_centavos, description, is_alcohol = 0, paid_by, participants } = req.body;
  if (!Number.isInteger(amount_centavos) || amount_centavos < 0) return res.status(400).json({ error: "Integer centavos lang." });
  let ppl = participants;
  if (!ppl || ppl.length === 0) {
    // Friendly auto-defaults: alcohol excludes DD + non-drinkers; food includes everyone in.
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
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Bawal." });
  const afterClose = s.status === "closed" ? 1 : 0;
  if (afterClose && !requireAdminGate(s)) return res.status(403).json({ error: "Pag sarado na ang tab, admin lang ang pwedeng mag-edit (i-reopen muna)." });
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
  res.json({ ok: true, note: "Ang mga naka-confirm na bayad nanatili. Iba pa, bubuoin ulit pag-close." });
});
// payment confirmation flow: payer claims → receiver confirms/disputes
app.post("/api/settlements/:id/claim-paid", requireAuth, (req, res) => {
  const t = db.prepare("SELECT * FROM settlements WHERE id=?").get(Number(req.params.id));
  if (t.from_user !== req.session.uid) return res.status(403).json({ error: "Ang nagbabayad lang pwedeng mag-claim." });
  db.prepare("UPDATE settlements SET status='paid_claimed' WHERE id=?").run(t.id);
  notify(t.to_user, "payment_claim", { settlement_id: t.id, message: "Sabi ng kabarkada mo, bayad na raw. Confirm mo na." });
  res.json({ ok: true });
});
app.post("/api/settlements/:id/confirm", requireAuth, (req, res) => {
  const t = db.prepare("SELECT * FROM settlements WHERE id=?").get(Number(req.params.id));
  if (t.to_user !== req.session.uid) return res.status(403).json({ error: "Ang tumatanggap lang pwedeng kumpirmahin." });
  db.prepare("UPDATE settlements SET status='confirmed' WHERE id=?").run(t.id);
  res.json({ ok: true });
});
app.post("/api/settlements/:id/dispute", requireAuth, (req, res) => {
  const t = db.prepare("SELECT * FROM settlements WHERE id=?").get(Number(req.params.id));
  if (![t.from_user, t.to_user].includes(req.session.uid)) return res.status(403).json({ error: "Dalawa lang ang may-kati dito." });
  const note = (req.body?.note ?? "").trim();
  if (!note) return res.status(400).json({ error: "Isulat kung bakit disputed para makita ng admin." });
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
    const key = gm.direction_tag_id ?? "walang-direksyon";
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
        .run(s.id, grp[0]); // placeholder self-pair so nobody is orphaned (UI shows "wala pang buddy — hingi sa admin")
    }
  }
}
app.post("/api/sessions/:sid/checkin", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Bawal." });
  const mode = req.body.mode ?? "other";
  db.prepare(`INSERT INTO checkins (session_id,user_id,mode,home_confirmed_at) VALUES (?,?,?, datetime('now'))
    ON CONFLICT(session_id,user_id) DO UPDATE SET mode=excluded.mode, home_confirmed_at=datetime('now'), flag_stage=0`)
    .run(sid, req.session.uid, mode);
  // friendly nudge: own-drive while not being THE designated driver → ask for ride offers, never block
  if (mode === "own_drive" && s.designated_driver_id !== req.session.uid) {
    const mates = db.prepare("SELECT user_id FROM rsvps WHERE session_id=? AND status='going' AND user_id!=?").all(sid, req.session.uid);
    for (const mt of mates) notify(mt.user_id, "ride_request", { session_id: sid, message: "Magda-drive siya. May saklaw ka ba?" });
  }
  res.json({ ok: true });
});
app.post("/api/buddies/:sid/:a/:b/clear-flag", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const pair = db.prepare("SELECT * FROM buddy_pairs WHERE session_id=? AND user_a=? AND user_b=?").get(sid, Number(req.params.a), Number(req.params.b));
  if (!pair) return res.status(404).json({ error: "Wala ang pair na iyan." });
  const members = [pair.user_a, pair.user_b, pair.user_c].filter((x) => x != null && x > 0);
  if (!members.includes(req.session.uid)) return res.status(403).json({ error: "Buddy lang ng pair na iyan." });
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
      if (stage === 1) notify(user_id, "uwian_reminder", { message: "Umuwi ka na ba? I-tap ang check-in." });
      if (stage === 2) {
        const pair = db.prepare("SELECT * FROM buddy_pairs WHERE session_id=? AND (user_a=? OR user_b=? OR user_c=?)").get(s.id, user_id, user_id, user_id);
        for (const b of [pair?.user_a, pair?.user_b, pair?.user_c].filter((x) => x && x !== user_id && x > 0))
          notify(b, "buddy_alert", { message: "Hindi pa nagco-check-in ang buddy mo.", user_id });
      }
      if (stage === 3) {
        const admins = db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND role='admin' AND status='active'").all(s.group_id);
        for (const a of admins) notify(a.user_id, "escalation", { session_id: s.id, user_id, message: "Wala pa ring balita. Tingnan ang group page." });
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
    ? "Abot ka na sa hangganan mo. Ayusin na ang pang-uwi?"
    : "Malapit ka na sa hangganan mo. Ayusin na ang pang-uwi?", open_checkin: true });
  res.json({ count: row.count, lim: row.lim, level }); // returned ONLY to this user's own request
});
app.get("/api/sessions/:sid/limit", requireAuth, (req, res) => {
  // privacy invariant: always filtered by the caller's own id — no admin bypass exists
  res.json(db.prepare("SELECT lim,count FROM limit_counters WHERE session_id=? AND user_id=?")
    .get(Number(req.params.sid), req.session.uid) ?? { lim: null, count: 0 });
});

// ---------- spots / tambayan map (S5 freshness) ----------
app.get("/api/groups/:gid/spots", requireMember, (req, res) => {
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
app.post("/api/spots/:id/confirm", requireAuth, (req, res) => {
  const sp = db.prepare("SELECT * FROM spots WHERE id=?").get(Number(req.params.id));
  if (!membership(sp.group_id, req.session.uid)) return res.status(403).json({ error: "Bawal." });
  const answer = ["yes", "no", "changed"].includes(req.body.answer) ? req.body.answer : "yes";
  db.prepare("INSERT INTO spot_confirmations (spot_id,user_id,answer,new_details) VALUES (?,?,?,?)")
    .run(sp.id, req.session.uid, answer, req.body.new_details ?? null);
  if (answer !== "no") db.prepare("UPDATE spots SET last_confirmed_at=datetime('now'), closes_at=COALESCE(?,closes_at) WHERE id=?")
    .run(req.body.closes_at ?? null, sp.id);
  res.json({ ok: true });
});

// ---------- misc reads ----------
const withNames = (sql) => (params) => {
  const names = Object.fromEntries(db.prepare("SELECT id,name FROM users").all().map((u) => [u.id, u.name]));
  return sql(params).map((r) => ({ ...r, name: names[r.user_id] ?? names[r.id] ?? null }));
};
app.get("/api/sessions/:sid", requireAuth, (req, res) => {
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Bawal." });
  const { expenses, shares } = sessionExpenses(sid);
  const names = Object.fromEntries(db.prepare("SELECT id,name FROM users").all().map((u) => [u.id, u.name]));
  res.json({
    session: { ...s, designated_driver_name: s.designated_driver_id ? names[s.designated_driver_id] : null },
    spot: db.prepare("SELECT * FROM spots WHERE id=?").get(s.spot_id) ?? null,
    members: db.prepare(`SELECT gm.user_id, gm.role, gm.direction_tag_id, u.name, u.can_drink,
        dt.label AS tag FROM group_members gm JOIN users u ON u.id=gm.user_id
        LEFT JOIN direction_tags dt ON dt.id=gm.direction_tag_id
        WHERE gm.group_id=? AND gm.status='active'`).all(s.group_id),
    rsvps: db.prepare("SELECT r.*, u.name FROM rsvps r JOIN users u ON u.id=r.user_id WHERE r.session_id=?").all(sid),
    expenses: expenses.map((e) => ({ ...e, payer_name: names[e.paid_by] })), shares,
    settlements: db.prepare("SELECT * FROM settlements WHERE session_id=? AND status!='voided'").all(sid)
      .map((t) => ({ ...t, from_name: names[t.from_user], to_name: names[t.to_user] })),
    checkins: db.prepare("SELECT c.session_id,c.user_id,u.name,c.mode,c.home_confirmed_at,c.flag_stage,c.ride_offer_from FROM checkins c JOIN users u ON u.id=c.user_id WHERE c.session_id=?").all(sid),
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
        dt.label AS tag, u.name, u.email, u.can_drink
      FROM group_members gm JOIN users u ON u.id=gm.user_id
      LEFT JOIN direction_tags dt ON dt.id=gm.direction_tag_id
      WHERE gm.group_id=? AND gm.status IN ('active','pending_guest')`).all(gid),
    pending: db.prepare(`SELECT gm.user_id, u.name,
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
  if (!label) return res.status(400).json({ error: "Kulang ang pangalan ng direksyon." });
  const r = db.prepare("INSERT INTO direction_tags (group_id,label) VALUES (?,?)").run(Number(req.params.gid), label);
  res.json({ id: r.lastInsertRowid });
});
app.put("/api/me/direction", requireAuth, (req, res) => {
  // member picks their own direction tag per group
  const gid = Number(req.body?.group_id), tagId = req.body?.direction_tag_id ?? null;
  if (!membership(gid, req.session.uid)) return res.status(403).json({ error: "Bawal." });
  db.prepare("UPDATE group_members SET direction_tag_id=? WHERE group_id=? AND user_id=?").run(tagId, gid, req.session.uid);
  res.json({ ok: true });
});
app.post("/api/buddies/:sid/:a/:b/offer-ride", requireAuth, (req, res) => {
  // friendly response to "may magda-drive": someone offers a ride (never blocks anyone)
  const sid = Number(req.params.sid);
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(sid);
  if (!membership(s.group_id, req.session.uid)) return res.status(403).json({ error: "Bawal." });
  const uid = Number(req.params.a);
  db.prepare("UPDATE checkins SET ride_offer_from=? WHERE session_id=? AND user_id=?").run(req.session.uid, sid, uid);
  notify(uid, "ride_offer", { message: "May nag-alok ng sakay sa iyo.", session_id: sid });
  res.json({ ok: true });
});

const PORT = process.env.PORT ?? 3000;
if (import.meta.url === `file://${process.argv[1]}`) {
  // serve the client (plain ES modules + one vendored lib for the map)
  const here = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(here, "../../client/public")));
  app.get(/^\/(login|signup|groups|join\/.+|g\/.+|s\/.+|map)/, (_req, res) =>
    res.sendFile(path.join(here, "../../client/public/index.html")));
  setInterval(() => { try { runEscalation(); } catch {} }, 60_000).unref(); // lazy cron, configurable thresholds live in DB
  app.listen(PORT, () => console.log(`Uwian server: http://localhost:${PORT}`));
}
export default app;
