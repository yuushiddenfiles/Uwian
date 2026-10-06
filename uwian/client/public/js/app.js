import { $, api, h, toast } from "./util.js";
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
    else if (path.startsWith("/g/")) el = await P.pageGroup(Number(path.split("/")[2]));
    else if (path.startsWith("/s/")) el = await P.pageSession(Number(path.split("/")[2]));
    else if (path.startsWith("/map/")) el = await P.pageMap(Number(path.split("/")[2]));
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

/* ── nav ── */
function refreshNav() {
  const nav = $("#topnav");
  nav.innerHTML = "";
  const user = P.me();
  if (user) {
    const hash = location.hash;
    const isHome = !hash || hash === "#/groups" || hash.startsWith("#/g/") || hash.startsWith("#/s/") || hash.startsWith("#/map/");
    nav.append(h("a", { href: "#/groups", class: isHome ? "on" : "", "aria-current": isHome ? "page" : undefined }, "My Crews"));
    /* user initials pill as sign-out button */
    const initials = user.name?.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() ?? "?";
    nav.append(h("button", {
      class: "nav-signout",
      title: `Signed in as ${user.name} — click to sign out`,
      onclick: async () => { await api("/api/logout", {}); location.hash = "/login"; }
    }, initials));
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
