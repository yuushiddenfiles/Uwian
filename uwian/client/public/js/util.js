// tiny helpers: api fetch, dom builder, money format, toast, sheet drawer
export const $ = (sel, el = document) => el.querySelector(sel);

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

// bottom-sheet drawer
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
    return h("span", { class: `lamp flag${st || 1}`, title: st >= 3 ? "No sign of life — escalated to admin" : st === 2 ? "Buddy was alerted" : "Hasn't checked in yet" });
  }
  return h("span", { class: "lamp home", title: "Made it home safely" });
}

export const MODES = {
  walk:         "Walking",
  jeep:         "Jeep",
  grab:         "Grab",
  taxi:         "Taxi",
  friend_drive: "Ride from friend",
  own_drive:    "Driving myself",
  other:        "Other",
};

export const timeAgo = (iso) => {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso + "Z")) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

/* ════════════════════════════════════
   CLEAN VECTOR SVG ICON REGISTRY
   (Replaces all emojis with crisp design assets)
   ════════════════════════════════════ */
const ICONS = {
  lantern: '<path d="M9 3h6"/><path d="M12 3v3"/><circle cx="12" cy="11" r="2"/><path d="M6 10a6 6 0 0 1 12 0v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9 19v2h6v-2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  beer: '<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-2.5.5s-1.5-.5-2.5-.5-1.5.5-2.5.5a1.5 1.5 0 0 1-1.5-1.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.5a1.5 1.5 0 0 0-1.5-1.5c-1 0-1.5.5-2.5.5z"/>',
  glass: '<path d="m5 4 7 8v7m-4 0h8"/><path d="M19 4 12 12"/><path d="M3 4h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  cross: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9L2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  radar: '<path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 6a6 6 0 0 1 6 6"/><path d="M12 10a2 2 0 0 1 2 2"/><line x1="12" y1="12" x2="12" y2="22"/><line x1="2" y1="12" x2="12" y2="12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
};

export function icon(name, { size = 16, stroke = 2, strokeColor = "currentColor", fill = "none", class: cls = "" } = {}) {
  const inner = ICONS[name] || ICONS.lantern;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", fill);
  svg.setAttribute("stroke", strokeColor);
  svg.setAttribute("stroke-width", String(stroke));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (cls) svg.setAttribute("class", cls);
  svg.innerHTML = inner;
  return svg;
}

