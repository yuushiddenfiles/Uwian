import { $, api, h, toast, openSheet, avatar, fmtPeso, lampFor, MODES, timeAgo, pesoToCents } from "./util.js";

let ME_ = null;
export const me = () => ME_;
export async function loadMe() { ME_ = (await api("/api/me")).user; return ME_; }

/* ---------------- auth ---------------- */
export function pageLogin() {
  const email = h("input", { placeholder: "email address", type: "email", id: "login-email" });
  const pw    = h("input", { placeholder: "password", type: "password", id: "login-pw" });
  return h("div", { class: "auth-card enter" },
    h("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:8px" },
      h("div", { style: "width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#6c7fff,#a78bfa);display:grid;place-items:center;flex:none" },
        h("svg", { viewBox: "0 0 32 32", width: "22", height: "22", fill: "none", stroke: "#fff", "stroke-width": "2.2", "stroke-linejoin": "round" },
          h("path", { d: "M6 17 16 7l10 10v9a2 2 0 0 1-2 2h-5v-7h-4v7H8a2 2 0 0 1-2-2z" }))),
      h("span", { style: "font:700 24px 'Space Grotesk',sans-serif;background:linear-gradient(135deg,#6c7fff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text" }, "uwian")),
    h("h2", {}, "Welcome back"),
    h("p", { class: "sub" }, "Log in to your account to continue."),
    h("label", { class: "f", for: "login-email" }, "Email"), email,
    h("label", { class: "f", for: "login-pw" }, "Password"), pw,
    h("button", { class: "btn primary", style: "width:100%;margin-top:20px;justify-content:center", onclick: async () => {
        try { await api("/api/login", { email: email.value, password: pw.value }); location.hash = "/groups"; }
        catch (e) { toast(e.message, true); pw.classList.add("shake"); setTimeout(() => pw.classList.remove("shake"), 500); }
      } }, "Sign in"),
    h("hr"),
    h("p", { style: "text-align:center;margin-top:14px;font-size:14px;color:var(--text-2)" },
      "Don't have an account? ", h("a", { href: "#/signup", style: "color:var(--indigo)" }, "Sign up")),
    h("hr"),
    h("p", { class: "demo" }, "Demo: ana@barkada.demo … ela@barkada.demo / BarkadaDemo!2026"));
}

export function pageSignup() {
  const name  = h("input", { placeholder: "Your name", id: "su-name" });
  const email = h("input", { placeholder: "email address", type: "email", id: "su-email" });
  const pw    = h("input", { placeholder: "password (8+ characters)", type: "password", id: "su-pw" });
  const bday  = h("input", { type: "date", id: "su-bday" });
  return h("div", { class: "auth-card enter" },
    h("h2", {}, "Create an account"),
    h("p", { class: "sub" }, "Must be 18 or older. Birthdate is self-declared — see docs/privacy.md for details."),
    h("label", { class: "f", for: "su-name" }, "Name"), name,
    h("label", { class: "f", for: "su-email" }, "Email"), email,
    h("label", { class: "f", for: "su-pw" }, "Password"), pw,
    h("label", { class: "f", for: "su-bday" }, "Birthdate (18+)"), bday,
    h("button", { class: "btn primary", style: "width:100%;margin-top:20px;justify-content:center", onclick: async () => {
        try {
          await api("/api/signup", { name: name.value, email: email.value, password: pw.value, birthdate: bday.value });
          location.hash = "/groups";
        }
        catch (e) { toast(e.message, true); }
      } }, "Create account"),
    h("p", { style: "text-align:center;margin-top:14px;font-size:14px;color:var(--text-2)" },
      "Already have an account? ", h("a", { href: "#/login", style: "color:var(--indigo)" }, "Sign in")));
}

/* ---------------- groups list ---------------- */
export async function pageGroups() {
  const gs = await api("/api/groups");
  const box = h("div", { class: "enter" },
    h("div", { class: "panel" },
      h("div", { class: "row spread", style: "margin-bottom:4px" },
        h("h2", {}, "My Crews"),
        (() => {
          const n = h("input", { placeholder: "New crew name…", id: "new-group-name", style: "max-width:220px" });
          return h("div", { class: "row" }, n,
            h("button", { class: "btn primary", onclick: async () => {
                if (!n.value.trim()) return toast("Give your crew a name first.", true);
                const r = await api("/api/groups", { name: n.value.trim() });
                location.hash = `/g/${r.id}`;
              } }, "+ New crew"));
        })()),
      gs.length === 0
        ? h("div", { class: "hero-empty" },
            h("div", { class: "hero-icon" }, "🍻"),
            h("h3", {}, "No crews yet"),
            h("p", {}, "Create your first crew or ask a friend to share an invite link."))
        : h("div", {},
            ...gs.map((g) => h("div", {
              class: "list-row card-hover", style: "cursor:pointer",
              onclick: () => (location.hash = `/g/${g.id}`)
            },
              avatar(g.name),
              h("div", { class: "grow" },
                h("b", {}, g.name),
                h("div", { class: "dim" }, g.role === "admin" ? "You're an admin" : "Member")),
              h("span", { class: "chip " + (g.role === "admin" ? "primary" : "") }, g.role))))));
  return box;
}

/* ---------------- group home ---------------- */
export async function pageGroup(gid) {
  const d      = await api(`/api/groups/${gid}`);
  const ledger = await api(`/api/groups/${gid}/ledger`);
  const spots  = await api(`/api/groups/${gid}/spots`);
  d.spotsList  = spots;
  const isAdmin = d.members.find((m) => m.user_id === me().id)?.role === "admin";
  const upcoming = d.sessions.filter((s) => s.status !== "closed").slice(0, 3);
  const el = h("div", { class: "enter" });

  // header
  el.append(h("div", { class: "panel" },
    h("div", { class: "row spread" },
      h("div", {},
        h("h2", {}, d.group.name),
        h("p", { class: "dim", style: "margin-top:-6px" }, `${d.members.length} members`)),
      h("div", { class: "row" },
        h("button", { class: "btn ghost", onclick: () => inviteFlow(gid) }, "✉ Invite"),
        isAdmin ? h("button", { class: "btn primary", onclick: () => sessionForm(gid, d) }, "+ Session") : null))));

  // vouch queue
  if (d.pending.length) el.append(h("div", { class: "panel" },
    h("h2", {}, "Vouch Queue"),
    ...d.pending.map((p) => h("div", { class: "list-row" },
      avatar(p.name),
      h("div", { class: "grow" },
        h("b", {}, p.name),
        h("div", { class: "dim" }, `${p.vouches}/${d.group.vouches_required} vouch${p.vouches !== 1 ? "es" : ""}`)),
      h("button", { class: "btn good", onclick: async () => {
          const r = await api(`/api/groups/${gid}/vouch/${p.user_id}`, {});
          toast(r.accepted ? "They're in! Welcome to the crew." : `Vouched! ${r.have}/${r.need} so far.`);
          pageGroupRerender(gid);
        } }, "Vouch in")))));

  // sessions
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Sessions"),
    upcoming.length === 0
      ? h("div", { class: "hero-empty", style: "padding:32px 0" },
          h("div", { class: "hero-icon", style: "width:56px;height:56px;font-size:24px;margin-bottom:12px" }, "🍺"),
          h("p", {}, "No upcoming sessions."))
      : null,
    ...upcoming.map((s) => h("div", {
      class: "list-row card-hover", style: "cursor:pointer",
      onclick: () => (location.hash = `/s/${s.id}`)
    },
      h("div", { class: "grow" },
        h("b", {}, new Date(s.starts_at + "Z").toLocaleString()),
        h("div", { class: "dim" }, statusLabel(s.status))),
      h("span", { class: `status-bar ${s.status}` }, statusLabel(s.status)))),
    d.sessions.filter((s) => s.status === "closed").slice(0, 3).map((s) =>
      h("div", { class: "list-row", style: "opacity:.6;cursor:pointer", onclick: () => (location.hash = `/s/${s.id}`) },
        h("div", { class: "grow" }, new Date(s.starts_at + "Z").toLocaleDateString()),
        h("span", { class: "chip" }, "Closed")))));

  // ledger
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Outstanding Balances"),
    ledger.length === 0
      ? h("p", { class: "stamp", style: "color:var(--emerald);font:700 17px var(--font-display);display:flex;align-items:center;gap:8px" },
          h("span", {}, "✔"), "All settled up!")
      : h("div", { class: "receipt" },
          ...ledger.map((t) => h("div", { class: "line" },
            h("span", {}, `${nameOf(d, t.from)} → ${nameOf(d, t.to)}`),
            h("span", { class: "money" }, fmtPeso(t.amount_centavos)))),
          h("div", { class: "line total" },
            h("span", {}, `${ledger.length} transfer${ledger.length !== 1 ? "s" : ""} (minimum)`),
            h("span", {})))));

  // members & direction tags
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Members & Directions"),
    ...d.members.map((m) => h("div", { class: "list-row" },
      avatar(m.name),
      h("div", { class: "grow" },
        h("b", {}, m.name),
        " ",
        m.can_drink ? null : h("span", { class: "chip" }, "Non-drinker"),
        " ",
        m.strikes > 0 && isAdmin ? h("span", { class: "chip red" }, `${m.strikes} strike${m.strikes !== 1 ? "s" : ""}`) : null),
      h("select", { style: "width:auto", onchange: async (e) => {
          if (m.user_id !== me().id) return toast("You can only set your own direction tag.", true), e.target.blur();
          await api("/api/me/direction", { group_id: gid, direction_tag_id: e.target.value ? Number(e.target.value) : null }, "PUT");
          toast("Direction updated — easier buddy pairing.");
        } },
        h("option", { value: "" }, "No direction"),
        ...d.tags.map((t) => h("option", { value: t.id, selected: m.direction_tag_id === t.id }, t.label))))),
    isAdmin ? h("div", { class: "row", style: "margin-top:12px" },
      (() => {
        const l = h("input", { placeholder: "Add direction tag (e.g. North, South)…", style: "max-width:240px" });
        return [l, h("button", { class: "btn", onclick: async () => {
            if (!l.value.trim()) return;
            await api(`/api/groups/${gid}/tags`, { label: l.value.trim() });
            l.value = ""; pageGroupRerender(gid);
          } }, "+ Tag")];
      })()) : null));

  // map + settings
  el.append(h("div", { class: "grid2" },
    h("div", { class: "panel card-hover", style: "cursor:pointer", onclick: () => (location.hash = `/map/${gid}`) },
      h("h2", {}, "Hangout Map"),
      h("p", { class: "dim" },
        `${spots.length} spot${spots.length !== 1 ? "s" : ""}${spots.some((s) => s.stale) ? " · some need re-confirming" : ""}`),
      h("p", { style: "margin-top:10px;color:var(--indigo);font-size:14px" }, "Open map →")),
    isAdmin ? h("div", { class: "panel" }, h("h2", {}, "Group Settings"), settingsPanel(gid, d)) : null));
  return el;
}

const statusLabel = (s) => ({ planning: "Planning", open: "Tab open", wrapped: "Uwian time", closed: "Closed" }[s] ?? s);
const nameOf = (d, uid) => d.members.find((m) => m.user_id === Number(uid))?.name ?? d.allNames?.[uid] ?? `User ${uid}`;

function settingsPanel(gid, d) {
  const vq = h("select", { style: "width:auto" },
    h("option", { value: 1, selected: d.group.vouches_required === 1 }, "1 vouch to join"),
    h("option", { value: 2, selected: d.group.vouches_required === 2 }, "2 vouches to join"));
  const buddyMin = h("input", { type: "number", value: d.group.buddy_notify_min, style: "width:90px" });
  const adminMin = h("input", { type: "number", value: d.group.admin_notify_min, style: "width:90px" });
  return h("div", {},
    h("label", { class: "f" }, "Vouches required to join"), vq,
    h("label", { class: "f" }, "Buddy alert delay (minutes after deadline)"), buddyMin,
    h("label", { class: "f" }, "Admin escalation delay (minutes)"), adminMin,
    h("button", { class: "btn primary", style: "margin-top:16px", onclick: async () => {
        await api(`/api/groups/${gid}/settings`, { vouches_required: Number(vq.value), buddy_notify_min: Number(buddyMin.value), admin_notify_min: Number(adminMin.value) }, "PATCH");
        toast("Settings saved.");
      } }, "Save settings"));
}

async function inviteFlow(gid) {
  const r = await api(`/api/groups/${gid}/invite`, {});
  openSheet("Invite to crew", h("div", {},
    h("p", { class: "dim", style: "margin-bottom:12px" }, "Share this link with someone you trust. They'll need a vouch from an existing member before they can join."),
    h("div", { class: "inset", style: "font-family:var(--font-mono);font-size:13px;word-break:break-all" }, `${location.origin}${r.invite_url}`),
    h("button", { class: "btn primary", style: "margin-top:14px", onclick: () => {
        navigator.clipboard?.writeText(`${location.origin}${r.invite_url}`);
        toast("Link copied!");
      } }, "Copy link")));
}

function sessionForm(gid, d) {
  const when   = h("input", { type: "datetime-local" });
  const spotSel = h("select", {}, h("option", { value: "" }, "— no spot selected —"), ...(d.spotsList?.map?.((s) => h("option", { value: s.id }, s.name)) ?? []));
  const ddSel  = h("select", {}, h("option", { value: "" }, "No designated driver"), ...d.members.map((m) => h("option", { value: m.user_id }, m.name)));
  openSheet("New session", h("div", {},
    h("label", { class: "f" }, "When"), when,
    h("label", { class: "f" }, "Location (add on map first)"), spotSel,
    h("label", { class: "f" }, "Designated driver (auto-excluded from all alcohol items)"), ddSel,
    h("p", { class: "dim", style: "margin-top:8px" }, "The DD is automatically skipped on every alcohol expense. You can change them later."),
    h("button", { class: "btn primary", style: "margin-top:16px", onclick: async () => {
        if (!when.value) return toast("Pick a date and time.", true);
        const r = await api(`/api/groups/${gid}/sessions`, { starts_at: when.value, designated_driver_id: ddSel.value ? Number(ddSel.value) : null });
        location.hash = `/s/${r.id}`;
      } }, "Create session")));
}

function pageGroupRerender(gid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/g/${gid}`)); }

/* ---------------- session screen ---------------- */
export async function pageSession(sid) {
  const d   = await api(`/api/sessions/${sid}`);
  const gid = d.session.group_id;
  const gd  = await api(`/api/groups/${gid}`);
  const isAdmin = gd.members.find((m) => m.user_id === me().id)?.role === "admin";
  const nameOfU = (uid) => gd.members.find((m) => m.user_id === Number(uid))?.name ?? d.session.designated_driver_name ?? `#${uid}`;
  const el = h("div", { class: "enter" });

  // header card
  el.append(h("div", { class: "panel" },
    h("div", { class: "row spread" },
      h("div", {},
        h("h2", {}, new Date(d.session.starts_at + "Z").toLocaleString()),
        d.spot ? h("p", { class: "dim" }, `📍 ${d.spot.name}`) : null),
      h("span", { class: `status-bar ${d.session.status}` }, statusLabel(d.session.status))),
    d.session.designated_driver_id
      ? h("div", { class: "inset", style: "margin-top:12px;display:flex;align-items:center;gap:8px" },
          h("span", { style: "color:var(--emerald)" }, "🚗"),
          h("span", {}, h("b", {}, "Designated driver: "), nameOfU(d.session.designated_driver_id)),
          h("span", { class: "dim" }, "— excluded from all alcohol items automatically."))
      : null));

  // RSVP
  const my = d.rsvps.find((r) => r.user_id === me().id);
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Who's coming"),
    h("div", { class: "row", style: "margin-bottom:14px" },
      ...["going", "maybe", "cant"].map((st) => h("button", {
        class: `btn ${my?.status === st ? "primary" : ""}`,
        onclick: async () => { await api(`/api/sessions/${sid}/rsvp`, { status: st }); pageSessionRerender(sid); }
      }, { going: "✔ Going", maybe: "Maybe", cant: "✖ Can't" }[st]))),
    h("div", { class: "receipt" },
      ...gd.members.filter((m) => m.status === "active").map((m) => {
        const r = d.rsvps.find((x) => x.user_id === m.user_id);
        return h("div", { class: "line" },
          h("span", {}, m.name + (m.user_id === me().id ? " (you)" : "")),
          h("span", {}, r ? { going: "✔ Going", maybe: "? Maybe", cant: "✖ Can't" }[r.status] : "—"));
      }))));

  // tabs
  const tabBar  = h("div", { class: "tabbar" });
  const tabBody = h("div", {});
  const tabs    = { tab: "Tab", settle: "Settle up", uwian: "Uwian", limit: "My Limit" };
  let cur = "tab";
  for (const [key, label] of Object.entries(tabs)) {
    const b = h("button", { class: "tab", onclick: () => { cur = key; renderTab(); } }, label);
    b.dataset.k = key; tabBar.append(b);
  }
  el.append(tabBar, tabBody);

  function renderTab() {
    [...tabBar.children].forEach((b) => b.classList.toggle("on", b.dataset.k === cur));
    tabBody.innerHTML = "";
    tabBody.append(cur === "tab" ? tabExpenses() : cur === "settle" ? tabSettle() : cur === "uwian" ? tabUwian() : tabLimit());
  }

  /* ---- Expenses tab ---- */
  function tabExpenses() {
    const wrap = h("div", { class: "panel" });
    if (d.session.status !== "closed")
      wrap.append(addExpenseForm(d, sid, nameOfU, () => pageSessionRerender(sid)));
    else
      wrap.append(h("div", { class: "inset", style: "margin-bottom:14px" },
        h("p", { class: "dim" }, "Tab is closed. " + (isAdmin ? "You can reopen it if needed." : "Contact an admin if something's wrong."))));
    const total = d.expenses.reduce((s, e) => s + e.amount_centavos, 0);
    wrap.append(
      h("h2", {}, "Tonight's tab"),
      d.expenses.length === 0
        ? h("p", { class: "dim" }, "No expenses logged yet.")
        : h("div", { class: "receipt" },
            ...d.expenses.map((e) => {
              const parts = Object.keys(d.shares[e.id] ?? {});
              return h("div", {},
                h("div", { class: "line" },
                  h("span", {}, `${e.is_alcohol ? "🍺" : "🍽"} ${e.description}`),
                  h("span", {}, `${fmtPeso(e.amount_centavos)} — paid by ${e.payer_name ?? nameOfU(e.paid_by)}`)),
                h("div", { class: "dim", style: "padding:2px 0 8px;font-size:12px" },
                  `Split with: ${parts.map(nameOfU).join(", ") || "—"}` +
                  (e.edited_after_close ? " · ⟨edited after close⟩" : "")));
            }),
            h("div", { class: "line total" }, h("span", {}, "TOTAL"), h("span", { class: "money" }, fmtPeso(total)))));
    return wrap;
  }

  /* ---- Settle tab ---- */
  function tabSettle() {
    const wrap = h("div", { class: "panel" }, h("h2", {}, "Settle up"));
    if (isAdmin && d.session.status !== "closed")
      wrap.append(h("button", { class: "btn primary", style: "margin-bottom:16px", onclick: async () => {
          await api(`/api/sessions/${sid}/close-tab`, {});
          toast("Tab closed — no more edits without reopening.");
          pageSessionRerender(sid);
        } }, "Close tab ✍"));
    if (!d.settlements.length)
      return wrap.append(h("p", { class: "dim" }, "No settlements yet — close the tab when the night's done.")), wrap;
    for (const t of d.settlements) {
      const mine_payer = t.from_user === me().id, mine_recv = t.to_user === me().id;
      const row = h("div", { class: "list-row" },
        avatar(t.from_name ?? nameOfU(t.from_user)),
        h("div", { class: "grow" },
          h("b", {}, `${t.from_name ?? nameOfU(t.from_user)} → ${t.to_name ?? nameOfU(t.to_user)}`),
          " ",
          h("span", { class: `chip ${t.status === "confirmed" ? "green" : t.status === "disputed" ? "red" : t.status === "paid_claimed" ? "amber" : ""}` },
            { open: "Open", paid_claimed: "Claimed paid", confirmed: "✔ Confirmed", disputed: "Disputed" }[t.status]),
          t.note ? h("div", { class: "dim" }, `"${t.note}"`) : null),
        h("span", { class: "money" }, fmtPeso(t.amount_centavos)));
      if (mine_payer && t.status === "open")
        row.append(h("button", { class: "btn good", onclick: async () => {
            await api(`/api/settlements/${t.id}/claim-paid`, {});
            pageSessionRerender(sid);
          } }, "I've paid"));
      if (mine_recv && t.status === "paid_claimed")
        row.append(
          h("button", { class: "btn good", onclick: async () => {
              await api(`/api/settlements/${t.id}/confirm`, {});
              toast("Confirmed. All good.");
              pageSessionRerender(sid);
            } }, "Confirm received"),
          h("button", { class: "btn bad", onclick: () => disputeForm(t.id, sid) }, "Dispute"));
      wrap.append(row);
    }
    if (isAdmin && d.session.status === "closed")
      wrap.append(h("button", { class: "btn ghost", style: "margin-top:14px", onclick: async () => {
          const r = await api(`/api/sessions/${sid}/reopen`, {});
          toast(r.note);
          pageSessionRerender(sid);
        } }, "Reopen tab (voids unpaid, keeps confirmed)"));
    return wrap;
  }

  /* ---- Uwian tab ---- */
  function tabUwian() {
    const wrap = h("div", { class: "panel" }, h("h2", {}, "Uwian — get everyone home safe"));
    if (isAdmin && d.session.status === "open")
      wrap.append(h("button", { class: "btn primary", style: "margin-bottom:16px", onclick: async () => {
          const deadline = new Date(Date.now() + 45 * 60000).toISOString().slice(0, 19).replace("T", " ");
          await api(`/api/sessions/${sid}`, { status: "wrapped", uwian_deadline: deadline }, "PATCH");
          toast("Uwian time! Buddies paired by direction.");
          pageSessionRerender(sid);
        } }, "🏠 Uwian na!"));
    const myCi = d.checkins.find((c) => c.user_id === me().id);
    if (!myCi?.home_confirmed_at) {
      const modeSel = h("select", { style: "width:auto" }, ...Object.entries(MODES).map(([k, v]) => h("option", { value: k }, v)));
      wrap.append(h("div", { class: "inset row", style: "margin-bottom:16px" },
        h("b", {}, "How are you getting home?"), modeSel,
        h("button", { class: "btn good", onclick: async () => {
            await api(`/api/sessions/${sid}/checkin`, { mode: modeSel.value });
            toast("Checked in! Stay safe out there.");
            pageSessionRerender(sid);
          } }, "I'm home ✔")));
    }
    // roster
    wrap.append(h("h3", { style: "margin:16px 0 8px" }, "Who's home"),
      ...gd.members.filter((m) => m.status === "active").map((m) => {
        const ci   = d.checkins.find((c) => c.user_id === m.user_id);
        const rsvp = d.rsvps.find((r) => r.user_id === m.user_id);
        if (rsvp?.status === "cant") return null;
        const row = h("div", { class: "list-row" }, avatar(m.name), lampFor(ci),
          h("div", { class: "grow" }, m.name,
            ci?.mode ? h("span", { class: "dim" }, ` · ${MODES[ci.mode]}`) : null,
            ci?.ride_offer_from ? h("span", { class: "chip green", style: "margin-left:6px" }, "Ride offered") : null),
          ci?.flag_stage >= 2 && !ci?.home_confirmed_at
            ? h("button", { class: "btn", onclick: async () => {
                const pair = d.buddy_pairs.find((p) => [p.user_a, p.user_b, p.user_c].includes(m.user_id));
                if (!pair) return toast("No buddy pair — contact admin.", true);
                await api(`/api/buddies/${sid}/${pair.user_a}/${pair.user_b}/clear-flag`, {});
                toast("Flag cleared. Thanks for checking in on each other.");
                pageSessionRerender(sid);
              } }, "Spoke to them, all good")
            : null);
        if (ci?.mode === "own_drive" && d.session.designated_driver_id !== m.user_id && !ci.ride_offer_from && m.user_id !== me().id)
          row.append(h("button", { class: "btn ghost", onclick: async () => {
              await api(`/api/buddies/${sid}/${m.user_id}/0/offer-ride`, {});
              toast("Ride offered. Legend.");
              pageSessionRerender(sid);
            } }, "Offer them a ride?"));
        return row;
      }));
    // buddies
    if (d.buddy_pairs.length)
      wrap.append(
        h("h3", { style: "margin:16px 0 8px" }, "Buddy pairs (by direction)"),
        h("div", { class: "receipt" },
          ...d.buddy_pairs.map((p) => h("div", { class: "line" }, h("span", {}, p.names.join(" + ")), h("span", {})))));
    wrap.append(h("p", { class: "dim", style: "margin-top:16px;font-size:12px;border-top:1px solid var(--border);padding-top:12px" },
      "Reminder: this app is not a rescue service. Escalation is just a nudge to check in. In a real emergency, call your local emergency number."));
    return wrap;
  }

  /* ---- My Limit tab (private!) ---- */
  function tabLimit() {
    const wrap = h("div", { class: "panel" },
      h("h2", {}, "My Limit"),
      h("p", { class: "dim" }, "Private — only you can see your count, even admins can't. This is a personal reminder, not an alcohol calculator."));
    const board = h("div", { class: "tally-board" });
    const limIn = h("input", { type: "number", min: 1, style: "width:80px" });

    async function refresh() {
      const r = await api(`/api/sessions/${sid}/limit`);
      board.innerHTML = "";
      const show = Math.max(r.lim ?? 0, r.count, 8);
      for (let i = 1; i <= Math.min(show, 12); i++)
        board.append(h("div", { class: `tally ${i <= r.count ? "full" : "empty"}` }, i <= r.count ? "✕" : "·"));
      const pct = r.lim ? r.count / r.lim : 0;
      if (pct >= 0.8) board.append(h("div", { class: `chip ${pct >= 1 ? "red" : "amber"}`, style: "align-self:center;margin-left:4px" },
        pct >= 1 ? "At your limit — sort out your ride?" : "Getting close — sort out your ride?"));
      if (pct >= 0.8) board.append(h("button", { class: "btn good", style: "align-self:center", onclick: () => { cur = "uwian"; renderTab(); } }, "Check in now"));
    }

    const push = h("button", { class: "round-push", onclick: async () => {
        const r = await api(`/api/sessions/${sid}/limit/tap`, {});
        if (navigator.vibrate) navigator.vibrate(30);
        if (r.level) toast(r.level === "at_limit" ? "You've hit your limit — sort your ride home." : "Getting close to your limit.");
        refresh();
      } }, "+ 1 round");

    wrap.append(
      h("div", { style: "display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;margin-top:16px" },
        push,
        h("div", { class: "grow" },
          board,
          h("div", { class: "row", style: "margin-top:16px;flex-wrap:wrap" },
            h("label", { class: "f", style: "margin:0;white-space:nowrap" }, "My limit (rounds)"),
            limIn,
            h("button", { class: "btn", onclick: async () => {
                await api(`/api/sessions/${sid}/limit`, { limit: limIn.value ? Number(limIn.value) : null }, "PUT");
                refresh(); toast("Limit updated.");
              } }, "Set")))));
    refresh();
    return wrap;
  }

  renderTab();
  return el;
}

function addExpenseForm(d, sid, nameOfU, done) {
  const desc  = h("input", { placeholder: "What was it? (e.g. beer bucket, sisig…)" });
  const amt   = h("input", { placeholder: "Amount ₱", inputmode: "decimal", style: "max-width:130px" });
  const payer = h("select", { style: "width:auto" },
    ...d.members.map((m) => h("option", { value: m.user_id, selected: m.user_id === me().id }, m.name)));
  let isAlcohol = true;
  const note  = h("p", { class: "dim" }, alcoholNote(d));
  const togg  = h("span", { class: "toggle on", onclick: () => {
      isAlcohol = !isAlcohol;
      togg.classList.toggle("on", isAlcohol);
      note.textContent = isAlcohol ? alcoholNote(d) : "Food/non-alcohol: everyone attending splits it.";
    } },
    h("span", { class: "slot" }, h("span", { class: "knob" })),
    h("span", { class: "label-text" }, "Alcohol"));

  function alcoholNote(sess) {
    const dd = sess.session.designated_driver_name;
    return dd
      ? `Auto-split: ${dd} is excluded from alcohol, as are non-drinkers. Adjust below if needed.`
      : "Marked as alcohol: DD will be excluded automatically.";
  }

  const checks = h("div", { class: "row" }, ...d.members.map((m) => {
    const cb = h("input", { type: "checkbox", checked: true, style: "width:auto" });
    cb.dataset.uid = m.user_id;
    return h("label", { class: "chip", style: "display:inline-flex;gap:6px;align-items:center;cursor:pointer" }, cb, m.name);
  }));

  return h("div", { class: "inset", style: "margin-bottom:16px" },
    h("div", { class: "row" }, desc, amt, payer, togg),
    h("div", { class: "row", style: "margin-top:10px" }, h("span", { class: "dim" }, "Split with:"), checks),
    note,
    h("button", { class: "btn primary", style: "margin-top:12px", onclick: async () => {
        const cents = pesoToCents(amt.value);
        if (!cents) return toast("Enter a valid amount, e.g. 450 or 450.50", true);
        const chosen = [...checks.querySelectorAll("input")].filter((c) => c.checked).map((c) => c.dataset.uid);
        await api(`/api/sessions/${sid}/expenses`, {
          amount_centavos: cents,
          description: desc.value || "item",
          is_alcohol: isAlcohol ? 1 : 0,
          paid_by: Number(payer.value),
          participants: chosen,
        });
        toast("Expense added to tab."); done();
      } }, "Add to tab"));
}

function disputeForm(id, sid) {
  const note = h("textarea", { placeholder: "Describe the issue — the admin will see this." });
  openSheet("Dispute transfer", h("div", {}, note,
    h("button", { class: "btn bad", style: "margin-top:14px", onclick: async () => {
        if (!note.value.trim()) return toast("Please describe the issue first.", true);
        await api(`/api/settlements/${id}/dispute`, { note: note.value });
        toast("Marked as disputed. Admins have been notified.");
        pageSessionRerender(sid);
      } }, "Submit dispute")));
}

function pageSessionRerender(sid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/s/${sid}`)); }

/* ---------------- hangout map ---------------- */
export async function pageMap(gid) {
  const spots = await api(`/api/groups/${gid}/spots`);
  const gd    = await api(`/api/groups/${gid}`);
  const nameOfU = (uid) => gd.members.find((m) => m.user_id === Number(uid))?.name ?? `#${uid}`;
  const el = h("div", { class: "enter" },
    h("div", { class: "panel" },
      h("h2", {}, "Hangout Map"),
      h("p", { class: "dim" }, "Double-click the map to drop a new spot. Powered by Leaflet + OpenStreetMap — no API key needed.")),
    h("div", { class: "map-frame" }, h("div", { id: "map" })),
    h("div", { class: "panel" },
      h("h2", {}, "Spots"),
      spots.length === 0
        ? h("p", { class: "dim" }, "No spots added yet. Double-click the map to add one.")
        : null,
      ...spots.map((sp) => h("div", { class: "list-row" },
        h("div", { class: "pin-spot" + (sp.stale ? " pin-stale" : ""), style: "flex:none;border-radius:50%" }),
        h("div", { class: "grow" },
          h("b", {}, sp.name),
          h("div", { class: "dim" }, `${sp.price_range ?? ""} · closes ${sp.closes_at ?? "?"} · ${sp.notes ?? ""}`),
          h("div", { class: "dim" }, `Last confirmed: ${timeAgo(sp.last_confirmed_at)}${sp.stale ? " · ⚠ UNVERIFIED — 60+ days" : ""}`)),
        h("div", { class: "row" },
          h("button", { class: "btn good", onclick: () => confirmSpot(sp.id, "yes") }, "Still open ✔"),
          h("button", { class: "btn", onclick: () => confirmSpot(sp.id, "changed") }, "Changed"),
          h("button", { class: "btn bad", onclick: () => confirmSpot(sp.id, "no") }, "Closed"))))));
  requestAnimationFrame(() => {
    const map = L.map("map").setView([14.676, 121.0437], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    for (const sp of spots) {
      const icon = L.divIcon({ className: "", html: `<div class="pin-spot${sp.stale ? " pin-stale" : ""}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] });
      L.marker([sp.lat, sp.lng], { icon }).addTo(map)
        .bindPopup(`<b>${sp.name}</b><br>${sp.notes ?? ""}<br><i>${sp.stale ? "Unverified — please confirm" : "Added by " + nameOfU(sp.added_by)}</i>`);
    }
    map.on("dblclick", async (e) => {
      const nm = prompt("Spot name:"); if (!nm) return;
      await api(`/api/groups/${gid}/spots`, { name: nm, lat: e.latlng.lat, lng: e.latlng.lng, price_range: "$$", closes_at: "02:00", notes: "" });
      toast("Spot added to map.");
      pageMapRerender(gid);
    });
  });
  async function confirmSpot(id, answer) {
    let closes_at = null, new_details = null;
    if (answer === "changed") {
      closes_at   = prompt("New closing time (HH:MM, leave blank if unchanged)?") || null;
      new_details = prompt("Any other changes? (optional)") || null;
    }
    await api(`/api/spots/${id}/confirm`, { answer, closes_at, new_details });
    toast(answer === "no" ? "Spot marked as closed. Thanks for the update!" : "Thanks — spot freshness updated.");
    pageMapRerender(gid);
  }
  return el;
}
function pageMapRerender(gid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/map/${gid}`)); }

/* ---------------- notifications drawer ---------------- */
export async function bellDrawer() {
  const notifs = await api("/api/me/notifications");
  openSheet("Notifications", h("div", {},
    notifs.length === 0 ? h("p", { class: "dim" }, "All clear. ✔") : null,
    ...notifs.map((n) => {
      const p = JSON.parse(n.payload);
      return h("div", { class: "list-row" },
        h("span", { class: `lamp ${n.kind === "escalation" || n.kind === "buddy_alert" ? "flag3" : n.kind === "nudge" ? "flag1" : "home"}` }),
        h("div", { class: "grow" },
          h("b", {}, {
            uwian_reminder: "Uwian reminder",
            buddy_alert:    "Buddy alert",
            escalation:     "Escalation",
            nudge:          "Limit nudge",
            vouch:          "Vouch",
            dispute:        "Dispute",
            payment_claim:  "Payment",
            ride_request:   "Ride request",
            ride_offer:     "Ride offer",
          }[n.kind] ?? n.kind),
          h("div", { class: "dim" }, p.message ?? "")),
        h("button", { class: "btn", onclick: async () => { await api(`/api/notifications/${n.id}/read`, {}); bellRefresh(); } }, "Dismiss"));
    })));
}
function bellRefresh() { location.hash = ""; requestAnimationFrame(() => (location.hash = location.hash || "/groups")); }
