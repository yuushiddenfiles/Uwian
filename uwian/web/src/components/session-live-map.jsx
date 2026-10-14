import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  Locate,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { api, timeAgo } from "@/lib/api";
import { getPositionOnce } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/chrome";
import DecryptedText from "@/components/reactbits/DecryptedText/DecryptedText";

/* User content rendered into Leaflet popups must be escaped */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

export function SessionLiveMap({ session, spot, members, user, onVerify }) {
  const sid = session?.id;
  const isVerified = user?.verification_status === "approved";
  const isClosed = session?.status === "closed";

  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [myCoords, setMyCoords] = useState(null);
  const [accuracy, setAccuracy] = useState(null);

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const watchIdRef = useRef(null);
  const pollTimerRef = useRef(null);
  const getMarkers = () => (markersRef.current ??= new Map());

  // Fetch active member positions
  const fetchLocations = useCallback(async () => {
    if (!sid || !isVerified) return;
    try {
      const data = await api(`/api/sessions/${sid}/locations`);
      setLocations(Array.isArray(data) ? data : []);
    } catch {
      // 403 if unverified or not in crew
    }
  }, [sid, isVerified]);

  // Periodic polling for active member positions
  useEffect(() => {
    if (!isVerified || isClosed) return;
    fetchLocations();
    pollTimerRef.current = setInterval(fetchLocations, 10000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchLocations, isVerified, isClosed]);

  // Stop sharing helper
  const stopSharing = useCallback(async () => {
    if (watchIdRef.current != null) {
      navigator.geolocation?.clearWatch?.(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
    setMyCoords(null);
    setAccuracy(null);
    if (sid) {
      try {
        await api(`/api/sessions/${sid}/location`, { method: "DELETE" });
      } catch {
        // ignore
      }
      fetchLocations();
    }
    toast.info("Stopped sharing your live location.");
  }, [sid, fetchLocations]);

  // Start continuous GPS tracking
  const startSharing = useCallback(() => {
    if (!isVerified) {
      toast.error("ID verification required for live location sharing.");
      onVerify?.();
      return;
    }
    if (isClosed) {
      toast.error("This session is already closed.");
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }

    setSharing(true);
    toast.loading("Acquiring high-precision GPS lock...", { id: "gps-lock" });

    // Broadcast position update
    const sendUpdate = async (pos) => {
      const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
      setMyCoords({ lat, lng });
      setAccuracy(acc);
      toast.dismiss("gps-lock");
      try {
        await api(`/api/sessions/${sid}/location`, {
          method: "PUT",
          lat,
          lng,
          accuracy: acc,
        });
        fetchLocations();
      } catch (e) {
        toast.error(e?.message ?? "Failed to broadcast GPS location.");
      }
    };

    const handleError = (err) => {
      toast.dismiss("gps-lock");
      if (err?.code === 1) {
        setSharing(false);
        toast.error("Location permission denied. Enable location in browser settings.");
        return;
      }
      if (err?.code === 3) {
        // Already retried once inside getPositionOnce: the chip genuinely
        // has no sky right now. Never broadcast a fabricated pin — a wrong
        // live position is worse than none in a safety app.
        setSharing(false);
        toast.error("GPS lock timed out twice. Step somewhere with open sky, then try again.");
        return;
      }
      // No position source at all (e.g. desktop with no GPS): share an
      // explicitly estimated fallback so the feature still demos.
      setSharing(false);
      toast.info("No GPS source on this device. Sharing an estimated Katipunan-area pin instead.");
      sendUpdate({ coords: { latitude: 14.6762, longitude: 121.0438, accuracy: 25 } });
    };

    // Immediate first ping. 20s, not 4s: a cold GPS lock routinely needs it,
    // and timing out meant teleporting the user to a hardcoded fallback.
    // getPositionOnce retries once more on timeout before giving up.
    getPositionOnce({ timeout: 20000, maximumAge: 10000 }).then(sendUpdate, handleError);

    // Continuous watch
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(sendUpdate, handleError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });
      toast.success("Live GPS broadcast active! Your crew can now see your pin.");
    } catch {
      // fallback handled
    }
  }, [isVerified, isClosed, sid, onVerify, fetchLocations]);

  // Clean up GPS tracking on unmount or session close
  useEffect(() => {
    if (isClosed && sharing) {
      stopSharing();
    }
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch?.(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isClosed, sharing, stopSharing]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!isVerified) return;
    if (!mapEl.current || mapRef.current) return;

    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapEl.current) return;

      const defaultLat = spot?.lat ?? 14.676;
      const defaultLng = spot?.lng ?? 121.0437;
      const map = L.map(mapEl.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([defaultLat, defaultLng], 14);

      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isVerified, spot?.lat, spot?.lng]);

  // Update Markers (Spot + Live Members)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isVerified) return;

    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return;

      const markers = getMarkers();
      markers.forEach((m) => m.remove());
      markers.clear();

      const boundsPoints = [];

      // 1. Spot Marker
      if (spot?.lat && spot?.lng) {
        boundsPoints.push([spot.lat, spot.lng]);
        const spotIcon = L.divIcon({
          className: "spot-custom-marker",
          html: `
            <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);cursor:pointer;">
              <div style="background:#f59e0b;color:#000;border:2.5px solid #000;border-radius:10px;padding:6px 10px;box-shadow:3px 3px 0 #000;font-weight:800;font-size:12px;display:flex;align-items:center;gap:5px;white-space:nowrap;">
                <span>📍</span> <span>${esc(spot.name)}</span>
              </div>
              <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #000;margin-top:-1px;"></div>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const spotMarker = L.marker([spot.lat, spot.lng], { icon: spotIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:sans-serif;padding:4px;">
              <strong style="font-size:14px;display:block;margin-bottom:2px;">📍 ${esc(spot.name)}</strong>
              ${spot.notes ? `<p style="font-size:12px;color:#555;margin:0 0 6px;">${esc(spot.notes)}</p>` : ""}
              ${spot.closes_at ? `<span style="font-size:11px;background:#eee;padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:6px;">Closes: ${esc(spot.closes_at)}</span>` : ""}
              <div style="margin-top:4px;">
                <a href="https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lng}#map=16/${spot.lat}/${spot.lng}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#2563eb;font-weight:bold;text-decoration:underline;">Open in OpenStreetMap ↗</a>
              </div>
            </div>
          `);
        markers.set("spot", spotMarker);
      }

      // 2. Member Live Markers
      locations.forEach((loc) => {
        if (!loc.lat || !loc.lng) return;
        boundsPoints.push([loc.lat, loc.lng]);

        const isMe = loc.user_id === user?.id;
        const name = isMe ? `${loc.name} (You)` : loc.name;
        const initial = (loc.name ?? "U").charAt(0).toUpperCase();
        const borderColor = isMe ? "#3b82f6" : "#10b981";
        const badgeBg = isMe ? "#2563eb" : "#059669";

        const memberIcon = L.divIcon({
          className: "member-live-marker",
          html: `
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -50%);cursor:pointer;">
              <!-- Pulsing Radar Wave -->
              <div style="position:absolute;inset:-6px;border-radius:9999px;background:${borderColor};opacity:0.35;animation:ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              
              <!-- Avatar Circle -->
              <div style="position:relative;width:38px;height:38px;border-radius:9999px;background:#18181b;border:3px solid ${borderColor};box-shadow:0 0 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:14px;overflow:hidden;">
                ${loc.avatar_url ? `<img src="${esc(loc.avatar_url)}" style="width:100%;height:100%;object-fit:cover;" />` : `<span>${initial}</span>`}
              </div>
              
              <!-- Name Badge -->
              <div style="margin-top:4px;background:#000;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:1px 6px;font-size:10px;font-weight:7px;box-shadow:0 2px 4px rgba(0,0,0,0.4);white-space:nowrap;display:flex;align-items:center;gap:3px;">
                <span style="display:inline-block;width:6px;height:6px;border-radius:9999px;background:#10b981;"></span>
                <span>${esc(name)}</span>
              </div>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const memberMarker = L.marker([loc.lat, loc.lng], { icon: memberIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:sans-serif;padding:4px;min-width:140px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <div style="width:28px;height:28px;border-radius:9999px;background:${badgeBg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;">
                  ${initial}
                </div>
                <div>
                  <strong style="font-size:13px;display:block;">${esc(name)}</strong>
                  <span style="font-size:10px;color:#10b981;font-weight:bold;">● LIVE GPS PING</span>
                </div>
              </div>
              <div style="font-size:11px;color:#666;line-height:1.4;">
                <div>Updated: <strong>${timeAgo(loc.updated_at)}</strong></div>
                ${loc.accuracy ? `<div>Accuracy: <strong>±${Math.round(loc.accuracy)}m</strong></div>` : ""}
              </div>
              <div style="margin-top:6px;border-top:1px solid #eee;padding-top:4px;">
                <a href="https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#2563eb;text-decoration:underline;font-weight:6px;">Open in Map ↗</a>
              </div>
            </div>
          `);

        markers.set(`user-${loc.user_id}`, memberMarker);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [locations, spot, user?.id, isVerified]);

  // Fit all markers button
  const fitAllMarkers = () => {
    const map = mapRef.current;
    if (!map) return;
    const points = [];
    if (spot?.lat && spot?.lng) points.push([spot.lat, spot.lng]);
    locations.forEach((l) => {
      if (l.lat && l.lng) points.push([l.lat, l.lng]);
    });
    if (points.length > 0) {
      import("leaflet").then(({ default: L }) => {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      });
    } else {
      toast.info("No pins on the map yet.");
    }
  };

  // Fly to specific member
  const locateMember = (lat, lng) => {
    const map = mapRef.current;
    if (!map || !lat || !lng) return;
    map.flyTo([lat, lng], 16, { duration: 1.2 });
  };

  /* ─── Security Gate for Unverified Members ─── */
  if (!isVerified) {
    return (
      <div className="glass-70 rounded-base border-2 border-border p-6 shadow-shadow">
        <div className="relative overflow-hidden rounded-base border-2 border-border bg-secondary-background p-6">
          <div
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background:
                "repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)",
            }}
          />
          <div className="relative z-20 flex flex-col items-center text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full border-2 border-border bg-background shadow-shadow">
              <ShieldAlert className="size-6 text-foreground" aria-hidden="true" />
            </div>
            <div className="mb-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
              GPS SURVEILLANCE RESTRICTED
            </div>
            <h3 className="mb-2 text-lg font-bold">
              <DecryptedText
                text="CREW LIVE RADAR CLASSIFIED"
                speed={50}
                maxIterations={12}
                animateOn="hover"
                className="font-mono"
              />
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              To protect member safety and prevent location misuse, real-time GPS tracking and tambayan coordinates are strictly gated behind identity verification.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">
                LAT: ██.████
              </Badge>
              <Badge variant="secondary" className="font-mono text-xs">
                LNG: ███.████
              </Badge>
              <Badge variant="secondary" className="font-mono text-xs">
                STATUS: ENCRYPTED
              </Badge>
            </div>
            <Button className="mt-5" onClick={() => onVerify?.()}>
              Verify My Identity to Unlock Live Map
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-70 flex flex-col gap-4 rounded-base border-2 border-border p-5 shadow-shadow">
      {/* ── Header Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio
              className={`size-4 ${locations.length > 0 ? "animate-pulse text-emerald-500" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            <h2 className="font-bold">Live Crew GPS</h2>
            {locations.length > 0 ? (
              <Badge variant="default" className="bg-emerald-500 text-white font-mono text-[11px]">
                ● {locations.length} {locations.length === 1 ? "member" : "members"} live
              </Badge>
            ) : (
              <Badge variant="neutral" className="text-[11px]">
                No members live yet
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {spot ? `Destination: ${spot.name}` : "Real-time crew tracking until session ends."}
          </p>
        </div>

        {/* Live Broadcast Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {sharing ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-base border-2 border-border bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                Broadcasting Live {accuracy ? `(±${Math.round(accuracy)}m)` : ""}
              </span>
              <Button size="sm" variant="neutral" onClick={stopSharing}>
                Stop Sharing
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={startSharing}
              disabled={isClosed}
              title={isClosed ? "Session is closed" : "Broadcast your live position to the crew"}
            >
              <Radio className="size-3.5" aria-hidden="true" />
              Broadcast My Live GPS
            </Button>
          )}

          <Button size="sm" variant="neutral" onClick={fitAllMarkers} title="Fit all markers in view">
            <Locate className="size-3.5" aria-hidden="true" /> Fit All
          </Button>
          <Button
            size="icon"
            variant="neutral"
            onClick={fetchLocations}
            className="size-8"
            title="Refresh positions"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {isClosed ? (
        <div className="rounded-base border-2 border-border bg-secondary-background p-3 text-center text-xs font-semibold text-muted-foreground">
          🔒 This session is closed. Real-time GPS broadcasting is concluded.
        </div>
      ) : null}

      {/* ── Leaflet Map Container ── */}
      <div className="relative overflow-hidden rounded-base border-2 border-border shadow-shadow">
        <div
          ref={mapEl}
          className="h-96 w-full bg-secondary-background md:h-112"
          style={{ zIndex: 1 }}
        />
        {locations.length === 0 && !spot && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="rounded-base border-2 border-border bg-background/90 p-4 text-center shadow-shadow backdrop-blur-sm">
              <Navigation className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-bold">No active GPS pins yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tap <strong>Broadcast My Live GPS</strong> above to share your real-time position.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Active Members Radar List ── */}
      <div className="rounded-base border-2 border-border bg-secondary-background p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Active Crew Signals ({locations.length})
          </span>
          {spot?.lat && spot?.lng ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 text-amber-500" aria-hidden="true" />
              {spot.name}
            </span>
          ) : null}
        </div>

        {locations.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Waiting for members to broadcast GPS... Positions refresh every 10 seconds.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {locations.map((loc) => {
              const isMe = loc.user_id === user?.id;
              return (
                <div
                  key={loc.user_id}
                  className={`flex items-center justify-between gap-2 rounded-base border-2 p-2.5 transition-colors ${
                    isMe
                      ? "border-blue-500/50 bg-blue-500/5 shadow-sm"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="relative">
                      <Avatar
                        name={loc.name}
                        size={32}
                        art={loc.avatar_id}
                        custom={loc.avatar_url}
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 border border-background" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">
                        {loc.name} {isMe ? <span className="text-blue-500 font-normal">(You)</span> : ""}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {timeAgo(loc.updated_at)} {loc.accuracy ? `· ±${Math.round(loc.accuracy)}m` : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="neutral"
                    className="h-7 px-2 text-xs"
                    onClick={() => locateMember(loc.lat, loc.lng)}
                    title={`Center map on ${loc.name}`}
                  >
                    Locate
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
