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

export const initials = (name) =>
  (name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export const timeAgo = (iso) => {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso + "Z")) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

export function fmtSessionTime(dt) {
  if (!dt) return "Time TBD";
  const str = String(dt).trim();
  const iso = str.endsWith("Z") ? str : str.includes("T") ? `${str}Z` : `${str.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* Short clock time only ("9:00 PM") for status lines and preview cards where
   the weekday/date is already established by context. */
export function fmtTimeShort(dt) {
  if (!dt) return "";
  const str = String(dt).trim();
  const iso = str.endsWith("Z") ? str : str.includes("T") ? `${str}Z` : `${str.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { hour: "numeric", minute: "2-digit" });
}

export const statusLabel = (s) =>
  ({ planning: "Planning", open: "Tab open", wrapped: "Uwian time", closed: "Closed" }[s] ?? s);

export const MODES = {
  walk: "Walking",
  jeep: "Jeep",
  grab: "Grab",
  taxi: "Taxi",
  friend_drive: "Ride from friend",
  own_drive: "Driving myself",
  other: "Other",
};

export function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
