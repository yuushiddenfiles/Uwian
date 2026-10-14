import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Bell,
  Calendar,
  Car,
  Check,
  Copy,
  Flag,
  Hash,
  Mail,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/chrome";
import { api, timeAgo } from "@/lib/api";
import { searchVenues } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TosDocument, TOS_VERSION } from "@/components/tos";

function Shell({ open, onOpenChange, title, description, children, wide, solid }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* data-lenis-prevent: Lenis hijacks wheel events at the window level, so
          without this a scroll inside the dialog scrolls the page behind it. */}
      {/* text-foreground: index.html sets body{color:#fff} inline (unlayered,
          so it beats the themed layered rule) for the pre-paint boot screen.
          Every Shell panel is light, so without this the whole dialog tree
          inherits white-on-light. Dark sub-panels inside dialogs already
          declare their own text colors explicitly. */}
      <DialogContent data-lenis-prevent className={`text-foreground ${solid ? "bg-background" : "glass-70"} max-h-[85vh] overflow-y-auto border-2 border-border shadow-shadow ${wide ? "sm:max-w-xl" : ""}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Notifications ---------- */

const NOTIF_LABEL = {
  uwian_reminder: "Uwian reminder",
  buddy_alert: "Buddy alert",
  escalation: "Escalation",
  nudge: "Limit nudge",
  vouch: "Vouch",
  dispute: "Dispute",
  payment_claim: "Payment",
  ride_request: "Ride request",
  ride_offer: "Ride offer",
  verification_approved: "Verification",
  verification_rejected: "Verification",
  flag_report: "Report",
  message: "Message",
};

const NOTIF_ICON = {
  uwian_reminder: Bell,
  buddy_alert: TriangleAlert,
  escalation: TriangleAlert,
  nudge: Bell,
  vouch: ShieldCheck,
  dispute: Flag,
  payment_claim: Wallet,
  ride_request: Car,
  ride_offer: Car,
  verification_approved: ShieldCheck,
  verification_rejected: ShieldCheck,
  flag_report: Flag,
  message: Mail,
};

export function NotificationsDialog({ open, onOpenChange, onCountChange }) {
  const [items, setItems] = useState([]);
  const load = async () => {
    try {
      const n = await api("/api/me/notifications");
      setItems(n);
      onCountChange?.(n.length);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  return (
    <Shell open={open} onOpenChange={onOpenChange} title={`Notifications${items.length > 0 ? ` (${items.length})` : ""}`} solid>
      {items.length === 0 ? (
        <div className="flex flex-col items-center py-7 text-center">
          <span className="mb-2 grid size-11 place-items-center rounded-base border-2 border-border bg-main text-main-foreground">
            <Check className="size-5" aria-hidden="true" />
          </span>
          <p className="font-semibold">All clear, nothing to see here.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((n) => {
            let payload = {};
            try {
              payload = JSON.parse(n.payload);
            } catch {
              /* keep empty */
            }
            const Icon = NOTIF_ICON[n.kind] ?? Bell;
            const urgent = n.kind === "escalation" || n.kind === "buddy_alert";
            return (
              <li
                key={n.id}
                className={`flex items-start gap-3 rounded-base border-2 p-3 ${
                  urgent ? "border-destructive bg-destructive/5" : "border-border bg-secondary-background"
                }`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-base border-2 border-border bg-main text-main-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-bold">{NOTIF_LABEL[n.kind] ?? n.kind}</span>
                    {n.created_at ? (
                      <span className="kicker text-muted-foreground">{timeAgo(n.created_at)}</span>
                    ) : null}
                  </div>
                  {payload.message ? (
                    <p className="mt-0.5 text-sm break-words text-muted-foreground">{payload.message}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="neutral"
                  className="shrink-0"
                  onClick={async () => {
                    await api(`/api/notifications/${n.id}/read`, {});
                    load();
                  }}
                >
                  Dismiss
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

/* ---------- Verification & safety ---------- */

const ID_TYPES = [
  ["school_id", "School ID"],
  ["national_id", "National ID (PhilSys)"],
  ["passport", "Passport"],
  ["drivers_license", "Driver's License"],
  ["umid", "UMID"],
  ["philhealth", "PhilHealth ID"],
  ["sss", "SSS ID"],
];

/* Compress an image file to a base64 data URL, max 1200px wide, quality 0.82 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round((h * MAX) / w); w = MAX; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* Step indicator pill */
function Steps({ current, total }) {
  return (
    <div className="mb-5 flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
            i < current ? "bg-main" : i === current ? "bg-main/60" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

/* Admin ID photo lightbox */
function PhotoLightbox({ src }) {
  const [open, setOpen] = useState(false);
  if (!src) return <p className="mt-1 text-xs text-muted-foreground italic">No photo uploaded</p>;
  return (
    <>
      <button
        className="mt-1.5 block overflow-hidden rounded-base border-2 border-border bg-black/10 transition-opacity hover:opacity-80"
        onClick={() => setOpen(true)}
        aria-label="View submitted ID photo"
        style={{ width: 120, height: 75 }}
      >
        <img src={src} alt="Submitted ID" className="h-full w-full object-cover" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt="Submitted ID (full)"
            className="max-h-[80vh] max-w-full rounded-base border-2 border-border shadow-shadow"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 grid size-9 place-items-center rounded-full border-2 border-border bg-secondary-background text-foreground"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >✕</button>
        </div>
      )}
    </>
  );
}

export function VerificationDialog({ open, onOpenChange }) {
  /* ── shared state ── */
  const [sub, setSub] = useState(null);           // own submission
  const [tosAccepted, setTosAccepted] = useState(false);
  const [tosAcceptedAt, setTosAcceptedAt] = useState(null);
  const [data, setData] = useState(null);          // /api/me/verification
  /* ── admin state ── */
  const [isAdmin, setIsAdmin] = useState(false);
  const [pending, setPending] = useState([]);
  const [flags, setFlags] = useState([]);
  const [profReqs, setProfReqs] = useState([]);
  /* ── wizard state ── */
  const [step, setStep] = useState(0);
  // step 0 = TOS | 1 = ID info | 2 = photo upload | 3 = processing/done
  const [tosChecked, setTosChecked] = useState(false);
  const [tosBusy, setTosBusy] = useState(false);
  const [idType, setIdType] = useState("school_id");
  const [fullName, setFullName] = useState("");
  const [bday, setBday] = useState("");
  const [photo, setPhoto] = useState(null);        // base64 data URL
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [v, vs] = await Promise.all([
        api("/api/me/verification"),
        api("/api/me/verification-status").catch(() => ({ submission: null })),
      ]);
      setData(v);
      setSub(vs.submission ?? null);
      setTosAccepted(!!vs.tos_accepted);
      setTosAcceptedAt(vs.tos_accepted_at ?? null);
      setTosChecked(false);
      setIdType(vs.submission?.id_type ?? "school_id");
      setFullName(vs.submission?.full_name_on_id ?? "");
      setBday(vs.submission?.birthdate_on_id ?? v.user?.birthdate ?? "");
      setPhoto(null);
      /* jump to correct step */
      if (vs.submission?.status === "pending" || vs.submission?.status === "approved") {
        setStep(3);
      } else if (vs.submission?.status === "rejected") {
        setStep(1); // let them re-submit
      } else if (vs.tos_accepted) {
        setStep(1);
      } else {
        setStep(0);
      }
    } catch (e) {
      toast.error(e.message);
      return;
    }
    try {
      const [pv, fl, pr] = await Promise.all([
        api("/api/admin/verifications"),
        api("/api/admin/flags"),
        api("/api/admin/profile-requests"),
      ]);
      setIsAdmin(true); setPending(pv); setFlags(fl); setProfReqs(pr);
    } catch { setIsAdmin(false); }
  };

  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── photo file input handler ── */
  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please select an image file.");
    try {
      const compressed = await compressImage(file);
      setPhoto(compressed);
    } catch {
      toast.error("Could not read that image. Try another file.");
    }
  };

  /* ── submit ── */
  const handleSubmit = async () => {
    if (!fullName.trim() || !bday) return toast.error("Full name and birthdate are required.");
    if (!photo) return toast.error("Please attach a photo of your ID.");
    setSubmitting(true);
    try {
      await api("/api/me/submit-verification", {
        id_type: idType,
        full_name_on_id: fullName.trim(),
        birthdate_on_id: bday,
        id_photo: photo,
      });
      toast.success("Verification submitted! An admin will review within 24 hours.");
      setStep(3);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isApproved = sub?.status === "approved";
  const isPending  = sub?.status === "pending" || sub?.status === "under_review";
  const isRejected = sub?.status === "rejected";

  const TOTAL_STEPS = 3; // TOS · ID info · Photo

  return (
    <Shell open={open} onOpenChange={onOpenChange} title="ID Verification" wide>

      {/* ═══ ALREADY APPROVED ═══ */}
      {isApproved ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-base border-2 border-main bg-main/10 p-4">
            <ShieldCheck className="size-6 shrink-0 text-main" aria-hidden="true" />
            <div>
              <p className="font-bold">ID Verified ✓</p>
              <p className="text-sm text-muted-foreground">{data?.trust_tier} · Vouches received: {data?.vouches_received ?? 0}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-base border-2 border-border p-3">
              <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">VOUCHES RECEIVED</div>
              <div className="mt-1 text-lg font-bold">{data?.vouches_received ?? 0} vouches</div>
            </div>
            <div className="rounded-base border-2 border-border p-3">
              <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">ACCOUNT STRIKES</div>
              <div className="mt-1 text-lg font-bold">{data?.strikes ?? 0} strikes</div>
            </div>
          </div>
        </div>

      /* ═══ PENDING / PROCESSING ═══ */
      ) : step === 3 || isPending ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-base border-2 border-border bg-secondary-background py-8 px-4 text-center">
            <div className="grid size-14 place-items-center rounded-full border-2 border-border bg-main text-main-foreground">
              <ShieldCheck className="size-7" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-bold">Under review</h3>
            <p className="max-w-xs text-sm text-muted-foreground">
              Your ID has been submitted. An Uwian operator will review it within 24 hours.
              You'll get a notification once it's approved.
            </p>
            <Badge variant="secondary">Verification pending review</Badge>
          </div>
          {isRejected && sub?.rejection_note && (
            <div className="rounded-base border-2 border-destructive bg-destructive/5 p-3">
              <p className="text-sm font-semibold text-destructive">Rejected</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{sub.rejection_note}</p>
              <Button className="mt-2" size="sm" onClick={() => setStep(1)}>Re-submit</Button>
            </div>
          )}
        </div>

      /* ═══ WIZARD ═══ */
      ) : (
        <>
          <Steps current={step} total={TOTAL_STEPS} />

          {/* ─── STEP 0: TOS ─── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold">Terms of Service</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Uwian does not collect your government ID until you agree to these terms.
                  Read them, then accept to continue.
                </p>
              </div>
              <TosDocument />
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--main)]"
                  checked={tosChecked}
                  onChange={(e) => setTosChecked(e.target.checked)}
                />
                <span>I have read and agree to the Uwian Terms of Service (version {TOS_VERSION}).</span>
              </label>
              <Button
                className="w-full"
                disabled={!tosChecked || tosBusy}
                onClick={async () => {
                  setTosBusy(true);
                  try {
                    const r = await api("/api/me/accept-tos", {});
                    setTosAccepted(true);
                    setTosAcceptedAt(r?.accepted_at ?? null);
                    toast.success("Terms accepted.");
                    setStep(1);
                  } catch (e) { toast.error(e.message); }
                  finally { setTosBusy(false); }
                }}
              >
                {tosBusy ? "Recording…" : "Accept and continue →"}
              </Button>
            </div>
          )}

          {/* ─── STEP 1: ID info ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold">Which ID will you submit?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose your ID type and enter your details exactly as they appear on it.
                  This is only visible to Uwian operators — never to other members.
                </p>
              </div>

              {isRejected && sub?.rejection_note && (
                <div className="rounded-base border-2 border-destructive bg-destructive/5 px-3 py-2">
                  <p className="text-sm font-semibold text-destructive">Previous submission rejected</p>
                  <p className="text-sm text-muted-foreground">{sub.rejection_note}</p>
                </div>
              )}

              <div>
                <Label htmlFor="ver-idtype">ID type</Label>
                <Select value={idType} onValueChange={setIdType}>
                  <SelectTrigger id="ver-idtype" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="ver-name">Full name (exactly as on ID)</Label>
                <Input
                  id="ver-name"
                  className="mt-1"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                />
              </div>

              <div>
                <Label htmlFor="ver-bday">Birthdate (on ID)</Label>
                <Input id="ver-bday" type="date" className="mt-1" value={bday} onChange={(e) => setBday(e.target.value)} />
              </div>

              <Button
                className="w-full"
                disabled={!fullName.trim() || !bday}
                onClick={() => setStep(2)}
              >
                Continue → Upload photo
              </Button>
            </div>
          )}

          {/* ─── STEP 2: Photo upload ─── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold">Take or upload a photo of your ID</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Make sure all four corners are visible and the text is clearly readable.
                  Only Uwian operators will see this image.
                </p>
              </div>

              {/* Upload zone */}
              <label
                htmlFor="id-photo-input"
                className={`relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-base border-2 border-dashed transition-colors ${
                  photo ? "border-main bg-main/5" : "border-border bg-secondary-background hover:border-main/60"
                }`}
              >
                {photo ? (
                  <img src={photo} alt="ID preview" className="max-h-[200px] max-w-full rounded object-contain p-1" />
                ) : (
                  <>
                    <div className="grid size-11 place-items-center rounded-base border-2 border-border bg-main text-main-foreground">
                      <span className="text-xl" aria-hidden="true">📷</span>
                    </div>
                    <p className="text-sm font-semibold">Tap to take a photo or upload an image</p>
                    <p className="text-xs text-muted-foreground">JPG or PNG · max 8 MB</p>
                  </>
                )}
                <input
                  id="id-photo-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>

              {photo && (
                <button
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setPhoto(null)}
                >
                  Remove photo and try again
                </button>
              )}

              <div className="flex gap-2">
                <Button variant="neutral" className="flex-1" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!photo || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? "Submitting…" : "Submit for review →"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ HOW SAFETY WORKS ═══ */}
      <div className="mt-5 border-t-2 border-border pt-4">
        <h3 className="font-bold">How safety works here</h3>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li><strong className="text-foreground">Admin-reviewed verification.</strong> ID details are checked by a crew admin, not self-declared.</li>
          <li><strong className="text-foreground">Double-vouch safeguard.</strong> New crews need existing members to vouch for you.</li>
          <li><strong className="text-foreground">Commute buddy system.</strong> When sessions wrap, attendees pair up by direction with arrival check-ins.</li>
          <li><strong className="text-foreground">Two-strike policy.</strong> Disruption or false vouches earn a strike and vouch revocation.</li>
          <li><strong className="text-foreground">Reports.</strong> Any member can report behavior; admins review flags within 24 hours.</li>
        </ul>
      </div>

      {/* ═══ ADMIN MODERATION SECTION ═══ */}
      {isAdmin ? (
        <div className="mt-5 border-t-2 border-border pt-4">
          <h3 className="flex items-center gap-2 font-bold">
            Admin moderation
            {pending.length > 0 ? <Badge variant="secondary">{pending.length} pending</Badge> : null}
            {flags.length > 0 ? <Badge variant="destructive">{flags.length} flags</Badge> : null}
          </h3>

          {/* ── Pending verifications ── */}
          <h4 className="mt-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">ID Submissions</h4>
          {pending.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No pending verifications.</p>
          ) : (
            pending.slice(0, 8).map((pv) => (
              <div key={pv.user_id} className="mt-2 rounded-base border-2 border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{pv.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {pv.email} · {(pv.id_type ?? "").replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Name on ID: <strong>{pv.full_name_on_id}</strong> · DOB: {pv.birthdate_on_id}
                    </div>
                    <PhotoLightbox src={pv.id_photo} />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await api(`/api/admin/verifications/${pv.user_id}/approve`, {});
                        toast.success(`${pv.name} approved.`);
                        load();
                      } catch (e) { toast.error(e.message); }
                    }}
                  >
                    Approve ✓
                  </Button>
                  <Button
                    size="sm"
                    variant="neutral"
                    onClick={async () => {
                      const note = window.prompt("Rejection reason (shown to the user):");
                      if (!note) return;
                      try {
                        await api(`/api/admin/verifications/${pv.user_id}/reject`, { note });
                        toast.success("Rejected.");
                        load();
                      } catch (e) { toast.error(e.message); }
                    }}
                  >
                    Reject ✗
                  </Button>
                </div>
              </div>
            ))
          )}

          {/* ── Flags ── */}
          {flags.length > 0 && (
            <>
              <h4 className="mt-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Open Reports</h4>
              {flags.slice(0, 5).map((f) => (
                <div key={f.id} className="mt-2 rounded-base border-2 border-destructive bg-destructive/5 p-3">
                  <div className="font-semibold">Report: {f.flagged_name}</div>
                  <div className="text-xs text-muted-foreground">Reported by {f.reporter_name} · {f.category}</div>
                  <p className="my-1 text-sm italic">"{f.reason}"</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api(`/api/admin/flags/${f.id}/review`, { action: "reviewed" });
                        toast.success("Flag reviewed.");
                        load();
                      }}
                    >
                      Reviewed
                    </Button>
                    <Button
                      size="sm"
                      variant="neutral"
                      onClick={async () => {
                        await api(`/api/admin/flags/${f.id}/review`, { action: "dismissed" });
                        toast.success("Flag dismissed.");
                        load();
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Name/email change requests ── */}
          {profReqs.length > 0 && (
            <>
              <h4 className="mt-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Name / Email Changes</h4>
              {profReqs.map((pr) => (
                <div key={pr.id} className="mt-2 rounded-base border-2 border-border p-3">
                  <div className="font-semibold">{pr.user_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {pr.field}: {pr.old_value} → {pr.new_value}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api(`/api/admin/profile-requests/${pr.id}/review`, { action: "approved" });
                        toast.success(`${pr.field} change approved.`);
                        load();
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
                        await api(`/api/admin/profile-requests/${pr.id}/review`, { action: "rejected", note });
                        toast.success("Rejected.");
                        load();
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}
    </Shell>
  );
}

/* ---------- Buddy escort ---------- */


/* ---------- Buddy escort ---------- */

export function BuddyDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    if (!open) return;
    api("/api/sessions/feed")
      .then((f) => setSessions(f.filter((s) => s.status === "wrapped" || s.status === "open")))
      .catch(() => setSessions([]));
  }, [open ]);

  return (
    <Shell open={open} onOpenChange={onOpenChange} title="Safe arrival and buddy escort">
      <p className="text-sm text-muted-foreground">Never commute home alone late at night.</p>
      <h3 className="mt-3 font-bold">Active commute radar</h3>
      {sessions.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          No wrapped sessions in progress. When an admin taps “Wrap session”, buddy pairs activate automatically.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-base border-2 border-border p-2.5">
              <div>
                <div className="text-sm font-semibold">{s.spot_name || "Tambayan"}</div>
                <div className="text-xs text-muted-foreground">{s.group_name} · {s.status}</div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/sessions/${s.id}`);
                }}
              >
                View buddies
              </Button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-4 font-bold">How the escort protects you</h3>
      <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li><strong className="text-foreground">Direction pairing.</strong> Members heading the same way leave in pairs or trios.</li>
        <li><strong className="text-foreground">Check-in deadline.</strong> Miss your arrival estimate and your buddy gets nudged.</li>
        <li><strong className="text-foreground">Admin escalation.</strong> If both go quiet, organizers and admins are alerted.</li>
      </ol>
    </Shell>
  );
}

/* ---------- Crews & sessions ---------- */

export function NewCrewDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName("");
  }, [open ]);
  return (
    <Shell open={open} onOpenChange={onOpenChange} title="New crew" description="Give your crew a name. You can invite members after.">
      <Label htmlFor="crew-name">Crew name</Label>
      <Input
        id="crew-name"
        className="mt-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Barkada Sabado"
      />
      <Button
        className="mt-4 w-full"
        onClick={async () => {
          if (!name.trim()) return toast.error("Give your crew a name first.");
          try {
            const r = await api("/api/groups", { name: name.trim() });
            onOpenChange(false);
            onCreated?.(r.id);
          } catch (e) {
            toast.error(e.message);
          }
        }}
      >
        Create crew
      </Button>
    </Shell>
  );
}

export function PickCrewDialog({ open, onOpenChange, onPick }) {
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    if (open) api("/api/groups").then(setGroups).catch(() => setGroups([]));
  }, [open ]);
  return (
    <Shell open={open} onOpenChange={onOpenChange} title="Pick a crew for your session">
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No crews yet. Create one first.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Button
                variant="neutral"
                className="w-full justify-between"
                onClick={() => {
                  onOpenChange(false);
                  onPick(g);
                }}
              >
                <span className="font-semibold">{g.name}</span>
                <span aria-hidden="true">→</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

export function SessionFormDialog({ open, onOpenChange, gid, onCreated }) {
  const [friendsList, setFriendsList] = useState([]);
  const [pastCrew, setPastCrew] = useState([]);
  const [spots, setSpots] = useState([]);
  const [when, setWhen] = useState("");
  const [spot, setSpot] = useState("none");
  const [dd, setDd] = useState("none");
  const [selectedUids, setSelectedUids] = useState(new Set());
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterFilter, setRosterFilter] = useState("all"); // 'all' | 'friends' | 'past'
  const [submitting, setSubmitting] = useState(false);

  // Quick preset helper
  const applyPreset = (offsetDays, hours, minutes = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hours, minutes, 0, 0);
    // Format to YYYY-MM-DDTHH:mm local
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    const hr = String(d.getHours()).padStart(2, "0");
    const mn = String(d.getMinutes()).padStart(2, "0");
    setWhen(`${yr}-${mo}-${dy}T${hr}:${mn}`);
  };

  useEffect(() => {
    if (open && gid) {
      setWhen("");
      setSpot("none");
      setDd("none");
      setRosterSearch("");
      setRosterFilter("all");

      // Fetch spots, accepted friends, and past crew in parallel.
      // Only friends and past successful-session crew are invitable —
      // plain crew membership alone no longer qualifies anyone.
      Promise.all([
        api(`/api/groups/${gid}/spots`).catch(() => []),
        api("/api/friends").catch(() => ({ friends: [] })),
        api("/api/users/past-crew").catch(() => [])
      ]).then(([sRes, fRes, pRes]) => {
        setSpots(sRes ?? []);
        const friends = fRes?.friends ?? [];
        setFriendsList(friends);
        setPastCrew(Array.isArray(pRes) ? pRes : []);

        // Pre-select friends (the inner circle is in by default);
        // past crew stays opt-in per person.
        setSelectedUids(new Set(friends.map((f) => f.id)));
      });
    }
  }, [open, gid]);

  // Combine Friends and Past Crew into a unified roster. Someone who is both
  // gets both badges. Current crew membership alone lists nobody.
  const candidateMap = new Map();
  (friendsList ?? []).forEach((f) => {
    candidateMap.set(f.id, {
      id: f.id,
      name: f.name,
      handle: f.handle || `user#${f.id}`,
      avatar_id: f.avatar_id,
      avatar_url: f.avatar_url,
      can_drink: f.can_drink,
      isFriend: true,
      isPastCrew: false,
      pastSession: null,
    });
  });

  (pastCrew ?? []).forEach((p) => {
    if (candidateMap.has(p.id)) {
      const c = candidateMap.get(p.id);
      c.isPastCrew = true;
      c.pastSession = { starts_at: p.starts_at, spot_name: p.spot_name };
    } else {
      candidateMap.set(p.id, {
        id: p.id,
        name: p.name,
        handle: p.handle || `user#${p.id}`,
        avatar_id: p.avatar_id,
        avatar_url: p.avatar_url,
        can_drink: p.can_drink,
        isFriend: false,
        isPastCrew: true,
        pastSession: { starts_at: p.starts_at, spot_name: p.spot_name },
      });
    }
  });

  const allCandidates = Array.from(candidateMap.values());
  const friendCount = allCandidates.filter((c) => c.isFriend).length;
  const pastCount = allCandidates.filter((c) => c.isPastCrew).length;

  // Short "Sep 16" label for the past-crew badge.
  const pastDate = (starts_at) => {
    const d = new Date(String(starts_at ?? "").replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // Filter candidates by search and category
  const filteredCandidates = allCandidates.filter((c) => {
    if (rosterFilter === "friends" && !c.isFriend) return false;
    if (rosterFilter === "past" && !c.isPastCrew) return false;
    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase().trim();
      const matchName = c.name.toLowerCase().includes(q);
      const matchHandle = (c.handle || "").toLowerCase().includes(q);
      return matchName || matchHandle;
    }
    return true;
  });

  // Toggle user selection
  const toggleUser = (uid) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
        if (Number(dd) === uid) setDd("none");
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedUids(new Set(allCandidates.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedUids(new Set());
    setDd("none");
  };

  // Selected candidates list for designated driver picker
  const selectedAttendees = allCandidates.filter((c) => selectedUids.has(c.id));
  const selectedSpotObj = spots.find((s) => String(s.id) === String(spot));

  const handleSubmit = async () => {
    if (!when) return toast.error("Please pick a session date and time.");
    if (selectedUids.size === 0) return toast.error("Please invite at least one member or friend to the session.");

    setSubmitting(true);
    try {
      const r = await api(`/api/groups/${gid}/sessions`, {
        starts_at: when,
        spot_id: spot !== "none" ? Number(spot) : null,
        designated_driver_id: dd !== "none" ? Number(dd) : null,
        invited_user_ids: Array.from(selectedUids),
      });
      toast.success("Session created and roster invited!");
      onOpenChange(false);
      onCreated?.(r.id);
    } catch (e) {
      toast.error(e.message || "Failed to create session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      wide={true}
      title={
        <div className="flex items-center gap-2">
          <Badge className="bg-main text-main-foreground font-black text-[10px] uppercase">
            ⚡ NEW SESSION
          </Badge>
          <span className="text-lg font-black tracking-tight">Plan an Uwian Session</span>
        </div>
      }
      description="Schedule departure, pick a verified tambayan, choose attendees from friends and past crew, and assign a designated driver."
    >
      <div className="space-y-5 pt-1 text-foreground">
        {/* Section 1: When & Quick Presets */}
        <div className="rounded-xl border-2 border-border bg-secondary-background/60 p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sess-when" className="flex items-center gap-1.5 font-black text-sm">
              <Calendar className="size-4 text-main" /> When will the hangout start?
            </Label>
            <span className="text-[11px] font-mono text-muted-foreground">Required</span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset(0, 20, 0)}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-bold hover:bg-main hover:text-main-foreground transition-colors"
            >
              Tonight 8:00 PM
            </button>
            <button
              type="button"
              onClick={() => applyPreset(0, 22, 0)}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-bold hover:bg-main hover:text-main-foreground transition-colors"
            >
              Tonight 10:00 PM
            </button>
            <button
              type="button"
              onClick={() => applyPreset(1, 19, 0)}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-bold hover:bg-main hover:text-main-foreground transition-colors"
            >
              Tomorrow 7:00 PM
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const distToFriday = (5 - now.getDay() + 7) % 7 || 7;
                applyPreset(distToFriday, 21, 0);
              }}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-bold hover:bg-main hover:text-main-foreground transition-colors"
            >
              Friday 9:00 PM
            </button>
          </div>

          <Input
            id="sess-when"
            type="datetime-local"
            className="mt-2.5 bg-card font-mono text-sm"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>

        {/* Section 2: Location Spot Selector */}
        <div className="rounded-xl border-2 border-border bg-secondary-background/60 p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sess-spot" className="flex items-center gap-1.5 font-black text-sm">
              <MapPin className="size-4 text-main" /> Location / Tambayan
            </Label>
            <span className="text-[11px] text-muted-foreground">Verified spots</span>
          </div>

          <Select value={spot} onValueChange={setSpot}>
            <SelectTrigger id="sess-spot" className="mt-2 bg-card">
              <SelectValue placeholder="No spot (decide later)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No spot pinned yet (decide in chat)</SelectItem>
              {spots.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name} {s.price_range ? `· ${s.price_range}` : ""} {s.closes_at ? `(Closes ${s.closes_at})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedSpotObj && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
              <MapPin className="size-3.5 text-main shrink-0" />
              <div className="truncate">
                <span className="font-bold">{selectedSpotObj.name}</span>
                {selectedSpotObj.closes_at && (
                  <span className="text-muted-foreground ml-2">Open until {selectedSpotObj.closes_at}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Choose Who to Add (Crew Members & Friends) */}
        <div className="rounded-xl border-2 border-border bg-secondary-background/60 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label className="flex items-center gap-1.5 font-black text-sm">
                <Users className="size-4 text-main" /> Choose Who to Add into Session
              </Label>
              <p className="text-xs text-muted-foreground">
                Select friends & past crew to invite to the session and automatic group chat.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-main text-main-foreground font-bold text-xs">
                {selectedUids.size} selected
              </Badge>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-bold text-main hover:underline"
              >
                All
              </button>
              <span className="text-xs text-muted-foreground">·</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs font-bold text-muted-foreground hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search & Tabs Filter */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter by name or tag (e.g. yuu#12345)..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-card"
              />
            </div>
            <div className="flex rounded-md border border-border bg-card p-0.5 text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setRosterFilter("all")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  rosterFilter === "all" ? "bg-main text-main-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({allCandidates.length})
              </button>
              <button
                type="button"
                onClick={() => setRosterFilter("friends")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  rosterFilter === "friends" ? "bg-main text-main-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Friends ({friendCount})
              </button>
              <button
                type="button"
                onClick={() => setRosterFilter("past")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  rosterFilter === "past" ? "bg-main text-main-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Past crew ({pastCount})
              </button>
            </div>
          </div>

          {/* Member & Friend Candidate List */}
          <div className="mt-3 max-h-56 overflow-y-auto space-y-2 pr-1">
            {filteredCandidates.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {allCandidates.length === 0
                  ? "No friends or past crew yet. Add friends, or finish a session together first."
                  : "Nobody here matches that filter."}
              </div>
            ) : (
              filteredCandidates.map((c) => {
                const isSelected = selectedUids.has(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleUser(c.id)}
                    className={`flex items-center justify-between gap-3 rounded-lg border-2 p-2.5 cursor-pointer transition-all ${
                      isSelected
                        ? "border-main bg-main/10 shadow-xs"
                        : "border-border bg-card hover:border-main/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Checkbox Indicator */}
                      <div
                        className={`grid size-5 shrink-0 place-items-center rounded border-2 transition-colors ${
                          isSelected
                            ? "border-main bg-main text-main-foreground"
                            : "border-border bg-secondary-background"
                        }`}
                      >
                        {isSelected && <Check className="size-3.5 stroke-[3]" />}
                      </div>

                      <Avatar name={c.name} art={c.avatar_id} custom={c.avatar_url} size={36} />

                      <div className="min-w-0">
                        {/* Name on top (larger, bold) */}
                        <div className="truncate text-sm font-black text-foreground leading-tight">
                          {c.name}
                        </div>
                        {/* ID Tag underneath (smaller, monospace) */}
                        <div className="font-mono text-[11px] font-semibold text-muted-foreground">
                          {c.handle}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.isFriend && (
                        <span className="rounded bg-main/20 border border-border px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                          Friend
                        </span>
                      )}
                      {c.isPastCrew && (
                        <span
                          className="rounded bg-secondary-background border border-border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                          title={
                            c.pastSession?.spot_name
                              ? `Shared a successful session at ${c.pastSession.spot_name}`
                              : "Shared a successful session together"
                          }
                        >
                          Past crew{pastDate(c.pastSession?.starts_at) ? ` · ${pastDate(c.pastSession.starts_at)}` : ""}
                        </span>
                      )}
                      {c.can_drink === 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 border border-border px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                          <Car className="size-3" /> DD
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Section 4: Designated Driver (Skipped on alcohol bill splits) */}
        <div className="rounded-xl border-2 border-border bg-secondary-background/60 p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sess-dd" className="flex items-center gap-1.5 font-black text-sm">
              <Car className="size-4 text-main" /> Designated Driver
            </Label>
            <span className="text-[11px] text-muted-foreground">Alcohol bill split exemption</span>
          </div>

          <Select value={dd} onValueChange={setDd}>
            <SelectTrigger id="sess-dd" className="mt-2 bg-card">
              <SelectValue placeholder="No designated driver assigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No designated driver</SelectItem>
              {selectedAttendees.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name} {m.can_drink === 0 ? "🚗 (Non-drinker · Recommended)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            The designated driver is automatically skipped on all alcohol expense items when calculating settlements.
          </p>
        </div>

        {/* Create Session CTA */}
        <Button
          type="button"
          disabled={submitting || !when || selectedUids.size === 0}
          className="w-full text-base font-black py-5 shadow-shadow bg-main text-main-foreground hover:opacity-95"
          onClick={handleSubmit}
        >
          {submitting ? (
            "Creating session..."
          ) : (
            <>
              <Sparkles className="size-4 mr-2" />
              Create Session · {selectedUids.size} in Roster 🚀
            </>
          )}
        </Button>
      </div>
    </Shell>
  );
}


export function InviteDialog({ open, onOpenChange, gid }) {
  const [link, setLink] = useState("");
  useEffect(() => {
    if (open && gid) {
      api(`/api/groups/${gid}/invite`, {})
        .then((r) => setLink(`${window.location.origin}${r.invite_url}`))
        .catch((e) => toast.error(e.message));
    }
  }, [open, gid ]);
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title="Invite to crew"
      description="Share this link with someone you trust. They will need a vouch from a member before joining."
    >
      <p className="rounded-base border-2 border-border bg-secondary-background p-3 font-mono text-[13px] break-all">{link}</p>
      <Button
        className="mt-3 w-full"
        onClick={() => {
          navigator.clipboard?.writeText(link);
          toast.success("Link copied.");
        }}
      >
        <Copy aria-hidden="true" /> Copy link
      </Button>
    </Shell>
  );
}

export function DisputeDialog({ open, onOpenChange, settlementId, onDone }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open ]);
  return (
    <Shell open={open} onOpenChange={onOpenChange} title="Dispute transfer">
      <Label htmlFor="dispute-note">What is wrong with this transfer?</Label>
      <Textarea
        id="dispute-note"
        className="mt-1 min-h-24"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Describe the issue, the admin will see this."
      />
      <Button
        variant="neutral"
        className="mt-3 w-full border-destructive text-destructive"
        onClick={async () => {
          if (!note.trim()) return toast.error("Please describe the issue first.");
          try {
            await api(`/api/settlements/${settlementId}/dispute`, { note: note.trim() });
            toast.success("Marked as disputed. Admins have been notified.");
            onOpenChange(false);
            onDone?.();
          } catch (e) {
            toast.error(e.message);
          }
        }}
      >
        Submit dispute
      </Button>
    </Shell>
  );
}

const FLAG_CATS = [
  ["misconduct", "Misconduct"],
  ["harassment", "Harassment"],
  ["fake_id", "Suspected fake identity"],
  ["spam", "Spam"],
  ["other", "Other"],
];

export function ReportDialog({ open, onOpenChange, targetUid, targetName, groupId }) {
  const [reason, setReason] = useState("");
  const [cat, setCat] = useState("misconduct");
  useEffect(() => {
    if (open) {
      setReason("");
      setCat("misconduct");
    }
  }, [open ]);
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={`Report ${targetName ?? "member"}`}
      description="Reports are confidential and reviewed by crew admins within 24 hours. False reports can earn a strike on your account."
    >
      <Label htmlFor="report-reason">What happened?</Label>
      <Textarea
        id="report-reason"
        className="mt-1 min-h-24"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Describe what happened (at least 10 characters)."
      />
      <div className="mt-2.5">
        <Label htmlFor="report-cat">Category</Label>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger id="report-cat" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLAG_CATS.map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="neutral"
        className="mt-3 w-full border-destructive text-destructive"
        onClick={async () => {
          if (reason.trim().length < 10) return toast.error("Please describe the issue (at least 10 chars).");
          try {
            await api(`/api/users/${targetUid}/flag`, { reason: reason.trim(), category: cat, group_id: groupId ?? null });
            toast.success("Report submitted.");
            onOpenChange(false);
          } catch (e) {
            toast.error(e.message);
          }
        }}
      >
        Submit report
      </Button>
    </Shell>
  );
}

/* ---------- New message ---------- */

export function NewMessageDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("dm");
  const [uid, setUid] = useState("");
  const [groups, setGroups] = useState([]);
  const [crew, setCrew] = useState("");
  useEffect(() => {
    if (open) {
      setMode("dm");
      setUid("");
      setCrew("");
      api("/api/groups").then(setGroups).catch(() => setGroups([]));
    }
  }, [open ]);
  return (
    <Shell open={open} onOpenChange={onOpenChange} title="New message">
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant={mode === "dm" ? "default" : "neutral"} onClick={() => setMode("dm")}>
          Direct message
        </Button>
        <Button size="sm" variant={mode === "group" ? "default" : "neutral"} onClick={() => setMode("group")}>
          Group chat
        </Button>
      </div>
      {mode === "dm" ? (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Enter the user ID of the person to message. Find IDs on member cards in a shared crew.
          </p>
          <Label htmlFor="dm-uid">User ID</Label>
          <Input id="dm-uid" className="mt-1" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="e.g. 3" />
          <Button
            className="mt-3 w-full"
            onClick={async () => {
              const id = Number(uid);
              if (!id) return toast.error("Enter a valid user ID.");
              try {
                const r = await api("/api/conversations/dm", { target_user_id: id });
                onOpenChange(false);
                navigate(`/messages/${r.id}`);
              } catch (e) {
                toast.error(e.message);
              }
            }}
          >
            Open DM
          </Button>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Start a group chat for a whole crew. All active members join automatically.
          </p>
          <Label htmlFor="gc-crew">Crew</Label>
          <Select value={crew} onValueChange={setCrew}>
            <SelectTrigger id="gc-crew" className="mt-1">
              <SelectValue placeholder="Pick a crew" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="mt-3 w-full"
            onClick={async () => {
              if (!crew) return toast.error("Pick a crew first.");
              try {
                const g = groups.find((x) => x.id === Number(crew));
                const r = await api("/api/conversations/group", {
                  group_id: Number(crew),
                  title: `${g?.name ?? "Crew"} Chat`,
                });
                onOpenChange(false);
                navigate(`/messages/${r.id}`);
              } catch (e) {
                toast.error(e.message);
              }
            }}
          >
            Start group chat
          </Button>
        </>
      )}
    </Shell>
  );
}

export function AddSpotDialog({ open, onOpenChange, gid, lat, lng, onAdded }) {
  const [name, setName] = useState("");
  const [closes, setCloses] = useState("02:00");
  const [price, setPrice] = useState("$$");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) {
      setName("");
      setCloses("02:00");
      setPrice("$$");
      setNotes("");
    }
  }, [open ]);
  return (
    <Shell open={open} onOpenChange={onOpenChange} title="Add a tambayan spot" description="Pinned where you double-clicked. Only verified crew members will see it.">
      <Label htmlFor="spot-name">Spot name</Label>
      <Input
        id="spot-name"
        className="mt-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Aling Nena's Illawan, Katipunan"
      />
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <div>
          <Label htmlFor="spot-closes">Closing time</Label>
          <Input id="spot-closes" className="mt-1" value={closes} onChange={(e) => setCloses(e.target.value)} placeholder="02:00" />
        </div>
        <div>
          <Label htmlFor="spot-price">Price range</Label>
          <Select value={price} onValueChange={setPrice}>
            <SelectTrigger id="spot-price" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="$">$ · budget</SelectItem>
              <SelectItem value="$$">$$ · mid</SelectItem>
              <SelectItem value="$$$">$$$ · pricey</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-2.5">
        <Label htmlFor="spot-notes">Notes (optional)</Label>
        <Textarea
          id="spot-notes"
          className="mt-1"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What to order, where to sit, which station exit…"
        />
      </div>
      <Button
        className="mt-4 w-full"
        onClick={async () => {
          if (!name.trim()) return toast.error("Give the spot a name first.");
          try {
            await api(`/api/groups/${gid}/spots`, {
              name: name.trim(),
              lat,
              lng,
              price_range: price,
              closes_at: closes.trim() || null,
              notes: notes.trim() || null,
            });
            toast.success("Spot added to map.");
            onOpenChange(false);
            onAdded?.();
          } catch (e) {
            toast.error(e.message);
          }
        }}
      >
        Add spot
      </Button>
    </Shell>
  );
}

/* Public map equivalent of AddSpotDialog. Nothing here reaches the radar on
   submit: it lands in the staff review queue, so the pin stays visible to the
   person who proposed it (marked pending) until Uwian ops approves it. */
export function SuggestSpotDialog({ open, onOpenChange, lat, lng, onDone, onPickCoords }) {
  const [name, setName] = useState("");
  const [closes, setCloses] = useState("02:00");
  const [price, setPrice] = useState("$$");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setCloses("02:00");
      setPrice("$$");
      setNotes("");
      setQuery("");
      setResults([]);
    }
  }, [open]);
  // Debounced free-text venue search (OpenStreetMap Nominatim, PH-biased).
  // Tapping a result moves the map pin via onPickCoords and fills the name.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        setResults(await searchVenues(q, { signal: ctl.signal }));
      } catch (e) {
        if (e?.name !== "AbortError") toast.error(e.message);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query, open]);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title="Suggest a spot"
      description={
        hasPin
          ? "Pinned where you double-clicked or searched. A Uwian moderator checks it before it appears on the public map."
          : "Double-click the map to drop a pin first — or search for the venue below."
      }
    >
      {/* 1 · Find the venue */}
      <section aria-label="Find the venue">
        <p className="kicker text-muted-foreground">1 · Find the venue</p>
        <div className="relative mt-1.5">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="sug-search"
            aria-label="Find the venue"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Maginhawa food park"
            autoComplete="off"
          />
        </div>
        {searching ? (
          <p className="mt-1.5 text-xs text-muted-foreground">Searching venues…</p>
        ) : results.length > 0 ? (
          <ul className="mt-1.5 max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-base border-2 border-border bg-secondary-background px-2.5 py-2 text-left transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-main"
                  onClick={() => {
                    onPickCoords?.({ lat: r.lat, lng: r.lng });
                    setName(r.name);
                    setQuery("");
                    setResults([]);
                    toast.success(`Pin moved to ${r.name}.`);
                  }}
                >
                  <MapPin aria-hidden className="size-4 shrink-0 text-main" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold">{r.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{r.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim().length >= 3 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">No venues found. Try a landmark or street.</p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground">Venue search by OpenStreetMap contributors.</p>
      </section>
      {/* 2 · Spot details */}
      <section aria-label="Spot details" className="mt-5">
        <p className="kicker text-muted-foreground">2 · Spot details</p>
        <div className="mt-1.5">
          <Label htmlFor="sug-name">Spot name</Label>
          <Input
            id="sug-name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aling Nena's Illawan, Katipunan"
          />
        </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <div>
          <Label htmlFor="sug-closes">Closing time</Label>
          <Input id="sug-closes" className="mt-1" value={closes} onChange={(e) => setCloses(e.target.value)} placeholder="02:00" />
        </div>
        <div>
          <Label htmlFor="sug-price">Price range</Label>
          <Select value={price} onValueChange={setPrice}>
            <SelectTrigger id="sug-price" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="$">$ · budget</SelectItem>
              <SelectItem value="$$">$$ · mid</SelectItem>
              <SelectItem value="$$$">$$$ · pricey</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-2.5">
        <Label htmlFor="sug-notes">Notes (optional)</Label>
        <Textarea
          id="sug-notes"
          className="mt-1"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What to order, where to sit, which station exit…"
        />
      </div>
      </section>
      <Button
        className="mt-4 w-full"
        disabled={busy || !hasPin}
        onClick={async () => {
          if (!name.trim()) return toast.error("Give the spot a name first.");
          setBusy(true);
          try {
            await api("/api/spot-suggestions", {
              name: name.trim(),
              lat,
              lng,
              price_range: price,
              closes_at: closes.trim() || null,
              notes: notes.trim() || null,
            });
            toast.success("Sent for review. You will be notified when a moderator decides.");
            onOpenChange(false);
            onDone?.();
          } catch (e) {
            toast.error(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <MapPin aria-hidden /> Send for review
      </Button>
    </Shell>
  );
}

export function SpotReportDialog({ open, onOpenChange, spot, onDone }) {
  const [answer, setAnswer] = useState("no");
  const [closes, setCloses] = useState("");
  const [details, setDetails] = useState("");
  useEffect(() => {
    if (open) {
      setAnswer("no");
      setCloses("");
      setDetails("");
    }
  }, [open ]);
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={`Report: ${spot?.name ?? "spot"}`}
      description="Crew-sourced freshness. Your report updates the spot for everyone."
    >
      <Label htmlFor="spotrep-answer">What changed?</Label>
      <Select value={answer} onValueChange={setAnswer}>
        <SelectTrigger id="spotrep-answer" className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="no">Closed or gone</SelectItem>
          <SelectItem value="changed">Details changed</SelectItem>
        </SelectContent>
      </Select>
      {answer === "changed" ? (
        <>
          <div className="mt-2.5">
            <Label htmlFor="spotrep-closes">New closing time (optional)</Label>
            <Input id="spotrep-closes" className="mt-1" value={closes} onChange={(e) => setCloses(e.target.value)} placeholder="e.g. 01:00" />
          </div>
          <div className="mt-2.5">
            <Label htmlFor="spotrep-details">What changed? (optional)</Label>
            <Textarea id="spotrep-details" className="mt-1" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="New hours, moved location, price changes…" />
          </div>
        </>
      ) : null}
      <Button
        className="mt-4 w-full"
        onClick={async () => {
          try {
            await api(`/api/spots/${spot.id}/confirm`, {
              answer,
              closes_at: closes.trim() || null,
              new_details: details.trim() || null,
            });
            toast.success("Thanks. Spot freshness updated.");
            onOpenChange(false);
            onDone?.();
          } catch (e) {
            toast.error(e.message);
          }
        }}
      >
        Submit report
      </Button>
    </Shell>
  );
}

export function SafetyGuarantee({ onHowItWorks }) {
  return (
    <div className="flex items-center gap-4 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow sm:p-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-base border-2 border-border bg-main text-main-foreground">
        <ShieldCheck className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-[15px]">Get home safe, together</strong>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          When a session wraps, members pair up by commute direction and check in on arrival. No one travels alone.
        </p>
      </div>
      <Button size="sm" variant="neutral" onClick={onHowItWorks}>
        How it works
      </Button>
    </div>
  );
}

export { Separator };
