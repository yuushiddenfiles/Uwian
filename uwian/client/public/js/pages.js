import { $, api, h, toast, openSheet, avatar, fmtPeso, lampFor, MODES, timeAgo, pesoToCents, icon, icon3d } from "./util.js";

let ME_ = null;
export const me = () => ME_;
export async function loadMe() { ME_ = (await api("/api/me")).user; return ME_; }

/* helper: initials avatar using the crew-av style */
function crewAv(name) {
  const parts = (name ?? "?").trim().split(" ");
  const init = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  return h("div", { class: "crew-av" }, init);
}

/* helper: first initial of first name */
function firstInit(name) {
  return (name ?? "?").trim()[0].toUpperCase();
}

/* helper: safely format session timestamp */
function fmtSessionTime(dt) {
  if (!dt) return "Time TBD";
  const str = String(dt).trim();
  const iso = str.endsWith("Z") ? str : (str.includes("T") ? str + "Z" : str.replace(" ", "T") + "Z");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ════════════════════════════════════
   AUTH
   ════════════════════════════════════ */
export function pageLogin() {
  const email = h("input", { placeholder: "Email address", type: "email", id: "login-email", autocomplete: "email" });
  const pw    = h("input", { placeholder: "Password", type: "password", id: "login-pw", autocomplete: "current-password" });
  return h("div", { class: "auth-card enter" },
    h("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:20px" },
      h("div", { style: "width:38px;height:38px;border-radius:10px;background:var(--accent-dim);border:1.5px solid var(--accent-mid);display:grid;place-items:center;flex:none" },
        h("svg", { viewBox: "0 0 32 32", width: "20", height: "20", fill: "none", stroke: "var(--accent)", "stroke-width": "2.4", "stroke-linejoin": "round", "aria-hidden": "true" },
          h("path", { d: "M6 17 16 7l10 10v9a2 2 0 0 1-2 2h-5v-7h-4v7H8a2 2 0 0 1-2-2z" }))),
      h("span", { style: "font:700 18px 'DM Sans',system-ui,sans-serif;color:var(--accent-text);letter-spacing:-0.3px" }, "uwian")),
    h("h2", {}, "Welcome back"),
    h("p", { class: "sub" }, "Sign in to find your crew and join a session."),
    h("label", { class: "f", for: "login-email" }, "Email"), email,
    h("label", { class: "f", for: "login-pw" }, "Password"), pw,
    h("button", { class: "btn primary", style: "width:100%;margin-top:22px;justify-content:center;padding:12px", onclick: async () => {
        try { await api("/api/login", { email: email.value, password: pw.value }); location.hash = "/groups"; }
        catch (e) { toast(e.message, true); pw.classList.add("shake"); setTimeout(() => pw.classList.remove("shake"), 500); }
      } }, "Sign in"),
    h("hr"),
    h("p", { style: "text-align:center;margin-top:16px;font-size:14px;color:var(--text-2)" },
      "New here? ", h("a", { href: "#/signup", style: "color:var(--accent-text);font-weight:600" }, "Create an account")),
    h("hr"),
    h("p", { class: "demo" }, "Demo accounts: ana@barkada.demo … ela@barkada.demo\nPassword: BarkadaDemo!2026"));
}

export function pageSignup() {
  const name  = h("input", { placeholder: "Your full name", id: "su-name", autocomplete: "name" });
  const email = h("input", { placeholder: "Email address", type: "email", id: "su-email", autocomplete: "email" });
  const pw    = h("input", { placeholder: "Password (8+ characters)", type: "password", id: "su-pw", autocomplete: "new-password" });
  const bday  = h("input", { type: "date", id: "su-bday" });
  return h("div", { class: "auth-card enter" },
    h("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:20px" },
      h("div", { style: "width:38px;height:38px;border-radius:10px;background:var(--accent-dim);border:1.5px solid var(--accent-mid);display:grid;place-items:center;flex:none" },
        h("svg", { viewBox: "0 0 32 32", width: "20", height: "20", fill: "none", stroke: "var(--accent)", "stroke-width": "2.4", "stroke-linejoin": "round", "aria-hidden": "true" },
          h("path", { d: "M6 17 16 7l10 10v9a2 2 0 0 1-2 2h-5v-7h-4v7H8a2 2 0 0 1-2-2z" }))),
      h("span", { style: "font:700 18px 'DM Sans',system-ui,sans-serif;color:var(--accent-text);letter-spacing:-0.3px" }, "uwian")),
    h("h2", {}, "Create an account"),
    h("p", { class: "sub" }, "Must be 18 or older. Birthdate is self-declared — see docs/privacy.md for details."),
    h("label", { class: "f", for: "su-name" }, "Name"), name,
    h("label", { class: "f", for: "su-email" }, "Email"), email,
    h("label", { class: "f", for: "su-pw" }, "Password"), pw,
    h("label", { class: "f", for: "su-bday" }, "Birthdate (18+)"), bday,
    h("button", { class: "btn primary", style: "width:100%;margin-top:22px;justify-content:center;padding:12px", onclick: async () => {
        try {
          await api("/api/signup", { name: name.value, email: email.value, password: pw.value, birthdate: bday.value });
          location.hash = "/groups";
        }
        catch (e) { toast(e.message, true); }
      } }, "Create account"),
    h("p", { style: "text-align:center;margin-top:16px;font-size:14px;color:var(--text-2)" },
      "Already have an account? ", h("a", { href: "#/login", style: "color:var(--accent-text);font-weight:600" }, "Sign in")));
}

/* ════════════════════════════════════
   GROUPS LIST (Dashboard & Session Finder)
   ════════════════════════════════════ */
export async function showVerificationSheet() {
  try {
    const v = await api("/api/me/verification");
    const u = v.user;
    let closeSheet;
    closeSheet = openSheet("Identity & Safety Verification", h("div", { class: "enter" },
      h("div", { style: "display:flex;align-items:center;gap:14px;padding:16px;background:var(--green-dim);border:1.5px solid #a8dece;border-radius:14px;margin-bottom:18px" },
        h("div", { style: "width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg, #e6f9f0 0%, #cbf2e2 100%);display:grid;place-items:center;flex:none;border:1px solid #95dcc0" },
          icon3d("shield", { size: 36, class: "icon-3d-float" })),
        h("div", { style: "flex:1;min-width:0" },
          h("div", { style: "font:700 15px var(--font);color:var(--text)" }, v.security_badge),
          h("div", { style: "font-size:12.5px;color:var(--green);font-weight:600;margin-top:2px" }, `${v.trust_tier} · Full Access`))),

      h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px" },
        h("div", { style: "background:var(--surface-in);padding:12px;border-radius:10px;border:1px solid var(--border)" },
          h("div", { style: "font-size:11.5px;color:var(--text-3);font-weight:600" }, "VOUCHES RECEIVED"),
          h("div", { style: "font:700 18px var(--font);color:var(--text);margin-top:4px" }, `${v.vouches_received} vouches`)),
        h("div", { style: "background:var(--surface-in);padding:12px;border-radius:10px;border:1px solid var(--border)" },
          h("div", { style: "font-size:11.5px;color:var(--text-3);font-weight:600" }, "ACCOUNT STRIKES"),
          h("div", { style: "font:700 18px var(--font);color:v.strikes ? var(--red) : var(--green);margin-top:4px" }, `${v.strikes} strikes`))),

      h("h3", { style: "font:700 15px var(--font);color:var(--text);margin-bottom:10px" }, "Strict Safety Measures"),
      h("ul", { style: "font-size:13.5px;color:var(--text-2);line-height:1.6;padding-left:18px;margin-bottom:20px" },
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Identity Verification: "), "Every member must provide verified legal name and birthdate (18+) before joining."),
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Double-Vouch Safeguard: "), "Joining new crews requires existing members to vouch for your character."),
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Safe Commute Buddy System: "), "When sessions wrap, attendees are paired by commute direction with automated arrival check-ins."),
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Two-Strike Policy: "), "Disruptive behavior or false vouches result in immediate strike and vouch revocation.")),

      h("div", { style: "display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface-in);border-radius:10px;border:1px solid var(--border);margin-bottom:16px" },
        h("div", {},
          h("div", { style: "font:600 13.5px var(--font);color:var(--text)" }, "Drinking Preference"),
          h("div", { style: "font-size:12px;color:var(--text-3)" }, u.can_drink ? "Excludes non-alcohol tabs automatically" : "Flagged as non-drinker")),
        h("button", {
          class: "btn ghost sm",
          onclick: async () => {
            const next = !u.can_drink;
            await api("/api/me", { can_drink: next }, "PATCH");
            u.can_drink = next ? 1 : 0;
            toast(next ? "Updated: Drinks alcohol" : "Updated: Non-drinker");
            showVerificationSheet();
          }
        }, u.can_drink ? "Set: Non-drinker" : "Set: Drinks")),

      h("button", { class: "btn primary", style: "width:100%;justify-content:center;padding:11px", onclick: () => {
        if (closeSheet) closeSheet();
      } }, "Understood & Verified")));
  } catch (e) { toast(e.message, true); }
}

export async function pageGroups() {
  const [gs, feed] = await Promise.all([
    api("/api/groups"),
    api("/api/sessions/feed").catch(() => [])
  ]);
  const firstName = me()?.name?.split(" ")[0] ?? "there";
  const user = me();
  const el = h("div", { class: "glass-dashboard-panel enter" });

  /* ── Helper for live digital clock widget (matching Image 1) ── */
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "2-digit", day: "2-digit" });

  const clockWidget = h("div", { class: "glass-clock-widget" },
    h("div", { class: "clock-time", id: "live-clock-time" }, timeStr),
    h("div", { class: "clock-date" }, dateStr));

  /* ── User pill in top-right of panel (matching Image 1 profile widget) ── */
  const initialsStr = (user?.name || "?").trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const userBadge = h("div", { class: "panel-user-badge", onclick: () => showVerificationSheet() },
    h("div", { class: "badge-av" }, initialsStr),
    h("div", { class: "badge-info" },
      h("span", { class: "badge-name" }, user?.name || "Account"),
      h("span", { class: "badge-status" }, icon3d("shield", { size: 12 }), "ID Verified")));

  /* ── Top Bar inside the Large Centered Glass Panel ── */
  const panelTopBar = h("div", { class: "glass-panel-topbar" },
    clockWidget,
    userBadge
  );
  el.append(panelTopBar);

  /* ── Greeting & Hero (Smaller rounded glass card) ── */
  const heroCard = h("div", { class: "glass-card greeting-glass-card" },
    h("div", { class: "greeting-content" },
      h("p", { class: "greeting" }, greetingByHour()),
      h("h1", {}, `Hey, ${firstName}`),
      h("p", { class: "sub" }, "Find a session, join your crew, or meet new verified friends safely."),
      h("div", { class: "page-actions" },
        h("button", { class: "btn primary", id: "new-crew-btn", onclick: () => newCrewSheet() }, "+ New crew"),
        h("button", { class: "btn ghost icon-text-row", onclick: () => showVerificationSheet() }, icon3d("shield", { size: 16 }), "Safety & ID Rules"))));
  el.append(heroCard);

  /* ── Trust & Security Banner (Smaller rounded glass card) ── */
  el.append(h("div", { class: "glass-card trust-glass-card", role: "region", "aria-label": "Safety status" },
    h("div", { class: "trust-icon-box" }, icon3d("shield", { size: 28, class: "icon-3d-float" })),
    h("div", { class: "trust-banner-content" },
      h("div", { class: "trust-banner-title" },
        "Safe Space & Identity Protected",
        h("span", { class: "trust-badge-pill icon-text-row" }, icon3d("tick", { size: 12 }), "ID Verified")),
      h("div", { class: "trust-banner-sub" },
        "Strict verification: all hangouts require verified identity and vouched entry. Automated buddy pairing escorts everyone safely home.")),
    h("button", { class: "btn ghost sm", onclick: () => showVerificationSheet() }, "Details →")));

  /* ── Session Discovery & Search Section ── */
  const searchWrap = h("div", { class: "search-bar-wrap" },
    h("span", { class: "search-icon", "aria-hidden": "true" }, icon("search", { size: 15 })),
    h("input", {
      type: "search",
      class: "search-input glass-search-input",
      placeholder: "Search sessions by spot, crew, or vibe (e.g. Aling Nena's, Sabado, Norte)...",
      id: "session-search",
      oninput: (e) => filterSessions(e.target.value)
    }));

  let currentTab = "all";
  const tabAll = h("button", { class: "filter-chip active", onclick: () => setTab("all") }, `All Sessions (${feed.length})`);
  const tabTonight = h("button", { class: "filter-chip", onclick: () => setTab("active") }, "Active / Tonight");
  const tabGoing = h("button", { class: "filter-chip", onclick: () => setTab("going") }, "You're Going");

  const filterBar = h("div", { class: "filter-bar" }, tabAll, tabTonight, tabGoing);
  const feedContainer = h("div", { class: "feed-grid", id: "feed-container" });

  const sessionsCard = h("div", { class: "glass-card sessions-glass-card" },
    h("div", { class: "section-head" },
      h("h2", {}, "Discover & Upcoming Sessions"),
      feed.length > 0 ? h("span", { class: "chip amber" }, `${feed.length} available`) : null),
    searchWrap,
    filterBar,
    feedContainer
  );
  el.append(sessionsCard);

  function renderFeed(items) {
    feedContainer.innerHTML = "";
    if (items.length === 0) {
      feedContainer.append(h("div", { class: "hero-empty", style: "grid-column: 1 / -1; padding: 40px 16px" },
        h("div", { class: "hero-icon" }, icon("search", { size: 24, strokeColor: "var(--text-3)" })),
        h("h3", {}, "No matching sessions found"),
        h("p", {}, "Try searching for a different spot or crew name, or create a session in one of your crews.")));
      return;
    }

    items.forEach(s => {
      const spotName = s.spot_name || "Tambayan TBD";
      const dateText = fmtSessionTime(s.starts_at);
      const attendeesCount = s.going_count || (s.attendees?.length ?? 0);
      const isMyGoing = s.my_rsvp === "going";

      const card = h("div", {
        class: "feed-card glass-feed-card",
        tabindex: "0",
        role: "link",
        "aria-label": `Open session at ${spotName}`,
        onclick: () => { location.hash = `/s/${s.id}`; },
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") location.hash = `/s/${s.id}`; }
      },
        h("div", { class: "feed-card-header" },
          h("div", {},
            h("div", { class: "feed-card-spot icon-text-row" }, icon3d("pin", { size: 16 }), spotName),
            h("div", { class: "feed-card-crew icon-text-row" }, icon3d("boy", { size: 14 }), s.group_name)),
          h("span", { class: `status-bar ${s.status}` }, statusLabel(s.status))),
        h("div", { class: "feed-card-body" },
          h("div", { class: "feed-meta-row" },
            h("div", { class: "feed-meta-item icon-text-row" }, icon3d("clock", { size: 14 }), dateText),
            s.price_range ? h("div", { class: "feed-meta-item" }, `· ${s.price_range}`) : null),
          h("div", { class: "avatar-stack" },
            ...(s.attendees || []).slice(0, 3).map(a => crewAv(a.name)),
            h("span", { class: "avatar-stack-label" },
              attendeesCount > 0 ? `${attendeesCount} friend${attendeesCount !== 1 ? "s" : ""} going` : "Be the first to join"))),
        h("div", { class: "feed-card-foot" },
          h("span", { class: "security-tag icon-text-row" }, icon3d("shield", { size: 14 }), "ID Checked"),
          isMyGoing
            ? h("span", { class: "chip green icon-text-row", style: "font-weight:600" }, icon3d("tick", { size: 12 }), "You're Going")
            : h("span", { style: "font:600 13px var(--font);color:var(--accent-text)" }, "View Session →"))
      );

      feedContainer.append(card);
    });
  }

  function setTab(tab) {
    currentTab = tab;
    tabAll.classList.toggle("active", tab === "all");
    tabTonight.classList.toggle("active", tab === "active");
    tabGoing.classList.toggle("active", tab === "going");
    filterSessions(document.querySelector("#session-search")?.value || "");
  }

  function filterSessions(query) {
    const q = (query || "").toLowerCase().trim();
    let filtered = feed;
    if (currentTab === "active") {
      filtered = filtered.filter(s => s.status === "open" || s.status === "planning" || s.status === "wrapped");
    } else if (currentTab === "going") {
      filtered = filtered.filter(s => s.my_rsvp === "going");
    }
    if (q) {
      filtered = filtered.filter(s =>
        (s.spot_name && s.spot_name.toLowerCase().includes(q)) ||
        (s.group_name && s.group_name.toLowerCase().includes(q)) ||
        (s.spot_notes && s.spot_notes.toLowerCase().includes(q))
      );
    }
    renderFeed(filtered);
  }

  // Initial render of feed
  renderFeed(feed);

  /* ── My Crews Section (Smaller rounded glass card) ── */
  const crewsCard = h("div", { class: "glass-card crews-glass-card" },
    h("div", { class: "section-head", style: "margin-top:0" },
      h("h2", {}, `My Crews (${gs.length})`),
      h("button", { class: "btn ghost sm", onclick: () => newCrewSheet() }, "+ New crew")));

  if (gs.length === 0) {
    crewsCard.append(h("div", { class: "hero-empty" },
      h("div", { class: "hero-icon", style: "border:none;background:transparent" }, icon3d("boy", { size: 48, class: "icon-3d-float" })),
      h("h3", {}, "No crews yet"),
      h("p", {}, "Create your first crew above, or ask a friend to share an invite link.")));
  } else {
    crewsCard.append(
      h("div", { class: "crew-grid" },
        ...gs.map((g) => {
          const parts = (g.name ?? "").trim().split(" ");
          const init  = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
          const card  = h("div", {
            class: "crew-card glass-crew-card", tabindex: "0", role: "link",
            "aria-label": `Open crew ${g.name}`,
            onclick: () => (location.hash = `/g/${g.id}`),
            onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") location.hash = `/g/${g.id}`; }
          },
            h("div", { class: "crew-card-top" },
              h("div", { class: "crew-av" }, init),
              h("div", { class: "grow" },
                h("div", { class: "crew-card-name" }, g.name),
                h("div", { class: "crew-card-meta" }, g.role === "admin" ? "You're an admin" : "Member"))),
            h("div", { class: "crew-card-foot" },
              h("span", { class: "role-chip" }, g.role),
              h("span", { class: "crew-card-arrow", "aria-hidden": "true" }, "→")));
          return card;
        })));
  }
  el.append(crewsCard);

  /* ── Safety Guarantee Footer (Smaller rounded glass card) ── */
  el.append(h("div", {
    class: "glass-card safety-guarantee-glass-card",
    style: "display:flex;align-items:center;gap:16px"
  },
    h("div", { style: "width:48px;height:48px;border-radius:12px;background:var(--accent-dim);border:1.5px solid var(--accent-mid);display:grid;place-items:center;flex:none" },
      icon3d("travel", { size: 30, class: "icon-3d-float" })),
    h("div", { style: "flex:1;min-width:0" },
      h("strong", { style: "display:block;font:600 14.5px var(--font);color:var(--text)" }, "Uwian Safe Arrival Guarantee"),
      h("p", { style: "font-size:13px;color:var(--text-2);margin-top:3px;line-height:1.45" },
        "When hangouts conclude, our buddy escalation pairs you with friends heading your way. Real safety, zero awkwardness.")),
    h("button", { class: "btn ghost sm", onclick: () => showVerificationSheet() }, "How it works →")
  ));

  window._uwianNewCrewSheet = newCrewSheet;
  return el;

  function newCrewSheet() {
    const n = h("input", { placeholder: "e.g. Barkada Sabado", id: "new-group-name", autocomplete: "off" });
    openSheet("New crew", h("div", {},
      h("p", { style: "font-size:14px;color:var(--text-2);margin-bottom:16px" }, "Give your crew a name. You can invite members after."),
      h("label", { class: "f", for: "new-group-name" }, "Crew name"), n,
      h("button", { class: "btn primary", style: "width:100%;margin-top:18px;justify-content:center;padding:12px", onclick: async () => {
          if (!n.value.trim()) return toast("Give your crew a name first.", true);
          const r = await api("/api/groups", { name: n.value.trim() });
          location.hash = `/g/${r.id}`;
        } }, "Create crew")));
    setTimeout(() => n.focus(), 80);
  }
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ════════════════════════════════════
   GROUP HOME
   ════════════════════════════════════ */
export async function pageGroup(gid) {
  const d      = await api(`/api/groups/${gid}`);
  const ledger = await api(`/api/groups/${gid}/ledger`);
  const spots  = await api(`/api/groups/${gid}/spots`);
  d.spotsList  = spots;
  const isAdmin = d.members.find((m) => m.user_id === me().id)?.role === "admin";
  const upcoming = d.sessions.filter((s) => s.status !== "closed").slice(0, 4);
  const el = h("div", { class: "enter" });

  /* ── group header card ── */
  const parts = (d.group.name ?? "").trim().split(" ");
  const init  = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  el.append(h("div", { class: "group-header" },
    h("div", { class: "group-header-av" }, init),
    h("div", { class: "group-header-body" },
      h("h1", {}, d.group.name),
      h("div", { class: "member-count" }, `${d.members.length} member${d.members.length !== 1 ? "s" : ""}`)),
    h("div", { class: "group-header-actions" },
      h("button", { class: "btn ghost sm icon-text-row", onclick: () => inviteFlow(gid) }, icon3d("mail", { size: 15 }), "Invite"),
      isAdmin ? h("button", { class: "btn primary sm", onclick: () => sessionForm(gid, d) }, "+ Session") : null)));

  /* ── vouch queue ── */
  if (d.pending.length) {
    const vouchPanel = h("div", { class: "panel" },
      h("div", { class: "section-head", style: "margin:0 0 12px" },
        h("h2", {}, "Vouch queue"),
        h("span", { class: "chip amber" }, `${d.pending.length} pending`)));
    d.pending.forEach((p) => {
      vouchPanel.append(h("div", { class: "vouch-row" },
        avatar(p.name),
        h("div", { class: "vouch-info" },
          h("strong", {}, p.name),
          h("span", {}, `${p.vouches}/${d.group.vouches_required} vouch${p.vouches !== 1 ? "es" : ""} so far`)),
        h("button", { class: "btn good sm", onclick: async () => {
            const r = await api(`/api/groups/${gid}/vouch/${p.user_id}`, {});
            toast(r.accepted ? "They're in! Welcome to the crew." : `Vouched! ${r.have}/${r.need} so far.`);
            pageGroupRerender(gid);
          } }, "Vouch in")));
    });
    el.append(vouchPanel);
  }

  /* ── sessions ── */
  el.append(h("div", { class: "panel" },
    h("div", { class: "section-head", style: "margin:0 0 14px" },
      h("h2", {}, "Sessions"),
      isAdmin ? h("button", { class: "btn primary sm", onclick: () => sessionForm(gid, d) }, "+ Session") : null),
    upcoming.length === 0
      ? h("div", { class: "hero-empty", style: "padding:32px 0" },
          h("div", { class: "hero-icon", style: "width:48px;height:48px;margin-bottom:10px;border:none;background:transparent" }, icon3d("cup", { size: 40, class: "icon-3d-float" })),
          h("p", {}, isAdmin ? "No sessions yet — hit + Session to plan one." : "No upcoming sessions."))
      : h("div", {},
          ...upcoming.map((s) => {
            const sessIcon = s.status === "open" ? icon3d("cup", { size: 18 }) : s.status === "wrapped" ? icon3d("travel", { size: 18 }) : s.status === "closed" ? icon3d("tick", { size: 18 }) : icon3d("calendar", { size: 18 });
            return h("div", {
              class: "session-card", role: "link", tabindex: "0",
              onclick: () => (location.hash = `/s/${s.id}`),
              onkeydown: (e) => { if (e.key === "Enter") location.hash = `/s/${s.id}`; }
            },
              h("div", { class: "session-card-icon" }, sessIcon),
              h("div", { class: "session-card-body" },
                h("div", { class: "session-card-title" }, fmtSessionTime(s.starts_at)),
                h("div", { class: "session-card-sub" }, statusLabel(s.status))),
              h("span", { class: `status-bar ${s.status}` }, statusLabel(s.status)));
          })),
    d.sessions.filter((s) => s.status === "closed").length > 0
      ? h("div", { style: "padding-top:12px;border-top:1px solid var(--border);margin-top:8px" },
          h("p", { class: "dim", style: "font-size:13px;margin-bottom:8px" }, "Past sessions"),
          ...d.sessions.filter((s) => s.status === "closed").slice(0, 3).map((s) =>
            h("div", { class: "list-row clickable", onclick: () => (location.hash = `/s/${s.id}`) },
              h("div", { class: "grow" },
                h("span", {}, new Date(s.starts_at + "Z").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })),
                h("span", { class: "dim", style: "margin-left:8px" }, "Closed")),
              h("span", { style: "color:var(--text-3);font-size:13px" }, "→"))))
      : null));

  /* ── ledger ── */
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Outstanding balances"),
    ledger.length === 0
      ? h("div", { style: "display:flex;align-items:center;gap:10px;padding:12px 0;color:var(--green)" },
          h("span", { style: "display:inline-flex;align-items:center" }, icon3d("tick", { size: 22 })),
          h("span", { style: "font:600 15px var(--font)" }, "All settled up!"))
      : h("div", { class: "receipt" },
          ...ledger.map((t) => h("div", { class: "line" },
            h("span", {}, `${nameOf(d, t.from)} → ${nameOf(d, t.to)}`),
            h("span", { class: "money" }, fmtPeso(t.amount_centavos)))),
          h("div", { class: "line total" },
            h("span", {}, `${ledger.length} transfer${ledger.length !== 1 ? "s" : ""} (min)`),
            h("span", {})))));

  /* ── members ── */
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Members & directions"),
    ...d.members.map((m) => h("div", { class: "list-row" },
      avatar(m.name),
      h("div", { class: "grow" },
        h("span", { style: "font:500 14px var(--font)" }, m.name),
        m.user_id === me().id ? h("span", { class: "chip", style: "margin-left:8px" }, "you") : null,
        m.can_drink ? null : h("span", { class: "chip", style: "margin-left:6px" }, "Non-drinker"),
        m.strikes > 0 && isAdmin ? h("span", { class: "chip red", style: "margin-left:6px" }, `${m.strikes} strike${m.strikes !== 1 ? "s" : ""}`) : null),
      h("select", { style: "width:auto;max-width:160px", onchange: async (e) => {
          if (m.user_id !== me().id) return toast("You can only set your own direction tag.", true), e.target.blur();
          await api("/api/me/direction", { group_id: gid, direction_tag_id: e.target.value ? Number(e.target.value) : null }, "PUT");
          toast("Direction updated.");
        } },
        h("option", { value: "" }, "No direction"),
        ...d.tags.map((t) => h("option", { value: t.id, selected: m.direction_tag_id === t.id }, t.label))))),
    isAdmin ? h("div", { class: "row", style: "margin-top:14px;padding-top:14px;border-top:1px solid var(--border)" },
      (() => {
        const l = h("input", { placeholder: "Add direction tag (e.g. North, QC)…" });
        return [l, h("button", { class: "btn sm", onclick: async () => {
            if (!l.value.trim()) return;
            await api(`/api/groups/${gid}/tags`, { label: l.value.trim() });
            l.value = ""; pageGroupRerender(gid);
          } }, "+ Tag")];
      })()) : null));

  /* ── map + settings row ── */
  el.append(h("div", { class: "grid2" },
    h("div", { class: "panel card-hover", style: "cursor:pointer", onclick: () => (location.hash = `/map/${gid}`) },
      h("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:8px" },
        icon3d("mappin", { size: 26 }),
        h("h2", { style: "margin-bottom:0" }, "Hangout Map")),
      h("p", { class: "dim" },
        `${spots.length} spot${spots.length !== 1 ? "s" : ""}${spots.some((s) => s.stale) ? " · some need re-confirming" : ""}`),
      h("p", { style: "margin-top:12px;color:var(--accent-text);font:600 13px var(--font)" }, "Open map →")),
    isAdmin ? h("div", { class: "panel" },
      h("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:16px" },
        icon3d("setting", { size: 26 }),
        h("h2", { style: "margin-bottom:0" }, "Group settings")),
      settingsPanel(gid, d)) : null));

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
    h("button", { class: "btn primary", style: "margin-top:16px;width:100%;justify-content:center", onclick: async () => {
        await api(`/api/groups/${gid}/settings`, { vouches_required: Number(vq.value), buddy_notify_min: Number(buddyMin.value), admin_notify_min: Number(adminMin.value) }, "PATCH");
        toast("Settings saved.");
      } }, "Save settings"));
}

async function inviteFlow(gid) {
  const r = await api(`/api/groups/${gid}/invite`, {});
  openSheet("Invite to crew", h("div", {},
    h("p", { style: "font-size:14px;color:var(--text-2);margin-bottom:14px" }, "Share this link with someone you trust. They'll need a vouch from an existing member before they can join."),
    h("div", { class: "inset", style: "font-family:var(--mono);font-size:13px;word-break:break-all;margin-bottom:14px" }, `${location.origin}${r.invite_url}`),
    h("button", { class: "btn primary", style: "width:100%;justify-content:center", onclick: () => {
        navigator.clipboard?.writeText(`${location.origin}${r.invite_url}`);
        toast("Link copied!");
      } }, "Copy link")));
}

function sessionForm(gid, d) {
  const when   = h("input", { type: "datetime-local" });
  const spotSel = h("select", {}, h("option", { value: "" }, "— no spot —"), ...(d.spotsList?.map?.((s) => h("option", { value: s.id }, s.name)) ?? []));
  const ddSel  = h("select", {}, h("option", { value: "" }, "No designated driver"), ...d.members.map((m) => h("option", { value: m.user_id }, m.name)));
  openSheet("New session", h("div", {},
    h("label", { class: "f" }, "When"), when,
    h("label", { class: "f" }, "Location (add on map first)"), spotSel,
    h("label", { class: "f" }, "Designated driver (excluded from alcohol items)"), ddSel,
    h("p", { class: "dim", style: "margin-top:8px;font-size:13px" }, "The DD is automatically skipped on every alcohol expense."),
    h("button", { class: "btn primary", style: "margin-top:18px;width:100%;justify-content:center", onclick: async () => {
        if (!when.value) return toast("Pick a date and time.", true);
        const r = await api(`/api/groups/${gid}/sessions`, { starts_at: when.value, designated_driver_id: ddSel.value ? Number(ddSel.value) : null });
        location.hash = `/s/${r.id}`;
      } }, "Create session")));
}

function pageGroupRerender(gid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/g/${gid}`)); }

/* ════════════════════════════════════
   SESSION SCREEN
   ════════════════════════════════════ */
export async function pageSession(sid) {
  const d   = await api(`/api/sessions/${sid}`);
  const gid = d.session.group_id;
  const gd  = await api(`/api/groups/${gid}`);
  const isAdmin = gd.members.find((m) => m.user_id === me().id)?.role === "admin";
  const nameOfU = (uid) => gd.members.find((m) => m.user_id === Number(uid))?.name ?? d.session.designated_driver_name ?? `#${uid}`;
  const el = h("div", { class: "enter" });

  /* header */
  el.append(h("div", { class: "panel" },
    h("div", { class: "row spread", style: "margin-bottom:14px" },
      h("div", {},
        h("p", { style: "font:500 13px var(--font);color:var(--text-2);margin-bottom:4px" },
          h("a", { href: `#/g/${gid}`, style: "color:var(--accent-text);text-decoration:none" }, gd.group?.name ?? "Crew"), " · session"),
        h("h1", { style: "font:700 20px var(--font);color:var(--text);letter-spacing:-0.3px" },
          new Date(d.session.starts_at + "Z").toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))),
      h("span", { class: `status-bar ${d.session.status}` }, statusLabel(d.session.status))),
    d.spot ? h("p", { style: "font-size:14px;color:var(--text-2);display:inline-flex;align-items:center;gap:6px" }, icon3d("mappin", { size: 16 }), d.spot.name) : null,
    d.session.designated_driver_id
      ? h("div", { class: "inset", style: "margin-top:14px;display:flex;align-items:center;gap:10px" },
          icon3d("travel", { size: 24 }),
          h("span", {}, h("b", {}, "DD: "), nameOfU(d.session.designated_driver_id)),
          h("span", { class: "dim" }, "— excluded from alcohol items"))
      : null));

  /* RSVP */
  const my = d.rsvps.find((r) => r.user_id === me().id);
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Who's coming"),
    h("div", { class: "rsvp-bar" },
      ...[["going", "Going"], ["maybe", "Maybe"], ["cant", "Can't"]].map(([st, label]) =>
        h("button", {
          class: `btn ${my?.status === st ? "primary" : ""}`,
          onclick: async () => { await api(`/api/sessions/${sid}/rsvp`, { status: st }); pageSessionRerender(sid); }
        }, label))),
    h("div", { class: "receipt" },
      ...gd.members.filter((m) => m.status === "active").map((m) => {
        const r = d.rsvps.find((x) => x.user_id === m.user_id);
        return h("div", { class: "line" },
          h("span", {}, m.name + (m.user_id === me().id ? " (you)" : "")),
          h("span", { style: r?.status === "going" ? "color:var(--green);font-weight:600" : r?.status === "cant" ? "color:var(--red)" : "" },
            r ? { going: "Going", maybe: "Maybe", cant: "Can't" }[r.status] : "—"));
      }))));

  /* tabs */
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

  /* ── Expenses tab ── */
  function tabExpenses() {
    const wrap = h("div", { class: "panel" });
    if (d.session.status !== "closed")
      wrap.append(addExpenseForm(d, sid, nameOfU, () => pageSessionRerender(sid)));
    else
      wrap.append(h("div", { class: "inset", style: "margin-bottom:16px" },
        h("p", { class: "dim" }, "Tab is closed. " + (isAdmin ? "You can reopen it below." : "Contact an admin if something's wrong."))));
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
                  h("span", { style: "display:inline-flex;align-items:center;gap:6px" },
                    icon3d(e.is_alcohol ? "cup" : "takeaway", { size: 18 }),
                    e.description),
                  h("span", {}, `${fmtPeso(e.amount_centavos)} — paid by ${e.payer_name ?? nameOfU(e.paid_by)}`)),
                h("div", { class: "dim", style: "padding:2px 0 8px;font-size:12px" },
                  `Split with: ${parts.map(nameOfU).join(", ") || "—"}` +
                  (e.edited_after_close ? " · ⟨edited after close⟩" : "")));
            }),
            h("div", { class: "line total" }, h("span", {}, "TOTAL"), h("span", { class: "money" }, fmtPeso(total)))));
    return wrap;
  }

  /* ── Settle tab ── */
  function tabSettle() {
    const wrap = h("div", { class: "panel" }, h("h2", {}, "Settle up"));
    if (isAdmin && d.session.status !== "closed")
      wrap.append(h("button", { class: "btn primary", style: "margin-bottom:18px", onclick: async () => {
          await api(`/api/sessions/${sid}/close-tab`, {});
          toast("Tab closed — no more edits without reopening.");
          pageSessionRerender(sid);
        } }, "Close tab"));
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
            { open: "Open", paid_claimed: "Claimed paid", confirmed: "Confirmed", disputed: "Disputed" }[t.status]),
          t.note ? h("div", { class: "dim", style: "margin-top:4px" }, `"${t.note}"`) : null),
        h("span", { class: "money" }, fmtPeso(t.amount_centavos)));
      if (mine_payer && t.status === "open")
        row.append(h("button", { class: "btn good sm", onclick: async () => {
            await api(`/api/settlements/${t.id}/claim-paid`, {});
            pageSessionRerender(sid);
          } }, "I've paid"));
      if (mine_recv && t.status === "paid_claimed")
        row.append(
          h("button", { class: "btn good sm", onclick: async () => {
              await api(`/api/settlements/${t.id}/confirm`, {});
              toast("Confirmed. All good.");
              pageSessionRerender(sid);
            } }, "Confirm received"),
          h("button", { class: "btn bad sm", onclick: () => disputeForm(t.id, sid) }, "Dispute"));
      wrap.append(row);
    }
    if (isAdmin && d.session.status === "closed")
      wrap.append(h("button", { class: "btn ghost", style: "margin-top:14px;width:100%;justify-content:center", onclick: async () => {
          const r = await api(`/api/sessions/${sid}/reopen`, {});
          toast(r.note);
          pageSessionRerender(sid);
        } }, "Reopen tab (voids unpaid, keeps confirmed)"));
    return wrap;
  }

  /* ── Uwian tab ── */
  function tabUwian() {
    const wrap = h("div", { class: "panel" },
      h("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:16px" },
        icon3d("travel", { size: 28, class: "icon-3d-float" }),
        h("h2", { style: "margin-bottom:0" }, "Uwian — get everyone home safe")));
    if (isAdmin && d.session.status === "open")
      wrap.append(h("button", { class: "btn primary", style: "margin-bottom:18px;width:100%;justify-content:center", onclick: async () => {
          const deadline = new Date(Date.now() + 45 * 60000).toISOString().slice(0, 19).replace("T", " ");
          await api(`/api/sessions/${sid}`, { status: "wrapped", uwian_deadline: deadline }, "PATCH");
          toast("Uwian time! Buddies paired by direction.");
          pageSessionRerender(sid);
        } }, "Uwian na!"));
    const myCi = d.checkins.find((c) => c.user_id === me().id);
    if (!myCi?.home_confirmed_at) {
      const modeSel = h("select", { style: "width:auto" }, ...Object.entries(MODES).map(([k, v]) => h("option", { value: k }, v)));
      wrap.append(h("div", { class: "inset row", style: "margin-bottom:18px" },
        h("b", {}, "How are you getting home?"), modeSel,
        h("button", { class: "btn good", onclick: async () => {
            await api(`/api/sessions/${sid}/checkin`, { mode: modeSel.value });
            toast("Checked in! Stay safe out there.");
            pageSessionRerender(sid);
          } }, "I'm home")));
    }
    wrap.append(h("h3", { style: "margin:0 0 10px" }, "Who's home"),
      ...gd.members.filter((m) => m.status === "active").map((m) => {
        const ci   = d.checkins.find((c) => c.user_id === m.user_id);
        const rsvp = d.rsvps.find((r) => r.user_id === m.user_id);
        if (rsvp?.status === "cant") return null;
        const row = h("div", { class: "list-row" }, avatar(m.name), lampFor(ci),
          h("div", { class: "grow" }, m.name,
            ci?.mode ? h("span", { class: "dim" }, ` · ${MODES[ci.mode]}`) : null,
            ci?.ride_offer_from ? h("span", { class: "chip green", style: "margin-left:6px" }, "Ride offered") : null),
          ci?.flag_stage >= 2 && !ci?.home_confirmed_at
            ? h("button", { class: "btn sm", onclick: async () => {
                const pair = d.buddy_pairs.find((p) => [p.user_a, p.user_b, p.user_c].includes(m.user_id));
                if (!pair) return toast("No buddy pair — contact admin.", true);
                await api(`/api/buddies/${sid}/${pair.user_a}/${pair.user_b}/clear-flag`, {});
                toast("Flag cleared. Thanks for checking in on each other.");
                pageSessionRerender(sid);
              } }, "Spoke to them, all good")
            : null);
        if (ci?.mode === "own_drive" && d.session.designated_driver_id !== m.user_id && !ci.ride_offer_from && m.user_id !== me().id)
          row.append(h("button", { class: "btn ghost sm", onclick: async () => {
              await api(`/api/buddies/${sid}/${m.user_id}/0/offer-ride`, {});
              toast("Ride offered. Legend.");
              pageSessionRerender(sid);
            } }, "Offer them a ride?"));
        return row;
      }));
    if (d.buddy_pairs.length)
      wrap.append(
        h("h3", { style: "margin:18px 0 10px" }, "Buddy pairs (by direction)"),
        h("div", { class: "receipt" },
          ...d.buddy_pairs.map((p) => h("div", { class: "line" }, h("span", {}, p.names.join(" + ")), h("span", {})))));
    wrap.append(h("p", { class: "dim", style: "margin-top:18px;font-size:12px;border-top:1px solid var(--border);padding-top:14px" },
      "This app is not a rescue service. Escalation is just a nudge to check in. In a real emergency, call your local emergency number."));
    return wrap;
  }

  /* ── My Limit tab ── */
  function tabLimit() {
    const wrap = h("div", { class: "panel" },
      h("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:6px" },
        icon("sliders", { size: 20, strokeColor: "var(--accent-text)" }),
        h("h2", { style: "margin-bottom:0" }, "My Limit")),
      h("p", { class: "dim", style: "margin-bottom:18px" }, "Private — only you can see this. A personal reminder, not an alcohol calculator."));
    const board = h("div", { class: "tally-board" });
    const limIn = h("input", { type: "number", min: 1, style: "width:80px" });

    async function refresh() {
      const r = await api(`/api/sessions/${sid}/limit`);
      board.innerHTML = "";
      const show = Math.max(r.lim ?? 0, r.count, 8);
      for (let i = 1; i <= Math.min(show, 12); i++)
        board.append(h("div", { class: `tally ${i <= r.count ? "full" : "empty"}` }, i <= r.count ? "/" : "·"));
      const pct = r.lim ? r.count / r.lim : 0;
      if (pct >= 0.8) board.append(h("div", { class: `chip ${pct >= 1 ? "red" : "amber"}`, style: "align-self:center;margin-left:4px" },
        pct >= 1 ? "At your limit — sort your ride?" : "Getting close — sort your ride?"));
      if (pct >= 0.8) board.append(h("button", { class: "btn good sm", style: "align-self:center", onclick: () => { cur = "uwian"; renderTab(); } }, "Check in now"));
    }

    const push = h("button", { class: "round-push", onclick: async () => {
        const r = await api(`/api/sessions/${sid}/limit/tap`, {});
        if (navigator.vibrate) navigator.vibrate(30);
        if (r.level) toast(r.level === "at_limit" ? "You've hit your limit — sort your ride home." : "Getting close to your limit.");
        refresh();
      } }, "+ 1 round");

    wrap.append(
      h("div", { style: "display:flex;align-items:flex-start;gap:22px;flex-wrap:wrap;margin-top:4px" },
        push,
        h("div", { class: "grow" },
          board,
          h("div", { class: "row", style: "margin-top:16px;flex-wrap:wrap" },
            h("label", { class: "f", style: "margin:0;white-space:nowrap" }, "My limit (rounds)"),
            limIn,
            h("button", { class: "btn sm", onclick: async () => {
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
  const amt   = h("input", { placeholder: "Amount ₱", inputmode: "decimal", style: "max-width:140px" });
  const payer = h("select", { style: "width:auto" },
    ...d.members.map((m) => h("option", { value: m.user_id, selected: m.user_id === me().id }, m.name)));
  let isAlcohol = true;
  const note  = h("p", { class: "dim", style: "margin-top:8px;font-size:13px" }, alcoholNote(d));
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
      ? `Auto-split: ${dd} is excluded from alcohol, as are non-drinkers.`
      : "Marked as alcohol: DD will be excluded automatically.";
  }

  const checks = h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" }, ...d.members.map((m) => {
    const cb = h("input", { type: "checkbox", checked: true, style: "width:auto" });
    cb.dataset.uid = m.user_id;
    return h("label", { class: "chip", style: "display:inline-flex;gap:6px;align-items:center;cursor:pointer;padding:5px 10px" }, cb, m.name);
  }));

  return h("div", { class: "inset", style: "margin-bottom:18px" },
    h("div", { class: "row" }, desc, amt, payer, togg),
    h("div", { class: "row", style: "margin-top:10px" }, h("span", { class: "dim" }, "Split with:"), checks),
    note,
    h("button", { class: "btn primary", style: "margin-top:14px;width:100%;justify-content:center", onclick: async () => {
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
  const note = h("textarea", { placeholder: "Describe the issue — the admin will see this.", style: "min-height:100px" });
  openSheet("Dispute transfer", h("div", {}, note,
    h("button", { class: "btn bad", style: "margin-top:14px;width:100%;justify-content:center", onclick: async () => {
        if (!note.value.trim()) return toast("Please describe the issue first.", true);
        await api(`/api/settlements/${id}/dispute`, { note: note.value });
        toast("Marked as disputed. Admins have been notified.");
        pageSessionRerender(sid);
      } }, "Submit dispute")));
}

function pageSessionRerender(sid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/s/${sid}`)); }

/* ════════════════════════════════════
   PUBLIC / VERIFIED HANGOUT RADAR MAP
   ════════════════════════════════════ */
export async function pageMap(gid) {
  const spots = gid
    ? await api(`/api/groups/${gid}/spots`).catch(() => [])
    : await api("/api/map/radar").catch(() => []);

  const gd = gid ? await api(`/api/groups/${gid}`).catch(() => null) : null;
  const el = h("div", { class: "enter" });

  /* Map Header */
  el.append(h("div", { class: "panel" },
    h("div", { style: "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:6px" },
      h("div", { style: "display:flex;align-items:center;gap:12px" },
        h("div", { style: "width:48px;height:48px;border-radius:12px;background:var(--accent-dim);border:1.5px solid var(--accent-mid);display:grid;place-items:center;flex:none" },
          icon3d("radar", { size: 28, class: "icon-3d-float" })),
        h("div", {},
          h("h1", { style: "font:700 22px var(--font);letter-spacing:-0.3px;margin:0" },
            gid && gd ? `${gd.group.name} · Tambayan Map` : "Verified Hangout Radar"),
          h("p", { class: "dim", style: "margin:3px 0 0;font-size:13px" },
            "Scheduled and active drinking sessions, closing hours, and verified tambayan spots."))),
      h("div", { style: "display:flex;align-items:center;gap:8px" },
        h("span", { class: "chip green icon-text-row" }, icon3d("shield", { size: 14 }), "Verified Members Only"),
        gid ? h("button", { class: "btn ghost sm", onclick: () => { location.hash = `/g/${gid}`; } }, "← Back to crew") : null))));

  /* Interactive Filters */
  let activeFilter = "all";
  const activeSpotsCount = spots.filter(s => s.has_active_session || (s.sessions && s.sessions.length > 0)).length;

  const btnAll = h("button", { class: "filter-chip active", onclick: () => setFilter("all") }, `All Spots (${spots.length})`);
  const btnActive = h("button", { class: "filter-chip", onclick: () => setFilter("active") }, `Active / Scheduled (${activeSpotsCount})`);
  const btnLate = h("button", { class: "filter-chip", onclick: () => setFilter("late") }, "Late Night (Open 1AM+)");
  const filterRow = h("div", { class: "filter-bar", style: "margin:10px 0 14px" }, btnAll, btnActive, btnLate);
  el.append(filterRow);

  /* Map Container */
  const mapFrame = h("div", { class: "map-frame" }, h("div", { id: "map" }));
  el.append(mapFrame);

  /* Spot List Container */
  const listPanel = h("div", { class: "panel" });
  el.append(listPanel);

  let mapInstance = null;
  const markersMap = new Map();

  function renderList(filteredSpots) {
    listPanel.innerHTML = "";
    listPanel.append(h("div", { class: "section-head", style: "margin-bottom:12px" },
      h("h2", {}, `Tambayans & Sessions (${filteredSpots.length})`),
      gid ? h("span", { class: "dim", style: "font-size:12px" }, "Double-click map to drop a new spot") : null));

    if (filteredSpots.length === 0) {
      listPanel.append(h("div", { class: "hero-empty", style: "padding:32px 0" },
        h("div", { class: "hero-icon", style: "border:none;background:transparent" }, icon3d("mappin", { size: 48, class: "icon-3d-float" })),
        h("h3", {}, "No spots in this filter"),
        h("p", {}, "Try selecting All Spots above to see every verified hangout.")));
      return;
    }

    const cardsGrid = h("div", { class: "map-radar-list" });
    filteredSpots.forEach(sp => {
      const hasSessions = sp.sessions && sp.sessions.length > 0;
      const closingText = sp.closes_at ? `Closes ${sp.closes_at}` : "Closes late";
      const card = h("div", {
        class: `map-radar-card ${sp.has_active_session ? "active-session" : ""}`,
        onclick: () => {
          if (mapInstance) {
            mapInstance.flyTo([sp.lat, sp.lng], 15, { duration: 1 });
            const m = markersMap.get(sp.id);
            if (m) m.openPopup();
          }
        }
      },
        h("div", { style: "display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px" },
          h("div", {},
            h("div", { style: "font:700 15px var(--font);color:var(--text)" }, sp.name),
            sp.group_name ? h("div", { class: "dim", style: "font-size:12px;margin-top:2px" }, `Host crew: ${sp.group_name}`) : null),
          h("span", { class: `chip ${sp.has_active_session ? "amber" : "green"} icon-text-row`, style: "font-weight:600" },
            icon3d("clock", { size: 13 }), closingText)),
        sp.notes ? h("p", { style: "font-size:13px;color:var(--text-2);margin:6px 0 10px;line-height:1.4" }, sp.notes) : null,
        hasSessions ? h("div", { class: "radar-session-box" },
          h("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:6px" },
            h("span", { style: "font:600 12.5px var(--font);color:var(--text)" },
              `${sp.sessions.length} session${sp.sessions.length !== 1 ? "s" : ""} scheduled`),
            h("span", { class: "chip primary icon-text-row" }, icon3d("cup", { size: 13 }), "Drinking session")),
          ...sp.sessions.slice(0, 2).map(sess => h("div", { style: "font-size:12px;color:var(--text-2);margin-top:4px" },
            `• ${sess.group_name || "Crew"}: ${fmtSessionTime(sess.starts_at)} (${sess.going_count || 0} going)`))) : null,
        h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid var(--border)" },
          h("span", { class: "dim", style: "font-size:11.5px" }, `Freshness: ${timeAgo(sp.last_confirmed_at)}`),
          h("button", {
            class: "btn ghost sm",
            onclick: (e) => { e.stopPropagation(); confirmSpot(sp.id, "yes"); }
          }, "Confirm Open"))
      );
      cardsGrid.append(card);
    });
    listPanel.append(cardsGrid);
  }

  function setFilter(filter) {
    activeFilter = filter;
    btnAll.classList.toggle("active", filter === "all");
    btnActive.classList.toggle("active", filter === "active");
    btnLate.classList.toggle("active", filter === "late");

    let filtered = spots;
    if (filter === "active") {
      filtered = spots.filter(s => s.has_active_session || (s.sessions && s.sessions.length > 0));
    } else if (filter === "late") {
      filtered = spots.filter(s => {
        const c = s.closes_at || "";
        return c.startsWith("01") || c.startsWith("02") || c.startsWith("03") || c.startsWith("04") || c.startsWith("05") || c.toLowerCase().includes("am");
      });
    }
    renderList(filtered);
  }

  requestAnimationFrame(() => {
    const center = spots.length > 0 ? [spots[0].lat, spots[0].lng] : [14.676, 121.0437];
    const map = L.map("map").setView(center, 13);
    mapInstance = map;
    window._leafletMapInstance = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);

    markersMap.clear();
    for (const sp of spots) {
      const isActive = sp.has_active_session || (sp.sessions && sp.sessions.length > 0);
      const pinClass = isActive ? "pin-spot pin-active" : (sp.stale ? "pin-spot pin-stale" : "pin-spot");
      const markIcon = L.divIcon({ className: "", html: `<div class="${pinClass}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] });
      const marker = L.marker([sp.lat, sp.lng], { icon: markIcon }).addTo(map);
      markersMap.set(sp.id, marker);

      let popupHtml = `<div class="radar-popup">
        <div class="radar-popup-title">${sp.name}</div>
        <div class="radar-popup-closing">Open until ${sp.closes_at || "Late"} · ${sp.price_range || "$$"}</div>
        ${sp.notes ? `<div style="font-size:12px;color:var(--text-2);margin-bottom:6px">${sp.notes}</div>` : ""}`;

      if (sp.sessions && sp.sessions.length > 0) {
        popupHtml += `<div class="radar-session-box"><div style="font-weight:700;font-size:12px;color:var(--accent-text);margin-bottom:4px">Scheduled Drinking Sessions:</div>`;
        for (const s of sp.sessions) {
          popupHtml += `<div style="font-size:11.5px;color:var(--text);margin-bottom:3px"><strong>${s.group_name}</strong> · ${fmtSessionTime(s.starts_at)} (${s.going_count || 0} going)</div>`;
        }
        popupHtml += `</div>`;
      }
      popupHtml += `</div>`;
      marker.bindPopup(popupHtml);
    }

    if (gid) {
      map.on("dblclick", async (e) => {
        const nm = prompt("Spot name:"); if (!nm) return;
        const closes = prompt("Closing time (e.g. 02:00):", "02:00") || "02:00";
        await api(`/api/groups/${gid}/spots`, { name: nm, lat: e.latlng.lat, lng: e.latlng.lng, price_range: "$$", closes_at: closes, notes: "" });
        toast("Spot added to map.");
        pageMapRerender(gid);
      });
    }
  });

  renderList(spots);

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
function pageMapRerender(gid) { location.hash = ""; requestAnimationFrame(() => (location.hash = gid ? `/map/${gid}` : "/map")); }

/* ════════════════════════════════════
   NOTIFICATIONS
   ════════════════════════════════════ */
export async function bellDrawer() {
  const notifs = await api("/api/me/notifications");
  openSheet("Notifications", h("div", {},
    notifs.length === 0 ? h("div", { style: "text-align:center;padding:28px 0;color:var(--text-2)" },
      h("div", { style: "width:44px;height:44px;border-radius:12px;background:var(--green-dim);display:grid;place-items:center;margin:0 auto 10px" },
        icon("check", { size: 22, strokeColor: "var(--green)" })),
      h("p", { style: "font:600 14px var(--font);color:var(--text)" }, "All clear — nothing to see here.")) : null,
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
          h("div", { class: "dim", style: "margin-top:2px" }, p.message ?? "")),
        h("button", { class: "btn sm", onclick: async () => { await api(`/api/notifications/${n.id}/read`, {}); bellRefresh(); } }, "Dismiss"));
    })));
}
function bellRefresh() { location.hash = ""; requestAnimationFrame(() => (location.hash = location.hash || "/groups")); }
