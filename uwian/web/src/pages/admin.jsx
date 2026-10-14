import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck,
  RefreshCw,
  Users,
  Anchor,
  Zap,
  MapPin,
  Clock,
  Flag,
  UserCheck,
  Pencil,
  FileText,
  Eye,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCcw,
  AlertTriangle,
} from "lucide-react";

/* Uwian ops console.

   Internal instrument only — no glass, no offset shadows, no rounded tiles,
   no hero type. The brutalist telemetry voice is preserved but the console now
   renders on its own near-black surface so hairline rules, kicker labels, and
   mono numerics read instead of dissolving into the page background. */

const STAT_CONFIG = [
  { key: "users",                 label: "Accounts",         Icon: Users      },
  { key: "crews",                 label: "Crews",            Icon: Anchor     },
  { key: "sessions",              label: "Sessions",         Icon: Zap        },
  { key: "live_spots",            label: "Live spots",       Icon: MapPin     },
  { key: "pending_spots",         label: "Spots queued",     Icon: Clock      },
  { key: "pending_verifications", label: "IDs queued",       Icon: UserCheck  },
  { key: "open_flags",            label: "Flags open",       Icon: Flag       },
  { key: "pending_profiles",      label: "Name/email queue", Icon: Pencil     },
];

const QUEUE_KEYS = ["pending_spots", "pending_verifications", "open_flags", "pending_profiles"];

/* The clock only needs minute precision, and a wall-clock string is what a
   duty operator compares against a report. */
const fmtStamp = (s) => {
  if (!s) return "—";
  const d = new Date(String(s).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime())
    ? String(s).slice(0, 16)
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
};

const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

/* ── Panel ── */
function Panel({ title, count, children }) {
  return (
    <section className="ops-panel">
      <header className="ops-panel__head">
        <span className="ops-kicker">{title}</span>
        {count > 0 ? (
          <span className="ops-badge">{String(count).padStart(2, "0")}</span>
        ) : null}
      </header>
      <div className="ops-panel__body">{children}</div>
    </section>
  );
}

/* ── StatCard ── */
function StatCard({ label, value, Icon, hot }) {
  return (
    <div className={`ops-stat${hot ? " ops-stat--hot" : ""}`}>
      <div className="ops-stat__icon">
        <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
      </div>
      <div className="ops-kicker ops-stat__label">{label}</div>
      <div className="ops-stat__value">{value ?? 0}</div>
    </div>
  );
}

export function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [spots, setSpots] = useState([]);
  const [verifs, setVerifs] = useState([]);
  const [flags, setFlags] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [noteFor, setNoteFor] = useState(null);
  const [clock, setClock] = useState(() => hhmm(new Date()));
  const [refreshing, setRefreshing] = useState(false);
  const [inspectingId, setInspectingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [imgZoom, setImgZoom] = useState(1);
  const [imgRotate, setImgRotate] = useState(0);
  const [imgInvert, setImgInvert] = useState(false);

  const load = useCallback(async () => {
    Promise.all([
      api("/api/admin/overview").catch(() => null),
      api("/api/admin/spot-suggestions").catch(() => []),
      api("/api/admin/verifications").catch(() => []),
      api("/api/admin/flags").catch(() => []),
      api("/api/admin/profile-requests").catch(() => []),
    ]).then(([ov, sp, ve, fl, pr]) => {
      setData(ov ?? null);
      setSpots(sp ?? []);
      setVerifs(ve ?? []);
      setFlags(fl ?? []);
      setProfiles(pr ?? []);
      setClock(hhmm(new Date()));
    });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setTimeout(() => setRefreshing(false), 600);
  };

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user?.role, load]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const t = setInterval(() => setClock(hhmm(new Date())), 1000);
    const r = setInterval(load, 45000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [user?.role, load]);

  if (!user)
    return (
      <p className="py-10 text-center font-mono text-xs text-muted-foreground">
        LOADING CONSOLE…
      </p>
    );

  if (user.role !== "admin") {
    return (
      <div className="ops-root ops-root--denied">
        <ShieldCheck size={28} className="ops-denied__icon" aria-hidden="true" />
        <p className="ops-kicker ops-denied__label">Access denied</p>
        <h1 className="ops-denied__title">Uwian staff only</h1>
        <p className="ops-denied__sub">
          This console is for operator accounts. Your crew tools are back on the dashboard.
        </p>
        <Button className="mt-5" variant="neutral" onClick={() => navigate("/groups")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  const reviewSpot = async (id, action) => {
    try {
      const note =
        action === "rejected"
          ? window.prompt("Rejection reason (shown to the submitter):")
          : null;
      if (action === "rejected" && !note) return;
      await api(`/api/admin/spot-suggestions/${id}/review`, { action, note });
      toast.success(action === "approved" ? "Spot is live on the map." : "Suggestion rejected.");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const totalQueued =
    (spots?.length ?? 0) +
    (verifs?.length ?? 0) +
    (flags?.length ?? 0) +
    (profiles?.length ?? 0);

  return (
    <div className="ops-root">

      {/* ── Header bar ── */}
      <div className="ops-header">
        <div className="ops-header__left">
          <ShieldCheck size={15} className="ops-header__icon" aria-hidden="true" />
          <h1 className="ops-header__title">Ops console</h1>
          <span className="ops-kicker ops-header__sub">uwian · instance 01</span>
        </div>
        <div className="ops-header__right">
          {totalQueued > 0 && (
            <span className="ops-header__alert">{totalQueued} pending</span>
          )}
          <span className="ops-header__clock">SYNC {clock}</span>
          <button
            className="ops-refresh"
            onClick={handleRefresh}
            aria-label="Refresh console data"
          >
            <RefreshCw
              size={12}
              strokeWidth={2.5}
              className={refreshing ? "ops-refresh--spin" : ""}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="ops-stats">
        {STAT_CONFIG.map(({ key, label, Icon }) => (
          <StatCard
            key={key}
            label={label}
            value={data?.[key]}
            Icon={Icon}
            hot={QUEUE_KEYS.includes(key) && (data?.[key] ?? 0) > 0}
          />
        ))}
      </div>

      {/* ── Queues ── */}
      <div className="ops-queues">

        {/* Spot suggestions */}
        <Panel title="Spot suggestions" count={spots.length}>
          {spots.length === 0 ? (
            <p className="ops-empty">QUEUE CLEAR</p>
          ) : (
            <ul className="ops-list">
              {spots.map((s) => (
                <li key={s.id} className="ops-item">
                  <div className="ops-item__row">
                    <span className="ops-item__name">{s.name}</span>
                    <span className="ops-item__meta">
                      {Number(s.lat).toFixed(4)} {Number(s.lng).toFixed(4)} ·{" "}
                      {s.price_range ?? "$$"} · closes {s.closes_at || "late"}
                    </span>
                  </div>
                  <div className="ops-item__sub">
                    {s.submitter_name} &lt;{s.submitter_email}&gt; · {fmtStamp(s.created_at)}
                  </div>
                  {s.notes ? <p className="ops-item__note">“{s.notes}”</p> : null}
                  <div className="ops-item__actions">
                    <Button size="sm" onClick={() => reviewSpot(s.id, "approved")}>Approve</Button>
                    <Button size="sm" variant="neutral" onClick={() => reviewSpot(s.id, "rejected")}>Reject</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ID verifications */}
        <Panel title="ID verifications" count={verifs.length}>
          {verifs.length === 0 ? (
            <p className="ops-empty">QUEUE CLEAR</p>
          ) : (
            <ul className="ops-list">
              {verifs.map((v) => (
                <li key={v.user_id} className="ops-item">
                  <div className="ops-item__row">
                    <span className="ops-item__name">{v.name}</span>
                    <span className="ops-item__meta">
                      {(v.id_type ?? "").replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                  <div className="ops-item__sub">
                    {v.email} · name on ID: <strong className="text-foreground">{v.full_name_on_id}</strong> · DOB {v.birthdate_on_id}
                    {v.id_number ? ` · ID #${v.id_number}` : ""} · submitted {fmtStamp(v.submitted_at)}
                  </div>

                  {/* Submitted ID file thumbnail / inspect button */}
                  <div className="mt-2.5">
                    {v.id_photo ? (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectingId(v);
                          setImgZoom(1);
                          setImgRotate(0);
                          setImgInvert(false);
                        }}
                        className="group relative flex items-center gap-2.5 rounded border border-border/80 bg-black/40 px-3 py-1.5 text-xs text-foreground transition-all hover:border-main hover:bg-main/10"
                        title="Open and inspect submitted ID document"
                      >
                        <div className="h-8 w-12 shrink-0 overflow-hidden rounded border border-border/60 bg-black/60">
                          <img
                            src={v.id_photo}
                            alt="Submitted document thumbnail"
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-main">
                            <FileText size={12} aria-hidden="true" />
                            <span>OPEN SUBMITTED ID FILE</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">Click to inspect & review document</div>
                        </div>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                        <FileText size={12} aria-hidden="true" /> No document file attached
                      </div>
                    )}
                  </div>

                  <div className="ops-item__actions mt-3">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await api(`/api/admin/verifications/${v.user_id}/approve`, {});
                          toast.success(`${v.name} approved! Verified badge granted.`);
                          load();
                        } catch (e) {
                          toast.error(e.message);
                        }
                      }}
                    >
                      <Check size={12} className="mr-1" aria-hidden="true" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="neutral"
                      onClick={() => {
                        setRejectTarget(v);
                        setRejectNote("");
                      }}
                    >
                      <X size={12} className="mr-1" aria-hidden="true" />
                      Disapprove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Name / email change requests */}
        <Panel title="Name / email change requests" count={profiles.length}>
          {profiles.length === 0 ? (
            <p className="ops-empty">QUEUE CLEAR</p>
          ) : (
            <ul className="ops-list">
              {profiles.map((p) => (
                <li key={p.id} className="ops-item">
                  <div className="ops-item__row">
                    <span className="ops-item__name">{p.user_name}</span>
                    <span className="ops-kicker ops-item__field">{p.field}</span>
                  </div>
                  <div className="ops-item__diff">
                    <span className="ops-item__old">{p.old_value}</span>
                    <span className="ops-item__arrow">→</span>
                    <span className="ops-item__new">{p.new_value}</span>
                  </div>
                  <div className="ops-item__actions">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await api(`/api/admin/profile-requests/${p.id}/review`, { action: "approved" });
                          toast.success("Approved.");
                          load();
                        } catch (e) {
                          toast.error(e.message);
                        }
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="neutral"
                      onClick={async () => {
                        const note = window.prompt("Rejection reason (shown to the user):");
                        if (!note) return;
                        try {
                          await api(`/api/admin/profile-requests/${p.id}/review`, { action: "rejected", note });
                          toast.success("Rejected.");
                          load();
                        } catch (e) {
                          toast.error(e.message);
                        }
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Open reports */}
        <Panel title="Open reports" count={flags.length}>
          {flags.length === 0 ? (
            <p className="ops-empty">NO OPEN REPORTS</p>
          ) : (
            <ul className="ops-list">
              {flags.map((f) => (
                <li key={f.id} className="ops-item">
                  <div className="ops-item__row">
                    {/* Severity: red is used on exactly one thing — the flagged name */}
                    <span className="ops-item__flagged">{f.flagged_name}</span>
                    <span className="ops-item__meta">{f.flagged_email}</span>
                  </div>
                  <div className="ops-item__sub">
                    reported by {f.reporter_name} · {f.category} · {fmtStamp(f.created_at)}
                  </div>
                  <p className="ops-item__note">“{f.reason}”</p>
                  {noteFor === f.id ? (
                    <div className="mt-2 flex gap-2">
                      <Input
                        autoFocus
                        className="rounded-none"
                        placeholder="Note for the record"
                        onKeyDown={async (e) => {
                          if (e.key !== "Enter") return;
                          try {
                            await api(`/api/admin/flags/${f.id}/review`, {
                              action: "reviewed",
                              note: e.target.value,
                            });
                            toast.success("Marked reviewed.");
                            setNoteFor(null);
                            load();
                          } catch (err) {
                            toast.error(err.message);
                          }
                        }}
                      />
                      <Button size="sm" variant="neutral" onClick={() => setNoteFor(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="ops-item__actions">
                      <Button size="sm" onClick={() => setNoteFor(f.id)}>
                        Mark reviewed
                      </Button>
                      <Button
                        size="sm"
                        variant="neutral"
                        onClick={async () => {
                          try {
                            await api(`/api/admin/flags/${f.id}/review`, { action: "dismissed" });
                            toast.success("Dismissed.");
                            load();
                          } catch (e) {
                            toast.error(e.message);
                          }
                        }}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

      </div>

      {/* ── ID Verification Inspector Modal ── */}
      {inspectingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-sm"
          onClick={() => setInspectingId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative flex flex-col lg:flex-row w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-base border-2 border-border bg-[#0d0e12] text-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Close Button for Mobile */}
            <button
              onClick={() => setInspectingId(null)}
              className="absolute top-3 right-3 z-20 grid size-8 place-items-center rounded border border-border bg-black/60 text-muted-foreground hover:text-foreground hover:bg-black"
              aria-label="Close inspector"
            >
              <X size={16} />
            </button>

            {/* Left: Interactive Image Canvas */}
            <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden border-b-2 lg:border-b-0 lg:border-r-2 border-border bg-[#050608] min-h-[320px] lg:min-h-[500px]">
              {/* Document Image View */}
              <div className="relative flex h-full w-full items-center justify-center overflow-auto p-4">
                {inspectingId.id_photo ? (
                  <img
                    src={inspectingId.id_photo}
                    alt={`Submitted ID of ${inspectingId.name}`}
                    style={{
                      transform: `scale(${imgZoom}) rotate(${imgRotate}deg)`,
                      filter: imgInvert ? "invert(1) contrast(1.2)" : "none",
                      transition: "transform 0.15s ease-out",
                    }}
                    className="max-h-[70vh] max-w-full rounded object-contain shadow-lg"
                  />
                ) : (
                  <p className="font-mono text-sm text-muted-foreground italic">No image file found</p>
                )}
              </div>

              {/* Toolbar Controls */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full border border-border/80 bg-black/85 px-3 py-1.5 text-xs text-foreground shadow-lg backdrop-blur">
                <button
                  type="button"
                  onClick={() => setImgZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  title="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <span className="font-mono text-[11px] text-muted-foreground min-w-[36px] text-center">
                  {Math.round(imgZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setImgZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  title="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <div className="h-3 w-px bg-border/60 mx-1" />
                <button
                  type="button"
                  onClick={() => setImgRotate((r) => (r + 90) % 360)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  title="Rotate 90 degrees"
                >
                  <RotateCw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setImgInvert((v) => !v)}
                  className={`p-1 ${imgInvert ? "text-main" : "text-muted-foreground hover:text-foreground"}`}
                  title="Invert contrast"
                >
                  <Eye size={14} />
                </button>
                <div className="h-3 w-px bg-border/60 mx-1" />
                <button
                  type="button"
                  onClick={() => {
                    setImgZoom(1);
                    setImgRotate(0);
                    setImgInvert(false);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  title="Reset view"
                >
                  <RefreshCcw size={13} />
                </button>
              </div>
            </div>

            {/* Right: Dossier Details & Verification Decision */}
            <div className="flex w-full lg:w-[380px] shrink-0 flex-col justify-between overflow-y-auto p-5 sm:p-6 bg-[#0d0e12]">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="ops-kicker text-main">OPS INSTRUMENT</span>
                    <span className="rounded bg-main/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-main">
                      {(inspectingId.id_type ?? "ID").replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                  <h2 className="mt-1 font-mono text-base font-bold text-foreground">
                    ID Verification Review
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Compare submitted credentials with document data.
                  </p>
                </div>

                {/* Submitter Dossier */}
                <div className="space-y-2.5 rounded border border-border/80 bg-black/40 p-3 font-mono text-xs">
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground">Member:</span>
                    <span className="font-semibold text-foreground">{inspectingId.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="text-foreground">{inspectingId.email}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground">Name on ID:</span>
                    <span className="font-semibold text-emerald-400">{inspectingId.full_name_on_id}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground">DOB on ID:</span>
                    <span className="text-foreground">{inspectingId.birthdate_on_id}</span>
                  </div>
                  {inspectingId.id_number && (
                    <div className="flex justify-between border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground">ID Number:</span>
                      <span className="text-foreground">{inspectingId.id_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted:</span>
                    <span className="text-muted-foreground">{fmtStamp(inspectingId.submitted_at)}</span>
                  </div>
                </div>

                {/* Verification Notice */}
                <div className="rounded border border-border/60 bg-secondary-background/40 p-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-400" />
                    Verified Badge Grant
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    Only approving grants the Verified Badge to this member. Approved accounts gain access to verified tambayan radars and group trust status.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col gap-2 border-t border-border/80 pt-4">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs"
                  onClick={async () => {
                    try {
                      await api(`/api/admin/verifications/${inspectingId.user_id}/approve`, {});
                      toast.success(`${inspectingId.name} approved! Verified badge granted.`);
                      setInspectingId(null);
                      load();
                    } catch (e) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <Check size={14} className="mr-1.5" />
                  Approve (Grant Verified Badge)
                </Button>
                <Button
                  variant="neutral"
                  className="w-full font-mono text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    setRejectTarget(inspectingId);
                    setRejectNote("");
                  }}
                >
                  <X size={14} className="mr-1.5" />
                  Disapprove / Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Disapproval / Rejection Modal ── */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setRejectTarget(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-base border-2 border-destructive bg-[#0f1015] p-5 text-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                Disapprove Verification
              </h3>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Rejecting submission for <strong className="text-foreground">{rejectTarget.name}</strong> ({rejectTarget.email}). Provide a reason so they can fix and resubmit.
            </p>

            {/* Quick Reason Presets */}
            <div className="mt-3.5 space-y-1.5">
              <span className="ops-kicker">QUICK PRESETS</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Blurry or unreadable document photo",
                  "Name on ID does not match account name",
                  "Invalid, unaccepted, or expired ID",
                  "Document corners or details cut off",
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setRejectNote(reason)}
                    className="rounded border border-border/80 bg-black/50 px-2 py-1 text-[11px] text-muted-foreground hover:border-main hover:text-foreground transition-colors"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div className="mt-3">
              <span className="ops-kicker">REJECTION REASON</span>
              <Input
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Enter feedback for submitter..."
                className="mt-1 font-mono text-xs rounded-none"
                autoFocus
              />
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-2 justify-end">
              <Button
                size="sm"
                variant="neutral"
                onClick={() => setRejectTarget(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-white font-mono text-xs"
                disabled={!rejectNote.trim()}
                onClick={async () => {
                  try {
                    await api(`/api/admin/verifications/${rejectTarget.user_id}/reject`, {
                      note: rejectNote.trim(),
                    });
                    toast.success("Verification submission rejected.");
                    setRejectTarget(null);
                    setInspectingId(null);
                    load();
                  } catch (e) {
                    toast.error(e.message);
                  }
                }}
              >
                Confirm Disapproval
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
