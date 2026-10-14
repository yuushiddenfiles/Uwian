import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock, Lock, MapPin, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, fmtSessionTime, timeAgo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/chrome";
import TearTicket from "@/components/reactbits/TearTicket/TearTicket";
import Radar from "@/components/reactbits/Radar/Radar";
import DecryptedText from "@/components/reactbits/DecryptedText/DecryptedText";
import { AddSpotDialog, SpotReportDialog, SuggestSpotDialog, VerificationDialog } from "@/components/sheets";
import { useAuth } from "@/auth";

/* User content rendered into Leaflet popups must be escaped: popups take
   raw HTML strings, so a spot name is a stored-XSS vector otherwise. */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

/* ─── Classified teaser card rendered in place of real spot data for
   unverified members. Shows zero geographic information. ─── */
const CLASSIFIED_LABELS = [
  "SIGMA COMPOUND", "EAGLE'S NEST", "THE VAULT", "PHANTOM HQ",
  "ZONE SEVEN", "DARK NODE", "CLASSIFIED SITE", "SECTOR BRAVO",
];
function ClassifiedCard({ index, onVerify }) {
  const label = CLASSIFIED_LABELS[index % CLASSIFIED_LABELS.length];
  return (
    <li className="relative overflow-hidden rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
        }}
      />
      <div className="relative z-20 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            LOCATION CLASSIFIED
          </span>
        </div>
        <div className="font-mono text-sm font-bold tracking-wider text-foreground/60">
          <DecryptedText
            text={label}
            speed={60}
            maxIterations={12}
            animateOn="hover"
            characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!%"
            className="font-mono"
          />
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="font-mono text-[10px] tracking-widest">
            LAT: ██.████
          </Badge>
          <Badge variant="secondary" className="font-mono text-[10px] tracking-widest">
            LNG: ███.████
          </Badge>
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <ShieldAlert className="size-2.5" aria-hidden="true" />
            ID REQUIRED
          </Badge>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Verify your identity to unlock this tambayan's real name, location, and active sessions.
        </p>
      </div>
    </li>
  );
}

export function MapPage() {
  const { gid } = useParams();
  const groupId = gid ? Number(gid) : null;
  const navigate = useNavigate();
  const { user } = useAuth();

  // Verification gate — THE only source of truth for map access.
  const isVerified = user?.verification_status === "approved";

  const [spots, setSpots] = useState([]);
  const [crewName, setCrewName] = useState("");
  const [filter, setFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [mySuggest, setMySuggest] = useState([]);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [pendingPos, setPendingPos] = useState(null);
  const [reportSpot, setReportSpot] = useState(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  // NOTE: never name a component `Map` in this codebase: it shadows the
  // global Map constructor and `new Map()` then constructs the component.
  const markersRef = useRef(null);
  const getMarkers = () => (markersRef.current ??= new Map());
  const firstView = useRef(true);

  const reloadSpots = async () => {
    // Hard gate: never fetch location data for unverified users.
    if (!isVerified) { setSpots([]); return; }
    try {
      if (groupId) {
        const [sp, gd] = await Promise.all([
          api(`/api/groups/${groupId}/spots`),
          api(`/api/groups/${groupId}`).catch(() => null),
        ]);
        setSpots(sp.map((s) => ({ ...s, sessions: [], has_active_session: false })));
        setCrewName(gd?.group?.name ?? "");
      } else {
        setSpots(await api("/api/map/radar"));
      }
      if (!groupId) api("/api/me/spot-suggestions").then(setMySuggest).catch(() => {});
    } catch {
      setSpots([]);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await reloadSpots();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, isVerified]);

  const filtered = useMemo(() => {
    if (filter === "active") return spots.filter((s) => s.has_active_session || (s.sessions?.length ?? 0) > 0);
    if (filter === "late") {
      return spots.filter((s) => {
        const c = s.closes_at || "";
        return /^(01|02|03|04|05)/.test(c) || c.toLowerCase().includes("am");
      });
    }
    return spots;
  }, [spots, filter ]);

  /* Leaflet is only ever mounted when the user is verified.
     Dynamic import prevents the OSM tile CSS from loading at all
     for unverified sessions — zero geographic network leakage. */
  useEffect(() => {
    if (!isVerified) return; // HARD GATE
    if (!mapEl.current || mapRef.current) return;

    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapEl.current) return;
      const map = L.map(mapEl.current).setView([14.676, 121.0437], 13);
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      // Double-click drops a pin on either map: crew pins go straight to their
      // own map, public pins become a suggestion awaiting staff review.
      map.on("dblclick", (e) => {
        setPendingPos({ lat: e.latlng.lat, lng: e.latlng.lng });
        if (groupId) setAddOpen(true);
        else setSuggestOpen(true);
      });
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isVerified, groupId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = getMarkers();
    markers.forEach((m) => m.remove());
    markers.clear();
    // Center once on load. Recentering on every data refresh would yank the
    // map out from under the user while they pan.
    if (firstView.current && filtered.length > 0) {
      map.setView([filtered[0].lat, filtered[0].lng], 13);
      firstView.current = false;
    }
    (async () => {
    const L = (await import("leaflet")).default;
    for (const sp of filtered) {
      const isActive = sp.has_active_session || (sp.sessions?.length ?? 0) > 0;
      const pinCls = isActive ? "uw-pin uw-pin-active" : sp.stale ? "uw-pin uw-pin-stale" : "uw-pin";
      const m = L.marker([sp.lat, sp.lng], {
        icon: L.divIcon({ className: "", html: `<div class="${pinCls}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] }),
      }).addTo(map);
      getMarkers().set(sp.id, m);
      let html = `<div style="font-family:inherit;min-width:180px"><strong>${esc(sp.name)}</strong><br/>` +
        `<span>Open until ${esc(sp.closes_at || "late")} · ${esc(sp.price_range || "$$")}</span>`;
      if (sp.notes) html += `<br/><span>${esc(sp.notes)}</span>`;
      if (sp.sessions?.length > 0) {
        html += `<br/><strong>Scheduled sessions:</strong>`;
        for (const s of sp.sessions) {
          html += `<br/>${esc(s.group_name)} · ${esc(fmtSessionTime(s.starts_at))} (${s.going_count || 0} going)`;
        }
      }
      html += `</div>`;
      m.bindPopup(html);
    }
    })();
  }, [filtered]);

  const focus = (sp) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([sp.lat, sp.lng], 15, { duration: 1 });
    getMarkers().get(sp.id)?.openPopup();
  };

  /* Draft pin for a not-yet-submitted position (double-click or venue
     search). Follows pendingPos and flies the map to it, so the user sees
     exactly what will be submitted. Cleared when the dialog closes. */
  const pendingMarkerRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (pendingMarkerRef.current) {
      pendingMarkerRef.current.remove();
      pendingMarkerRef.current = null;
    }
    if (!map || !pendingPos || !Number.isFinite(pendingPos.lat) || !Number.isFinite(pendingPos.lng)) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      pendingMarkerRef.current = L.marker([pendingPos.lat, pendingPos.lng], {
        icon: L.divIcon({ className: "", html: `<div class="uw-pin uw-pin-pending"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] }),
      }).addTo(map);
      map.flyTo([pendingPos.lat, pendingPos.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingPos]);

  const activeCount = spots.filter((s) => s.has_active_session || (s.sessions?.length ?? 0) > 0).length;

  return (
    <div>
      {/* ── Header ── */}
      <div className="glass-70 flex flex-wrap items-center justify-between gap-3 rounded-base border-2 border-border p-5 shadow-shadow">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-base border-2 border-border bg-main text-main-foreground">
            <MapPin className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {groupId && crewName ? `${crewName} · Tambayan map` : "Verified hangout radar"}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {isVerified
                ? "Open sessions, closing hours, and verified tambayan spots."
                : "ID verification required to access location data."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isVerified ? "default" : "secondary"} className="gap-1">
            {isVerified
              ? <ShieldCheck className="size-3" aria-hidden="true" />
              : <ShieldAlert className="size-3" aria-hidden="true" />}
            {isVerified ? "Verified access" : "Unverified — ID required"}
          </Badge>
          {groupId ? (
            <Button size="sm" variant="neutral" onClick={() => navigate(`/groups/${groupId}`)}>
              <ArrowLeft aria-hidden="true" /> Back to crew
            </Button>
          ) : isVerified ? (
            <Button size="sm" onClick={() => setSuggestOpen(true)}>
              <MapPin aria-hidden="true" /> Suggest a spot
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Filter row (verified only) ── */}
      {isVerified && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {[
            ["all", `All spots (${spots.length})`],
            ["active", `Active / scheduled (${activeCount})`],
            ["late", "Late night (open 1AM+)"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`min-h-9 rounded-full border-2 px-3.5 text-[13px] font-semibold whitespace-nowrap ${
                filter === k
                  ? "border-border bg-main text-main-foreground shadow-shadow"
                  : "border-border bg-secondary-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Map area: Leaflet for verified, Radar lock screen for unverified ── */}
      {isVerified ? (
        /* Real Leaflet map — only mounts & loads tiles when verified */
        <>
          <div className="relative mt-3 overflow-hidden rounded-base border-2 border-border shadow-shadow">
            <div ref={mapEl} className="h-100 w-full" role="application" aria-label="Hangout spot map" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Map legend">
            <span className="flex items-center gap-1.5">
              <i aria-hidden="true" className="inline-block size-2.5 rounded-full border border-border bg-main" /> Open spot
            </span>
            <span className="flex items-center gap-1.5">
              <i aria-hidden="true" className="inline-block size-2.5 rounded-full border border-border bg-chart-3" /> Active session
            </span>
            <span className="flex items-center gap-1.5">
              <i aria-hidden="true" className="inline-block size-2.5 rounded-full border border-border bg-chart-2" /> Needs re-confirming
            </span>
          </div>
        </>
      ) : (
        /* Classified Radar lock screen — zero OSM tile requests, zero coordinate data */
        <div className="relative mt-3 overflow-hidden rounded-base border-2 border-border shadow-shadow">
          <div className="h-[400px] w-full" aria-hidden="true">
            <Radar
              color="#ef4444"
              backgroundColor="transparent"
              mode="sweep"
              speed={0.6}
              trail={0.5}
              targets={4}
              ringCount={5}
              spokeCount={8}
              clutter={0.15}
              glow={1.4}
              brightness={0.7}
              gridOpacity={0.6}
              grain={0.04}
              opacity={1}
              className="h-full w-full"
            />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/75 backdrop-blur-[2px]">
            <div className="relative">
              <span className="absolute inset-0 animate-ping rounded-full bg-destructive/20" />
              <span className="relative grid size-16 place-items-center rounded-full border-2 border-destructive/60 bg-secondary-background shadow-shadow">
                <Lock className="size-7 text-destructive" aria-hidden="true" />
              </span>
            </div>
            <div className="max-w-sm px-6 text-center">
              <h2 className="font-mono text-lg font-bold tracking-widest text-foreground">
                <DecryptedText
                  text="MAP ACCESS DENIED"
                  speed={45}
                  maxIterations={14}
                  animateOn="hover"
                  characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ#@!%*&"
                  className="font-mono"
                />
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Real tambayan locations are only shown to members who have had their ID verified by Uwian ops.
                This prevents location data from being used for tracking or harmful purposes.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {["Anti-stalking", "Privacy protection", "Community safety"].map((reason) => (
                  <Badge key={reason} variant="secondary" className="gap-1 font-mono text-[10px] tracking-wider">
                    <ShieldAlert className="size-2.5" aria-hidden="true" />
                    {reason}
                  </Badge>
                ))}
              </div>
              <Button className="mt-5 w-full gap-2" onClick={() => setVerifyOpen(true)} id="map-verify-cta">
                <ShieldCheck className="size-4" aria-hidden="true" />
                Verify ID to Unlock Map
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Spot list ── */}
      <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-bold">
            {isVerified
              ? `Tambayans and sessions (${filtered.length})`
              : "Tambayan locations (classified)"}
          </h2>
          {isVerified && (
            groupId
              ? <span className="text-xs text-muted-foreground">Double-click map to drop a new spot</span>
              : <span className="text-xs text-muted-foreground">Double-click map to suggest a spot</span>
          )}
        </div>

        {!isVerified ? (
          /* Encrypted teaser grid for unverified users — zero real data */
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <ClassifiedCard key={i} index={i} />
            ))}
            <li className="col-span-full">
              <button
                className="w-full rounded-base border-2 border-border bg-main py-3 text-sm font-bold text-main-foreground shadow-shadow transition hover:opacity-90"
                onClick={() => setVerifyOpen(true)}
                id="spot-list-verify-cta"
              >
                <ShieldCheck className="mr-2 inline size-4" aria-hidden="true" />
                Verify your ID to unlock all verified spots
              </button>
            </li>
          </ul>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MapPin className="size-6" aria-hidden="true" />}
            title="No spots in this filter"
            body="Try All spots to see every verified hangout."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((sp) => (
              <li key={sp.id}>
                <TearTicket
                  width={380}
                  height={250}
                  stubSize={120}
                  radius={8}
                  background="#ffffff"
                  stubBackground="#dbe9ff"
                  color="#0a0a14"
                  borderColor="#000000"
                  borderWidth={2}
                  ariaLabel={`Tear to confirm ${sp.name} is still open`}
                  onTear={async () => {
                    try {
                      await api(`/api/spots/${sp.id}/confirm`, { answer: "yes" });
                      toast.success("Thanks. Spot freshness updated.");
                      reloadSpots();
                    } catch (err) {
                      toast.error(err.message);
                    }
                  }}
                  stub={(
                    <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center">
                      <span className="grid size-9 place-items-center rounded-full border-2 border-[#0a0a14] bg-main">
                        <Check className="size-4 text-main-foreground" aria-hidden="true" />
                      </span>
                      <span className="text-[10px] leading-tight font-bold tracking-wide">
                        TEAR TO<br />CONFIRM
                      </span>
                    </span>
                  )}
                >
                  <span className="flex h-full w-full flex-col gap-1 overflow-hidden p-3">
                    <span className="block truncate text-[15px] font-bold">{sp.name}</span>
                    {sp.group_name ? <span className="block truncate text-xs text-muted-foreground">Host crew: {sp.group_name}</span> : null}
                    <span className="flex items-center gap-1.5">
                      <Badge variant={sp.has_active_session ? "default" : "secondary"} className="gap-1">
                        <Clock className="size-3" aria-hidden="true" />
                        {sp.closes_at ? `Closes ${sp.closes_at}` : "Closes late"}
                      </Badge>
                    </span>
                    {sp.notes ? <span className="line-clamp-2 block text-[13px] text-muted-foreground">{sp.notes}</span> : null}
                    {sp.sessions?.length > 0 ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {sp.sessions.length} scheduled · {sp.sessions[0].group_name || "Crew"}: {fmtSessionTime(sp.sessions[0].starts_at)}
                      </span>
                    ) : null}
                    <span className="mt-auto flex items-center justify-between gap-2 border-t-2 border-border pt-2">
                      <span className="kicker text-muted-foreground">Freshness: {timeAgo(sp.last_confirmed_at)}</span>
                      <span className="flex gap-1.5">
                        <Button size="xs" variant="neutral" onClick={() => focus(sp)}>Locate</Button>
                        <Button size="xs" variant="neutral" onClick={(e) => { e.stopPropagation(); setReportSpot(sp); }}>Report</Button>
                      </span>
                    </span>
                  </span>
                </TearTicket>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Suggestions (verified only) ── */}
      {isVerified && mySuggest.length > 0 ? (
        <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
          <h2 className="mb-1 font-bold">Your suggestions</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            These are yours only. A moderator has to approve one before it shows up for everyone else.
          </p>
          <ul className="space-y-2">
            {mySuggest.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-base border-2 border-border bg-secondary-background p-3"
              >
                <span className="text-sm font-semibold">{s.name}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(s.created_at)}</span>
                <Badge
                  variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}
                  className="ml-auto"
                >
                  {s.status === "pending" ? "Waiting for review" : s.status}
                </Badge>
                {s.status === "rejected" && s.review_note ? (
                  <p className="w-full text-xs text-muted-foreground">Note: {s.review_note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Dialogs ── */}
      {groupId ? (
        <AddSpotDialog
          open={addOpen}
          onOpenChange={(v) => {
            setAddOpen(v);
            if (!v) setPendingPos(null);
          }}
          gid={groupId}
          lat={pendingPos?.lat}
          lng={pendingPos?.lng}
          onAdded={reloadSpots}
        />
      ) : null}
      <SuggestSpotDialog
        open={suggestOpen}
        onOpenChange={(v) => {
          setSuggestOpen(v);
          if (!v) setPendingPos(null);
        }}
        lat={pendingPos?.lat}
        lng={pendingPos?.lng}
        onDone={reloadSpots}
        onPickCoords={setPendingPos}
      />
      <VerificationDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
      <SpotReportDialog
        open={reportSpot != null}
        onOpenChange={(v) => !v && setReportSpot(null)}
        spot={reportSpot}
        onDone={reloadSpots}
      />
    </div>
  );
}
