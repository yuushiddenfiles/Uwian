import { $, api, h, toast, icon, icon3d } from "./util.js";
import * as P from "./pages.js";

const view = $("#view");

async function route() {
  const path = location.hash.slice(1) || "/groups";
  view.innerHTML = "";
  try {
    if (path === "/login" || path === "/signup") return render(path === "/login" ? P.pageLogin() : P.pageSignup());
    if (!P.me()) { const u = await P.loadMe(); if (!u) { location.hash = "/login"; return; } }
    await api("/api/escalation-tick", {}, "POST").catch(() => {}); // lazy escalation on load
    let el;
    if (path === "/" || path === "/groups") el = await P.pageGroups();
    else if (path === "/map" || path.startsWith("/map/")) {
      const gid = path.split("/")[2] ? Number(path.split("/")[2]) : null;
      el = await P.pageMap(gid);
    }
    else if (path.startsWith("/g/")) el = await P.pageGroup(Number(path.split("/")[2]));
    else if (path.startsWith("/s/")) el = await P.pageSession(Number(path.split("/")[2]));
    else if (path.startsWith("/join/")) {
      const gid = Number(path.split("/")[2]);
      const r = await api(`/api/groups/${gid}/join`, {});
      toast(r.status === "active" ? "You're already in — welcome back!" : "Request sent — waiting for someone to vouch for you.");
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
  nav.innerHTML = "";
  const user = P.me();
  if (user) {
    const hash = location.hash;
    const isGroups = !hash || hash === "#/groups" || hash.startsWith("#/g/") || hash.startsWith("#/s/");
    const isMap = hash === "#/map" || hash.startsWith("#/map/");
    
    nav.append(
      h("a", { href: "#/groups", class: isGroups ? "on" : "", "aria-current": isGroups ? "page" : undefined }, "Explore & Crews"),
      h("a", { href: "#/map", class: isMap ? "on" : "", "aria-current": isMap ? "page" : undefined, style: "display:inline-flex;align-items:center;gap:6px" },
        icon3d("mappin", { size: 15 }), "Live Map")
    );

    /* User wrap with avatar pill and interactive dropdown */
    const initials = user.name?.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() ?? "?";
    const firstName = user.name?.split(" ")[0] ?? "Account";

    const trigger = h("button", {
      class: "nav-user-trigger",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      title: `Account: ${user.name}`,
      onclick: (e) => {
        e.stopPropagation();
        toggleUserMenu(user, trigger);
      }
    },
      h("div", { class: "nav-signout", style: "width:28px;height:28px;font-size:11px;flex:none" }, initials),
      h("span", { class: "user-name-short" }, firstName),
      icon("chevron", { size: 11, class: "nav-chevron" })
    );

    const wrap = h("div", { class: "nav-user-wrap" }, trigger);
    nav.append(wrap);
  } else {
    nav.append(h("a", { href: "#/login" }, "Log in"));
  }
}

async function refreshBell() {
  const dot = $("#bell-count");
  if (!P.me()) return (dot.hidden = true);
  try {
    const n = await api("/api/me/notifications");
    dot.textContent = n.length; dot.hidden = n.length === 0;
  } catch { dot.hidden = true; }
}

/* logo → home */
document.querySelector(".logo-btn")?.addEventListener("click", () => { location.hash = "/groups"; });

$("#bell").addEventListener("click", () => P.bellDrawer && P.bellDrawer());
window.addEventListener("hashchange", () => { refreshNav(); route(); });

(async () => { await P.loadMe().catch(() => {}); refreshNav(); route(); })();
