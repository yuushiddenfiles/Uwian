// tiny helpers: api fetch, dom builder, money format, toast, sheet drawer
export const $ = (sel, el = document) => el.querySelector(sel);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat())
    if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
export const fmtPeso = (cents) => {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(cents);
  return `${sign}₱${Math.floor(a / 100).toLocaleString("en-PH")}.${String(a % 100).padStart(2, "0")}`;
};
export const pesoToCents = (s) => {
  const t = String(s).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
};

export async function api(path, body, method) {
  const res = await fetch(path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

let toastTimer;
export function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", !!isErr);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// bottom-sheet drawer that slides up like a real drawer
export function openSheet(title, contentEl) {
  const root = $("#sheet-root");
  root.innerHTML = "";
  const scrim = h("div", { class: "scrim", onclick: close });
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-label": title },
    h("div", { class: "handle" }), h("h3", {}, title), contentEl);
  root.append(scrim, sheet);
  requestAnimationFrame(() => { scrim.classList.add("show"); sheet.classList.add("show"); });
  function close() {
    scrim.classList.remove("show"); sheet.classList.remove("show");
    setTimeout(() => (root.innerHTML = ""), 320);
  }
  return close;
}

export const initials = (name) => (name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function avatar(name) {
  return h("span", { class: "avatar" }, initials(name));
}

export function lampFor(checkin) {
  if (!checkin || !checkin.home_confirmed_at) {
    const st = checkin?.flag_stage ?? 0;
    return h("span", { class: `lamp flag${st || 1}`, title: st >= 3 ? "Wala pang balita — nag-escalate" : st === 2 ? "Na-alert ang buddy" : "Hindi pa nagco-check-in" });
  }
  return h("span", { class: "lamp home", title: "Nakauwi na" });
}

export const MODES = { walk: "naglakad", jeep: "jeep", grab: "Grab", taxi: "taxi", friend_drive: "sinakay ng kaibigan", own_drive: "magda-drive", other: "iba" };

export const timeAgo = (iso) => {
  if (!iso) return "wala pa";
  const days = Math.floor((Date.now() - new Date(iso + "Z")) / 864e5);
  if (days <= 0) return "ngayon lang";
  if (days === 1) return "kahapon";
  return `${days} araw na ang nakalipas`;
};
