import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarDays,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  Clock,
  AlertTriangle,
  Users,
} from "lucide-react";
import { api, fmtSessionTime, fmtTimeShort, greetingByHour } from "@/lib/api";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AccordionGallery from "@/components/reactbits/AccordionGallery/AccordionGallery";
import TextType from "@/components/reactbits/TextType/TextType";
import ScrollReveal from "@/components/reactbits/ScrollReveal/ScrollReveal";
import CountUp from "@/components/reactbits/CountUp/CountUp";
import ClickSpark from "@/components/reactbits/ClickSpark/ClickSpark";
import { Avatar, EmptyState, StatusBadge } from "@/components/chrome";
import { SpotArt } from "@/components/spotArt";
import {
  BuddyDialog,
  NewCrewDialog,
  PickCrewDialog,
  SafetyGuarantee,
  SessionFormDialog,
  VerificationDialog,
} from "@/components/sheets";
import { FindFriendsStack } from "@/components/FindFriendsStack";

/* Cascade reveal: each block rises as it enters the viewport, staggered by
   order. Pure class toggle, no libraries, no scroll math. Worst case the
   block renders static. */
function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`${className} transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        shown ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

/* Hero accent word: bright blue SVG wordmark. A button-blue gradient plus a
   halftone dot pattern fill the glyphs, one hard navy copy sits 4px down and
   right, and a 1px navy stroke sharpens the edges. Plain SVG paint — chosen
   because CSS background-clip:text misfired to solid black here. Canvas font
   metrics size the box and baseline-align it exactly to the h1; it
   re-measures on resize and when webfonts arrive. Before measurement (or if
   it ever fails) it renders solid bright blue, so the word is never
   invisible. Screen readers get the word once via role="img". */
function ElevateWord({ word }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const wrapRef = useRef(null);
  const [m, setM] = useState(null);
  useEffect(() => {
    let alive = true;
    const doMeasure = () => {
      const el = wrapRef.current;
      if (!el || !alive) return;
      try {
        const cs = getComputedStyle(el);
        const px = parseFloat(cs.fontSize) || 48;
        const cv = document.createElement("canvas").getContext("2d");
        cv.font = `700 ${px}px ${cs.fontFamily}`;
        const metrics = cv.measureText(word);
        const ascent = Math.ceil(metrics.actualBoundingBoxAscent ?? px * 0.8);
        const descent = Math.ceil(metrics.actualBoundingBoxDescent ?? px * 0.2);
        const w = Math.ceil(metrics.width);
        if (w > 0) setM({ w, ascent, descent, px });
      } catch {
        /* keep the solid-text fallback */
      }
    };
    doMeasure();
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (alive) doMeasure();
      }).catch(() => {});
    }
    window.addEventListener("resize", doMeasure);
    return () => {
      alive = false;
      window.removeEventListener("resize", doMeasure);
    };
  }, [word ]);
  if (!m) {
    return (
      <span ref={wrapRef} style={{ color: "#5294ff", fontWeight: 700 }}>
        {word}
      </span>
    );
  }
  const pad = 6;
  const W = m.w + pad * 2;
  const H = m.ascent + m.descent + pad * 2;
  const family = "Fraunces, Georgia, serif";
  const render = (extra) => (
    <text
      x={0}
      y={m.ascent}
      fontFamily={family}
      fontWeight={700}
      fontSize={m.px}
      aria-hidden="true"
      {...extra}
    >
      {word}
    </text>
  );
  return (
    <span ref={wrapRef} style={{ display: "inline-block" }}>
      <svg
        width={W}
        height={H}
        viewBox={`${-pad} ${-pad} ${W} ${H}`}
        role="img"
        aria-label={word}
        style={{ display: "inline-block", overflow: "visible", verticalAlign: `${-(m.descent + pad)}px` }}
      >
        <defs>
          <linearGradient id={`eg-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5294ff" />
            <stop offset="0.55" stopColor="#2f6bff" />
            <stop offset="1" stopColor="#1d4ed8" />
          </linearGradient>
          <pattern id={`ed-${gid}`} width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="2.5" cy="2.5" r="1.4" fill="rgba(255,255,255,0.55)" />
          </pattern>
        </defs>
        {render({ x: 4, y: m.ascent + 4, fill: "#0a0a14" })}
        {render({
          fill: `url(#eg-${gid})`,
          stroke: "#0a0a14",
          strokeWidth: 1,
          paintOrder: "stroke",
        })}
        {render({ fill: `url(#ed-${gid})` })}
      </svg>
    </span>
  );
}

function Tile({ icon, eyebrow, value, meta, onClick, action }) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className="tb-cursor glass-70 flex h-full min-h-38 flex-col justify-between rounded-base border-2 border-border p-5 shadow-shadow outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring data-[clickable]:cursor-pointer hover:-translate-x-0.5 hover:-translate-y-0.5"
      data-clickable={onClick ? "" : undefined}
    >
      <div>
        <span className="mb-3 grid size-12 place-items-center rounded-base border-2 border-border bg-main text-main-foreground">
          {icon}
        </span>
        <div className="kicker text-muted-foreground">{eyebrow}</div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="kicker mt-0.5 text-muted-foreground">{meta}</div>
      </div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

const VIEW_KEYS = ["sessions", "crews", "circle", "all"];

/* Ownable SVG tiles in theme blues (no stock photos, no hotlinked images).
   Composed landscape (800x360) for the panel frames so nothing crops. */
const svgTile = (inner, from, to) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="360" fill="url(#g)"/><circle cx="80" cy="60" r="130" fill="#ffffff" opacity="0.12"/><circle cx="740" cy="320" r="110" fill="#000000" opacity="0.12"/>${inner}</svg>`
  )}`;

const GALLERY_ITEMS = [
  {
    label: "Sessions",
    image: svgTile(
      `<ellipse cx="400" cy="296" rx="134" ry="13" fill="#000000" opacity="0.22"/><rect x="298" y="90" width="204" height="188" rx="20" fill="#ffffff"/><path d="M298 110a20 20 0 0 1 20-20h164a20 20 0 0 1 20 20v40H298z" fill="#1D4ED8"/><line x1="350" y1="64" x2="350" y2="112" stroke="#0a0a14" stroke-width="14" stroke-linecap="round"/><line x1="450" y1="64" x2="450" y2="112" stroke="#0a0a14" stroke-width="14" stroke-linecap="round"/><circle cx="338" cy="130" r="9" fill="#ffffff"/><circle cx="366" cy="130" r="9" fill="#ffffff" opacity="0.75"/><circle cx="394" cy="130" r="9" fill="#ffffff" opacity="0.5"/><circle cx="340" cy="186" r="7" fill="#16337a" opacity="0.55"/><circle cx="380" cy="186" r="7" fill="#16337a" opacity="0.55"/><circle cx="420" cy="186" r="7" fill="#16337a" opacity="0.55"/><circle cx="460" cy="186" r="7" fill="#16337a" opacity="0.55"/><circle cx="340" cy="222" r="7" fill="#16337a" opacity="0.55"/><circle cx="380" cy="222" r="7" fill="#16337a" opacity="0.55"/><circle cx="460" cy="222" r="7" fill="#16337a" opacity="0.55"/><circle cx="420" cy="222" r="17" fill="none" stroke="#2f6bff" stroke-width="8"/><circle cx="340" cy="256" r="7" fill="#16337a" opacity="0.55"/><circle cx="380" cy="256" r="7" fill="#16337a" opacity="0.55"/><circle cx="420" cy="256" r="7" fill="#16337a" opacity="0.55"/>`,
      "#5294FF",
      "#2b62d9"
    ),
  },
  {
    label: "Crews",
    image: svgTile(
      `<ellipse cx="400" cy="302" rx="152" ry="12" fill="#000000" opacity="0.22"/><circle cx="326" cy="172" r="34" fill="#ffffff" opacity="0.72"/><path d="M264 302c0-50 28-76 62-76s62 26 62 76z" fill="#ffffff" opacity="0.72"/><circle cx="474" cy="172" r="34" fill="#ffffff" opacity="0.72"/><path d="M412 302c0-50 28-76 62-76s62 26 62 76z" fill="#ffffff" opacity="0.72"/><circle cx="400" cy="150" r="45" fill="#ffffff"/><path d="M309 302c0-55 41-84 91-84s91 29 91 84z" fill="#ffffff"/><circle cx="400" cy="150" r="45" fill="none" stroke="#0a0a14" stroke-width="6" opacity="0.18"/>`,
      "#2b62d9",
      "#1D4ED8"
    ),
  },
  {
    label: "Find Your Circle",
    image: svgTile(
      `<path d="M400 180L400 62a118 118 0 0 1 83 35z" fill="#ffffff" opacity="0.16"/><circle cx="400" cy="180" r="120" fill="none" stroke="#ffffff" stroke-width="6" stroke-dasharray="4 14" opacity="0.85"/><circle cx="400" cy="180" r="78" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.5"/><line x1="400" y1="180" x2="315" y2="95" stroke="#ffffff" stroke-width="6" opacity="0.7"/><line x1="400" y1="180" x2="485" y2="95" stroke="#ffffff" stroke-width="6" opacity="0.7"/><line x1="400" y1="180" x2="315" y2="265" stroke="#ffffff" stroke-width="6" opacity="0.7"/><line x1="400" y1="180" x2="485" y2="265" stroke="#ffffff" stroke-width="6" opacity="0.7"/><circle cx="315" cy="95" r="16" fill="#ffffff"/><circle cx="485" cy="95" r="16" fill="#ffffff"/><circle cx="315" cy="265" r="16" fill="#ffffff"/><circle cx="485" cy="265" r="16" fill="#ffffff"/><circle cx="315" cy="95" r="6" fill="#0a0a14"/><circle cx="485" cy="95" r="6" fill="#0a0a14"/><circle cx="315" cy="265" r="6" fill="#0a0a14"/><circle cx="485" cy="265" r="6" fill="#0a0a14"/><circle cx="400" cy="180" r="36" fill="#ffffff"/><circle cx="400" cy="180" r="15" fill="#0a0a14"/>`,
      "#3b82f6",
      "#1e3a8a"
    ),
  },
  {
    label: "Overview",
    image: svgTile(
      `<rect x="288" y="98" width="102" height="102" rx="20" fill="#ffffff"/><rect x="410" y="98" width="102" height="102" rx="20" fill="none" stroke="#ffffff" stroke-width="12"/><rect x="288" y="222" width="102" height="102" rx="20" fill="none" stroke="#ffffff" stroke-width="12"/><rect x="410" y="222" width="102" height="102" rx="20" fill="#ffffff"/><rect x="310" y="148" width="13" height="32" rx="6" fill="#1D4ED8"/><rect x="330" y="132" width="13" height="48" rx="6" fill="#1D4ED8"/><rect x="350" y="142" width="13" height="38" rx="6" fill="#1D4ED8"/><circle cx="461" cy="271" r="22" fill="#1D4ED8"/><path d="M452 271l7 7 13-14" stroke="#ffffff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="461" cy="149" r="17" fill="#ffffff" opacity="0.9"/><circle cx="461" cy="149" r="7" fill="#1D4ED8"/>`,
      "#3b82f6",
      "#1e40af"
    ),
  },
];

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [feed, setFeed] = useState([]);
  const [pending, setPending] = useState([]);
  const [unread, setUnread] = useState(0);
  const [view, setView] = useState("sessions");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [buddyOpen, setBuddyOpen] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [formGid, setFormGid] = useState(null);
  const [cursorOn, setCursorOn] = useState(true);
  const [galleryKey, setGalleryKey] = useState(0);
  const galleryRef = useRef(null);

  /* Tiles change the view from outside the gallery: bump its key so it
     remounts snapped to the right panel. Gallery interactions set the view
     directly (no remount) so the expand animation plays. */
  const goView = (key) => {
    setView(key);
    setGalleryKey((k) => k + 1);
  };

  const pickView = (e) => {
    const root = galleryRef.current;
    const panel = e.target?.closest?.(".ag-panel");
    if (!root || !panel || !root.contains(panel)) return;
    const idx = [...root.querySelectorAll(".ag-panel")].indexOf(panel);
    if (idx >= 0 && VIEW_KEYS[idx]) setView(VIEW_KEYS[idx]);
  };

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const subline = "Vouched members, fair tabs.";
  const vs = user?.verification_status;
  const isVerified = vs === "approved";
  const isPending = vs === "pending" || vs === "under_review";
  const isRejected = vs === "rejected";

  useEffect(() => {
    const t = setTimeout(() => setCursorOn(false), 500 + subline.length * 34 + 600);
    return () => clearTimeout(t);
  }, [subline.length ]);

  useEffect(() => {
    let alive = true;
    Promise.all([api("/api/groups"), api("/api/sessions/feed").catch(() => [])]).then(
      ([gs, fd]) => {
        if (!alive) return;
        setGroups(gs);
        setFeed(fd);
      }
    );
    api("/api/conversations/unread-count")
      .then((r) => alive && setUnread(r.unread))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out = [];
      for (const g of groups) {
        try {
          const gd = await api(`/api/groups/${g.id}`);
          gd.pending.forEach((p) =>
            out.push({ ...p, group: g, group_id: g.id, vouches_required: gd.group.vouches_required })
          );
        } catch {
          /* skip groups that fail */
        }
      }
      if (alive) setPending(out);
    })();
    return () => {
      alive = false;
    };
  }, [groups]);

  /* Tonight logic for the hero status line and right-hand card: sessions
     happening today that are still live, and the one you're going to. */
  const isToday = (dt) => {
    const d = new Date(String(dt ?? "").replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return false;
    const n = new Date();
    return (
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate()
    );
  };
  const tonightOpen = feed.filter(
    (s) => ["open", "planning"].includes(s.status) && isToday(s.starts_at)
  );
  const myTonight = tonightOpen.find((s) => s.my_rsvp === "going") ?? null;

  const visible = useMemo(() => {
    const q = query.toLowerCase().trim();
    let items = feed;
    if (tab === "active") items = items.filter((s) => ["open", "planning", "wrapped"].includes(s.status));
    else if (tab === "going") items = items.filter((s) => s.my_rsvp === "going");
    if (q) {
      items = items.filter(
        (s) =>
          s.spot_name?.toLowerCase().includes(q) ||
          s.group_name?.toLowerCase().includes(q) ||
          s.spot_notes?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [feed, tab, query]);

  const openPlan = () => {
    if (groups.length === 0) {
      toast.error("Create a crew first before scheduling a hangout.");
      setCrewOpen(true);
      return;
    }
    if (groups.length === 1) {
      setFormGid(groups[0].id);
      return;
    }
    setPickOpen(true);
  };

  /* Freeze-and-rise: normal scroll runs to the gallery, then the page locks
     staged there while further scroll input drives the card rising up from
     below (60vh scrubbed over ~1400px of input). At full rise the page
     unlocks and normal scrolling resumes; scrolling back up reverses and
     re-arms. Lenis is stopped/started rather than fought; keyboard, touch,
     and dialogs are all handled; reduced motion skips the machine entirely
     and the card stays static. Inline paint only, layout never changes, so
     no blank space can ever open. */
  const [motionFull, setMotionFull] = useState(true);
  useEffect(() => {
    setMotionFull(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, []);
  const searchInner = (
    <>
      <p className="kicker mb-2 text-muted-foreground">Live feed</p>
      <div className="mb-3 flex items-center justify-between">
        <ScrollReveal baseRotation={0} blurStrength={3} textClassName="font-bold">
          Sessions
        </ScrollReveal>
        <Badge variant="secondary">{feed.length} listed</Badge>
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions by spot, crew, or vibe…"
          className="pl-10"
          aria-label="Search sessions"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          ["all", `All (${feed.length})`],
          ["active", "Active tonight"],
          ["going", "You're going"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`tb-cursor min-h-9 rounded-full border-2 px-3.5 text-[13px] font-semibold whitespace-nowrap ${
              tab === k
                ? "border-border bg-main text-main-foreground shadow-shadow"
                : "border-border bg-secondary-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );

  const feedInner = (
    <>
      {visible.length === 0 ? (
        <EmptyState
          icon={<Search className="size-6" aria-hidden="true" />}
          title="No matching sessions"
          body="Try a different search, or plan one in your crew."
        />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => navigate(`/sessions/${s.id}`)}
                className="tb-cursor flex w-full items-center gap-3 rounded-base border-2 border-border bg-background p-3.5 text-left shadow-shadow transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
              >
                <span className="size-10 shrink-0 overflow-hidden rounded-base border-2 border-border">
                  <SpotArt seed={`session-${s.id}`} size={36} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.spot_name || "Tambayan TBD"}</span>
                  <span className="kicker block truncate text-muted-foreground">
                    {s.group_name} · {fmtSessionTime(s.starts_at)}
                    {(s.going_count ?? 0) > 0 ? ` · ${s.going_count} going` : ""}
                    {s.my_rsvp === "going" ? " · you're going" : ""}
                  </span>
                </span>
                <StatusBadge status={s.status} label={s.status === "open" ? "Tab open" : s.status === "wrapped" ? "Uwian time" : s.status === "planning" ? "Planning" : "Closed"} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const crewsHeadInner = (
    <>
      <p className="kicker mb-2 text-muted-foreground">Your crews</p>
      <div className="flex items-center justify-between">
        <ScrollReveal baseRotation={0} blurStrength={3} textClassName="font-bold">
          {`My crews (${groups.length})`}
        </ScrollReveal>
        <Button size="sm" variant="neutral" onClick={() => setCrewOpen(true)}>
          <Plus aria-hidden="true" /> New crew
        </Button>
      </div>
    </>
  );

  const crewsGridInner = (
    <>
      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" aria-hidden="true" />}
          title="No crews yet"
          body="Create your first crew above, or ask a friend to share an invite link."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => navigate(`/groups/${g.id}`)}
                className="tb-cursor flex h-full w-full flex-col gap-3 rounded-base border-2 border-border bg-background p-4.5 text-left shadow-shadow transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
              >
                <span className="flex items-center gap-3">
                  <Avatar name={g.name} size={42} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{g.name}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {g.role === "admin" ? "You're an admin" : "Member"}
                    </span>
                  </span>
                </span>
                <span className="flex items-center justify-between border-t-2 border-border pt-3 text-[13px] text-muted-foreground">
                  {g.role}
                  <span className="font-bold text-foreground">Open</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const escortInner = (
    <>
      <p className="kicker mb-2 text-muted-foreground">Buddy system</p>
      <h2 className="mb-2 font-bold">How buddy escort works</h2>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li><strong className="text-foreground">Direction pairing.</strong> Members heading the same way leave in pairs or trios.</li>
        <li><strong className="text-foreground">Check-in deadline.</strong> Miss your arrival estimate and your buddy gets nudged.</li>
        <li><strong className="text-foreground">Admin escalation.</strong> If both go quiet, organizers and admins are alerted.</li>
      </ol>
      <Button size="sm" variant="neutral" className="mt-3" onClick={() => setBuddyOpen(true)}>
        Open buddy radar
      </Button>
    </>
  );

  const circleInner = <FindFriendsStack key="ffc" onFriendAdded={() => {}} />;

  const inners =
    view === "sessions"
      ? [searchInner, feedInner]
      : view === "crews"
        ? [crewsHeadInner, crewsGridInner]
        : view === "circle"
          ? [circleInner]
          : [searchInner, feedInner, crewsHeadInner, crewsGridInner, circleInner,
             <SafetyGuarantee key="sg" onHowItWorks={() => setVerifyOpen(true)} />, escortInner];

  return (
    <div>
      {/* Verification Status Banner */}
      {!isVerified && (
        <div className="mb-4 overflow-hidden rounded-base border-2 border-border bg-secondary-background shadow-shadow transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`grid size-10 shrink-0 place-items-center rounded-base border-2 border-border ${
                  isPending
                    ? "bg-amber-400/20 text-amber-500"
                    : isRejected
                    ? "bg-destructive/20 text-destructive"
                    : "bg-main text-main-foreground"
                }`}
              >
                {isPending ? (
                  <Clock className="size-5" aria-hidden="true" />
                ) : isRejected ? (
                  <AlertTriangle className="size-5" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="size-5" aria-hidden="true" />
                )}
              </div>
              <div>
                <p className="font-bold text-foreground">
                  {isPending
                    ? "ID Verification Pending Review"
                    : isRejected
                    ? "ID Verification Needs Attention"
                    : "Your Account is Not Verified"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                  {isPending
                    ? "Your ID document has been submitted and is in the Ops review queue. We verify credentials within 24 hours."
                    : isRejected
                    ? "Your previous ID submission was not approved. Please inspect the reviewer note and resubmit your document."
                    : "Upload a valid School or Government ID to unlock verified spots on the live radar, join safety-gated crews, and get your Verified badge."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <Button
                size="sm"
                onClick={() => setVerifyOpen(true)}
                className="gap-1.5"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                {isPending ? "View Status" : isRejected ? "Re-submit ID →" : "Verify now →"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="glass-70 rounded-base border-2 border-border p-6 shadow-shadow sm:p-8 lg:grid lg:grid-cols-[1fr_300px] lg:gap-8">
        <div className="min-w-0">
        <p className="script-accent mt-1 text-[26px] leading-tight text-foreground">
          {greetingByHour()}, {firstName}
        </p>
        <h1 className="mt-1 text-5xl font-bold tracking-tight sm:text-7xl">
          <span className="block">
            Go out <ElevateWord word="together." />
          </span>
          <span className="block">
            Get home <ElevateWord word="safe." />
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-base font-medium text-foreground">
          <span className="sr-only">{subline}</span>
          <span aria-hidden="true">
            <TextType
              text={[subline]}
              as="span"
              loop={false}
              showCursor={cursorOn}
              typingSpeed={34}
              initialDelay={500}
            />
          </span>
        </p>
        {myTonight ? (
          <p className="mt-4 flex items-center gap-2 text-[15px] font-bold">
            <span className="relative flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-4 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-chart-4" />
            </span>
            Tonight: {myTonight.spot_name}, {fmtTimeShort(myTonight.starts_at)}
            {myTonight.going_count > 0 ? ` · ${myTonight.going_count} going` : ""}
          </p>
        ) : tonightOpen.length > 0 ? (
          <p className="mt-4 flex items-center gap-2 text-[15px] font-bold">
            <span className="relative flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-3 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-chart-3" />
            </span>
            {tonightOpen.length === 1
              ? "1 session open tonight"
              : `${tonightOpen.length} sessions open tonight`}
          </p>
        ) : (
          <button
            type="button"
            onClick={openPlan}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background px-4 py-2 text-sm font-bold"
          >
            Nothing open tonight. <span className="underline">Be the first to plan one →</span>
          </button>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <ClickSpark sparkColor="#000000" sparkCount={10} sparkSize={10} sparkRadius={24}>
            <Button onClick={openPlan} className="w-full">
              <Plus aria-hidden="true" /> Plan a session
            </Button>
          </ClickSpark>
          <Button variant="neutral" className="w-full" onClick={() => goView("sessions")}>
            Browse sessions
          </Button>
        </div>
        </div>
        <div className="mt-6 lg:mt-0 lg:self-center">
          <div className="overflow-hidden rounded-base border-2 border-border bg-secondary-background shadow-shadow">
            <div className="flex items-center gap-3 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-base border-2 border-border bg-main text-main-foreground">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-bold">Buddy escort</p>
                <p className="text-[13px] text-muted-foreground">Pair up by direction. Nobody commutes alone.</p>
              </div>
            </div>
            <div className="border-t-2 border-border p-3">
              <Button
                variant="neutral"
                className="w-full"
                disabled={!myTonight}
                onClick={() => setBuddyOpen(true)}
              >
                Start buddy escort
              </Button>
              {!myTonight ? (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Join a session tonight to start an escort.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>


      {/* Vouch queue */}
      {pending.length > 0 ? (
        <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Vouch queue</h2>
            <Badge variant="secondary">{pending.length} pending</Badge>
          </div>
          <ul className="space-y-2.5">
            {pending.slice(0, 3).map((p) => (
              <li key={`${p.group_id}-${p.user_id}`} className="flex items-center gap-3 rounded-base border-2 border-border bg-secondary-background p-2.5">
                <Avatar name={p.name} art={p.avatar_id} custom={p.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.group.name} · {p.vouches}/{p.vouches_required} vouches
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const r = await api(`/api/groups/${p.group_id}/vouch/${p.user_id}`, {});
                      toast.success(r.accepted ? "They are in. Welcome to the crew." : `Vouched (${r.have} of ${r.need}).`);
                      setPending((cur) => cur.filter((x) => !(x.group_id === p.group_id && x.user_id === p.user_id)));
                    } catch (e) {
                      toast.error(e.message);
                    }
                  }}
                >
                  Vouch in
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* View navigator: accordion gallery. Hover, tap, Tab-focus, or arrow
          keys all select a view; the sections below follow the selection. */}
      <div className="mt-4 rounded-base border-2 border-border bg-secondary-background p-2 shadow-shadow">
        <div
          ref={galleryRef}
          onClickCapture={pickView}
          onFocusCapture={pickView}
          onMouseOver={pickView}
        >
          <AccordionGallery
            key={galleryKey}
            items={GALLERY_ITEMS}
            defaultIndex={Math.max(0, VIEW_KEYS.indexOf(view))}
            height={170}
            radius={5}
            expandRatio={0.55}
            tilt={4}
            duration={0.5}
            accentColor="#5294FF"
          />
        </div>
      </div>

      {/* One container per view. Sections cascade in as they enter. */}
      <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        {inners.map((inner, i) => (
          <Reveal
            key={`${view}-${i}`}
            delay={i * 90}
            className={i === 0 ? "" : "mt-6 border-t-2 border-border pt-6"}
          >
            {inner}
          </Reveal>
        ))}
      </div>
        <footer className="mt-4 rounded-base border-2 border-border bg-secondary-background p-5 shadow-shadow">
          <div>
            <img src="/uwian-logo.svg" alt="uwian." className="h-6 w-auto" draggable={false} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Find your crew, join a session, get home safe.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="neutral" onClick={() => goView("sessions")}>Sessions</Button>
            <Button size="sm" variant="neutral" onClick={() => navigate("/map")}>Live map</Button>
            <Button size="sm" variant="neutral" onClick={() => navigate("/messages")}>Messages</Button>
            <Button size="sm" variant="neutral" onClick={() => setVerifyOpen(true)}>Safety</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Check in when you get home. <span className="opacity-60 kicker">[build U · motion:{motionFull ? "full" : "reduced"}]</span></p>
        </footer>

      <VerificationDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
      <BuddyDialog open={buddyOpen} onOpenChange={setBuddyOpen} />
      <NewCrewDialog open={crewOpen} onOpenChange={setCrewOpen} onCreated={(id) => navigate(`/groups/${id}`)} />
      <PickCrewDialog open={pickOpen} onOpenChange={setPickOpen} onPick={(g) => setFormGid(g.id)} />
      <SessionFormDialog open={formGid != null} onOpenChange={(v) => !v && setFormGid(null)} gid={formGid} onCreated={(sid) => navigate(`/sessions/${sid}`)} />
    </div>
  );
}
