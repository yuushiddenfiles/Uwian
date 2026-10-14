/* Shared geolocation helpers. Two rules this codebase follows:
   1. The first fix gets a generous timeout. A cold GPS lock takes 10–30s;
      the old 4s window timed out constantly and the app then broadcast a
      fabricated position, which in a safety app is worse than no position.
   2. Error codes are distinguished. PERMISSION_DENIED means "go enable it".
      TIMEOUT means "the chip needs more sky" and gets one longer retry.
      Only POSITION_UNAVAILABLE (no source at all) falls back, and the
      caller must label it as estimated. */

export const GPS_ERROR_MESSAGE = {
  1: "Location permission denied. Enable location for this site in your browser settings, then try again.",
  2: "No position source on this device.",
  3: "GPS lock timed out. Step somewhere with open sky (or toggle location off and on), then try again.",
};

export function gpsErrorMessage(code) {
  return GPS_ERROR_MESSAGE[code] ?? "Could not get your location. Try again.";
}

/* One position fix. Retries once with a longer window on TIMEOUT, since a
   cold start routinely misses the first window but lands the second. */
export function getPositionOnce({ timeout = 20000, maximumAge = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }
    const opts = (t) => ({ enableHighAccuracy: true, timeout: t, maximumAge });
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err?.code === 3 && timeout < 30000) {
        navigator.geolocation.getCurrentPosition(resolve, reject, opts(30000));
      } else {
        reject(err);
      }
    }, opts(timeout));
  });
}

/* Free venue search via OpenStreetMap Nominatim. Biased to the Philippines,
   capped at 5 results, debounced by the caller (policy: max 1 req/sec).
   Attribution is required — the dialog shows an OSM credit line. */
export async function searchVenues(query, { limit = 5, signal } = {}) {
  const q = query.trim();
  if (q.length < 3) return [];
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ph` +
    `&limit=${limit}&addressdetails=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Venue search is unavailable right now.");
  const rows = await res.json();
  return (rows ?? []).map((r) => {
    const parts = String(r.display_name ?? "").split(",").map((s) => s.trim());
    return {
      name: parts.slice(0, 2).join(", "),
      detail: String(r.display_name ?? ""),
      lat: Number(r.lat),
      lng: Number(r.lon),
    };
  }).filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}
