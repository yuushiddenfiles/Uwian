import { $, api, h, toast } from "./util.js";
import * as P from "./pages.js";

const view = $("#view");

async function route() {
  const path = location.hash.slice(1) || "/groups";
  view.innerHTML = "";
  try {
    if (path === "/login" || path === "/signup") return render(path === "/login" ? P.pageLogin() : P.pageSignup());
    if (!P.me()) { const u = await P.loadMe(); if (!u) { location.hash = "/login"; return; } }
    await api("/api/escalation-tick", {}, "POST").catch(() => {}); // lazy escalation on load — no external cron needed
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
  window.scrollTo({ top: 0 });
  refreshBell();
}

/* nav + bell */
function refreshNav() {
  const nav = $("#topnav");
  nav.innerHTML = "";
  if (P.me()) {
    nav.append(h("a", { href: "#/groups" }, "My Crews"));
    const out = h("button", { class: "btn ghost", onclick: async () => { await api("/api/logout", {}); location.hash = "/login"; } }, "Sign out");
    nav.append(out);
  } else {
    nav.append(h("a", { href: "#/login" }, "Log in"));
  }
}

async function refreshBell() {
  const dot = $("#bell-count");
  if (!P.ME) return (dot.hidden = true);
  try {
    const n = await api("/api/me/notifications");
    dot.textContent = n.length; dot.hidden = n.length === 0;
  } catch { dot.hidden = true; }
}

$("#bell").addEventListener("click", () => P.bellDrawer && P.bellDrawer());
window.addEventListener("hashchange", () => { refreshNav(); route(); });

(async () => { await P.loadMe().catch(() => {}); refreshNav(); route(); })();
