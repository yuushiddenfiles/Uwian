import { $, api, h, toast, icon, icon3d, timeAgo } from "./util.js";
import * as P from "./pages.js?v=3";

const view = $("#view");

async function route() {
  const path = location.hash.slice(1) || "/groups";
  view.innerHTML = "";
  const loading = h("div", { class: "panel" }, h("p", { class: "dim" }, "Loading."));
  view.append(loading);
  const isAuth = path === "/login" || path === "/signup";
  document.body.classList.toggle("auth-mode", isAuth);
  try {
    if (isAuth) return render(path === "/login" ? P.pageLogin() : P.pageSignup());
    if (!P.me()) { const u = await P.loadMe(); if (!u) { location.hash = "/login"; return; } }
    await api("/api/escalation-tick", {}, "POST").catch(() => {}); // lazy escalation on load
    // Cleanup message poll on navigation
    if (window._msgCleanup) { window._msgCleanup(); window._msgCleanup = null; }
    let el;
    if (path === "/" || path === "/groups") el = await P.pageGroups();
    else if (path === "/map" || path.startsWith("/map/")) {
      const gid = path.split("/")[2] ? Number(path.split("/")[2]) : null;
      el = await P.pageMap(gid);
    }
    else if (path === "/messages" || path.startsWith("/messages/")) {
      const cid = path.split("/")[2] ? Number(path.split("/")[2]) : null;
      el = await P.pageMessages(cid);
    }
    else if (path.startsWith("/g/")) el = await P.pageGroup(Number(path.split("/")[2]));
    else if (path.startsWith("/s/")) el = await P.pageSession(Number(path.split("/")[2]));
    else if (path.startsWith("/join/")) {
      const gid = Number(path.split("/")[2]);
      const r = await api(`/api/groups/${gid}/join`, {});
      toast(r.status === "active" ? "You are already in. Welcome back." : "Request sent. Waiting for someone to vouch for you.");
      location.hash = `/g/${gid}`; return;
    }
    else el = h("div", { class: "panel" }, h("h2", {}, "Page not found"));
    render(el);
  } catch (e) {
    if (String(e.message).includes("Please log in")) { location.hash = "/login"; return; }
    render(h("div", { class: "panel shake" }, h("h2", {}, "Something went wrong"), h("p", {}, e.message)));
  }
}

function render(el) {
  view.innerHTML = "";
  view.append(el);
  window.scrollTo({ top: 0, behavior: "instant" });
  refreshBell();
}

/* ── nav & user menu ── */
let menuOpen = false;

function closeUserMenu() {
  menuOpen = false;
  const menu = document.querySelector(".user-menu-dropdown");
  const trigger = document.querySelector(".nav-user-trigger");
  if (menu) menu.remove();
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

function toggleUserMenu(user, trigger) {
  if (menuOpen) {
    closeUserMenu();
    return;
  }
  menuOpen = true;
  trigger.setAttribute("aria-expanded", "true");

  const dropdown = h("div", { class: "user-menu-dropdown enter", role: "menu" },
    h("div", { class: "menu-head" },
      h("div", { class: "menu-head-name" }, user.name),
      h("div", { class: "menu-head-email" }, user.email),
      h("div", { class: "menu-trust-badge" }, icon3d("shield", { size: 14 }), "ID Verified · Safe Space")),
    h("button", {
      class: "menu-item",
      onclick: () => { closeUserMenu(); P.showVerificationSheet && P.showVerificationSheet(); }
    }, icon3d("shield", { size: 18 }), "ID & Safety Center"),
    h("button", {
      class: "menu-item",
      onclick: () => { closeUserMenu(); location.hash = "/map"; }
    }, icon3d("mappin", { size: 18 }), "Live Hangout Map"),
    h("button", {
      class: "menu-item",
      onclick: async () => {
        try {
          const next = !user.can_drink;
          await api("/api/me", { can_drink: next }, "PATCH");
          user.can_drink = next ? 1 : 0;
          toast(next ? "Preference: Open to drinking sessions" : "Preference: Non-drinker");
          closeUserMenu();
        } catch (e) { toast(e.message, true); }
      }
    }, icon3d(user.can_drink ? "cup" : "teacup", { size: 18 }), user.can_drink ? "Status: Drinks" : "Status: Non-drinker"),
    h("button", {
      class: "menu-item",
      onclick: () => { closeUserMenu(); location.hash = "/groups"; }
    }, icon3d("boy", { size: 18 }), "My Crews"),
    h("div", { class: "menu-divider" }),
    h("button", {
      class: "menu-item danger",
      onclick: async () => {
        closeUserMenu();
        await api("/api/logout", {});
        location.hash = "/login";
      }
    }, icon("logout", { size: 16 }), "Sign out")
  );

  trigger.parentElement.append(dropdown);
}

document.addEventListener("click", (e) => {
  if (menuOpen && !e.target.closest(".nav-user-wrap")) {
    closeUserMenu();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menuOpen) closeUserMenu();
});

function refreshNav() {
  const nav = $("#topnav");
  if (nav) nav.innerHTML = "";
  const user = P.me();

  const hash = location.hash;
  const isGroups = !hash || hash === "#/groups" || hash.startsWith("#/g/") || hash.startsWith("#/s/");
  const isMap = hash === "#/map" || hash.startsWith("#/map/");
  const isMessages = hash === "#/messages" || hash.startsWith("#/messages/");

  // Sync active states on glass rail and floating dock
  const railGroups = $("#rail-groups-btn");
  const railMap = $("#rail-map-btn");
  const dockSessions = $("#dock-sessions");
  const dockMap = $("#dock-map");
  const dockMessages = $("#dock-messages");
  const railMsg = $("#rail-msg-btn");

  if (railGroups) railGroups.classList.toggle("active", isGroups);
  if (railMap) railMap.classList.toggle("active", isMap);
  if (railMsg) railMsg.classList.toggle("active", isMessages);
  if (dockSessions) dockSessions.classList.toggle("active", isGroups);
  if (dockMap) dockMap.classList.toggle("active", isMap);
  if (dockMessages) dockMessages.classList.toggle("active", isMessages);

  const drinkIcon = $("#rail-drink-icon");
  if (drinkIcon && user) {
    drinkIcon.src = user.can_drink ? "/img/3d/cup.png" : "/img/3d/teacup.png";
  }

  if (user) {
    if (nav) {
      nav.append(
        h("a", { href: "#/groups", class: isGroups ? "on" : "", "aria-current": isGroups ? "page" : undefined }, "Explore & Crews"),
        h("a", { href: "#/map", class: isMap ? "on" : "", "aria-current": isMap ? "page" : undefined, style: "display:inline-flex;align-items:center;gap:6px" },
          icon3d("mappin", { size: 15 }), "Live Map")
      );
    }

    /* User wrap with avatar pill and interactive dropdown */
    const initials = user.name?.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() ?? "?";
    const firstName = user.name?.split(" ")[0] ?? "Account";

    function createUserTrigger(isMini = false) {
      const trigger = h("button", {
        class: isMini ? "nav-user-trigger mini-rail-trigger" : "nav-user-trigger",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        title: `Account: ${user.name}`,
        onclick: (e) => {
          e.stopPropagation();
          toggleUserMenu(user, trigger);
        }
      },
        h("div", { class: "nav-signout", style: "width:28px;height:28px;font-size:11px;flex:none" }, initials),
        !isMini ? h("span", { class: "user-name-short" }, firstName) : null,
        !isMini ? icon("chevron", { size: 11, class: "nav-chevron" }) : null
      );
      return h("div", { class: "nav-user-wrap" }, trigger);
    }

    const railSlot = $("#rail-user-slot");
    if (railSlot) {
      railSlot.innerHTML = "";
      railSlot.append(createUserTrigger(true));
    }

    const dockMobileSlot = $("#dock-mobile-user-slot");
    if (dockMobileSlot) {
      dockMobileSlot.innerHTML = "";
      dockMobileSlot.append(createUserTrigger(true));
    }
  } else {
    if (nav) nav.append(h("a", { href: "#/login" }, "Log in"));
  }
}

async function refreshBell() {
  const dot = $("#bell-count");
  if (!dot) return;
  if (!P.me()) return (dot.hidden = true);
  try {
    const n = await api("/api/me/notifications");
    dot.textContent = n.length; dot.hidden = n.length === 0;
  } catch { dot.hidden = true; }
  // Update messages unread badge
  try {
    const r = await api("/api/conversations/unread-count");
    const msgDot = $("#dock-msg-badge");
    if (msgDot) { msgDot.textContent = r.unread; msgDot.hidden = r.unread === 0; }
    const refDot = $("#ref-msg-badge");
    if (refDot) { refDot.textContent = r.unread; refDot.hidden = r.unread === 0; }
  } catch {}
}

/* logo → home */
document.querySelectorAll(".logo-btn").forEach(btn => {
  btn.addEventListener("click", () => { location.hash = "/groups"; });
});

$("#bell")?.addEventListener("click", () => P.bellDrawer && P.bellDrawer());

/* Wire dock & rail quick actions */
$("#rail-search-btn")?.addEventListener("click", () => focusSearch());
$("#dock-search")?.addEventListener("click", () => focusSearch());

function focusSearch() {
  if (location.hash !== "#/groups" && location.hash !== "" && location.hash !== "#/") {
    location.hash = "/groups";
    setTimeout(doFocus, 350);
  } else {
    doFocus();
  }
  function doFocus() {
    const s = document.querySelector("#session-search");
    if (s) {
      s.scrollIntoView({ behavior: "smooth", block: "center" });
      s.focus();
    }
  }
}

$("#rail-safety-btn")?.addEventListener("click", () => P.showVerificationSheet && P.showVerificationSheet());
$("#dock-safety")?.addEventListener("click", () => P.showVerificationSheet && P.showVerificationSheet());
$("#rail-buddy-btn")?.addEventListener("click", () => P.showBuddyEscortSheet && P.showBuddyEscortSheet());
$("#rail-drink-btn")?.addEventListener("click", async () => {
  const user = P.me();
  if (!user) return;
  try {
    const next = !user.can_drink;
    await api("/api/me", { can_drink: next }, "PATCH");
    user.can_drink = next ? 1 : 0;
    const drinkIcon = $("#rail-drink-icon");
    if (drinkIcon) drinkIcon.src = next ? "/img/3d/cup.png" : "/img/3d/teacup.png";
    toast(next ? "Preference: Drinks alcohol" : "Preference: Non-drinker");
  } catch (e) { toast(e.message, true); }
});

$("#dock-new-crew")?.addEventListener("click", () => {
  if (window._uwianNewCrewSheet) {
    window._uwianNewCrewSheet();
  } else {
    const btn = document.querySelector("#new-crew-btn");
    if (btn) btn.click();
    else {
      location.hash = "/groups";
      setTimeout(() => document.querySelector("#new-crew-btn")?.click(), 300);
    }
  }
});

$("#dock-new-session")?.addEventListener("click", () => {
  if (window._planSessionSheet) {
    window._planSessionSheet();
  } else {
    location.hash = "/groups";
    setTimeout(() => window._planSessionSheet?.(), 350);
  }
});

$("#dock-sessions")?.addEventListener("click", () => {
  const onGroups = !location.hash || location.hash === "#/groups" || location.hash === "#/";
  if (onGroups && window._switchDashboardView) {
    window._switchDashboardView("sessions");
  } else {
    location.hash = "/groups";
    setTimeout(() => window._switchDashboardView?.("sessions"), 350);
  }
});

$("#dock-crews")?.addEventListener("click", () => {
  const onGroups = !location.hash || location.hash === "#/groups" || location.hash === "#/";
  if (onGroups && window._switchDashboardView) {
    window._switchDashboardView("crews");
  } else {
    location.hash = "/groups";
    setTimeout(() => window._switchDashboardView?.("crews"), 350);
  }
});

/* Live clock ticker for the panel */
setInterval(() => {
  const clockEl = document.querySelector("#live-clock-time");
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
}, 30000);

window.addEventListener("hashchange", () => { refreshNav(); route(); });

(async () => { await P.loadMe().catch(() => {}); refreshNav(); route(); })();
