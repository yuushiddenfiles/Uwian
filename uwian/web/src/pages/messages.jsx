import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  ExternalLink,
  Mail,
  MapPin,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { api, timeAgo } from "@/lib/api";
import { getPositionOnce, gpsErrorMessage } from "@/lib/geo";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Avatar } from "@/components/chrome";
import { NewMessageDialog, VerificationDialog } from "@/components/sheets";

/* ─── Ultra-modern Static Map Bubble with Deep Links ─── */
function LocationBubble({ lat, lng, senderName, mine, sessionId }) {
  const zoom = 15;
  const tileUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=320x160&markers=${lat},${lng},red-pushpin`;
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=${zoom}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 450, damping: 28 }}
      className={`group flex w-full max-w-[300px] flex-col overflow-hidden rounded-2xl border-2 border-border shadow-shadow transition-transform hover:-translate-y-0.5 ${
        mine ? "ml-auto" : ""
      }`}
    >
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-36 w-full overflow-hidden bg-secondary-background"
        aria-label={`${senderName}'s location — open in map`}
      >
        <img
          src={tileUrl}
          alt="Shared location map"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
          <MapPin className="size-3 text-red-400" aria-hidden="true" />
          <span>
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        </div>
      </a>

      <div
        className={`flex flex-col gap-2 p-3 text-xs ${
          mine
            ? "border-t-2 border-border bg-main text-main-foreground"
            : "border-t-2 border-border bg-secondary-background text-foreground"
        }`}
      >
        <div className="flex items-center justify-between font-bold">
          <span className="truncate">📍 {senderName}'s location</span>
          <span className="font-mono text-[10px] opacity-75">GPS LOCK</span>
        </div>

        <div className="flex items-center gap-2 border-t border-black/10 pt-1.5 dark:border-white/10">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-bold underline underline-offset-2 transition-opacity hover:opacity-80"
          >
            <span>Open Maps</span>
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>

          {sessionId ? (
            <Link
              to={`/sessions/${sessionId}?tab=map`}
              className="ml-auto flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-950 transition-colors hover:bg-emerald-500/30 dark:text-emerald-200"
            >
              <Radio className="size-3 animate-pulse text-emerald-500" aria-hidden="true" />
              <span>Crew Radar →</span>
            </Link>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export function Messages() {
  const { cid } = useParams();
  const activeCid = cid ? Number(cid) : null;
  const { user } = useAuth();
  const navigate = useNavigate();

  const isVerified = user?.verification_status === "approved";

  const [convs, setConvs] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all"); // 'all' | 'groups' | 'dms'

  // In-chat GPS tracking state
  const [gpsOpen, setGpsOpen] = useState(false);
  const [acquiringGps, setAcquiringGps] = useState(false);
  const [currentGps, setCurrentGps] = useState(null);
  const [sendingLocation, setSendingLocation] = useState(false);
  const [isLiveBroadcasting, setIsLiveBroadcasting] = useState(false);

  // Scroll to bottom button
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const wrapRef = useRef(null);
  const pollRef = useRef(null);
  const watchIdRef = useRef(null);

  const loadConvs = useCallback(async () => {
    try {
      setConvs(await api("/api/conversations"));
    } catch {
      setConvs([]);
    }
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    if (wrapRef.current) {
      wrapRef.current.scrollTo({
        top: wrapRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
    }
  }, []);

  const loadMsgs = useCallback(
    async (id, stick = true) => {
      const box = wrapRef.current;
      const atBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      try {
        const m = await api(`/api/conversations/${id}/messages`);
        setMsgs(m);
        if (stick || atBottom) {
          requestAnimationFrame(() => scrollToBottom(false));
        }
      } catch {
        setMsgs([]);
      }
      loadConvs();
    },
    [loadConvs, scrollToBottom]
  );

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!activeCid) {
      setMsgs([]);
      return;
    }
    setDraft("");
    setGpsOpen(false);
    loadMsgs(activeCid, true);
    pollRef.current = setInterval(() => loadMsgs(activeCid, false), 4000);
    return () => clearInterval(pollRef.current);
  }, [activeCid, loadMsgs]);

  const active = convs.find((c) => c.id === activeCid);
  const sessionId = active?.session_id ?? null;

  // Handle scroll detection for "Scroll to Bottom" button
  const handleScroll = () => {
    const box = wrapRef.current;
    if (!box) return;
    const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    setShowScrollBottom(!isNearBottom);
  };

  // Clean up watch position on unmount or active conversation switch
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch?.(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeCid]);

  const send = async () => {
    const txt = draft.trim();
    if (!txt || !activeCid) return;
    setDraft("");
    try {
      await api(`/api/conversations/${activeCid}/messages`, { content: txt });
      loadMsgs(activeCid, true);
    } catch (e) {
      toast.error(e.message);
      setDraft(txt);
    }
  };

  /* ─── Acquire & Track Location in Chat ─── */
  const startGpsTracker = () => {
    if (!isVerified) {
      toast.error("ID verification required to share or track your GPS.");
      setVerifyOpen(true);
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Your browser does not support geolocation.");
      return;
    }

    setGpsOpen(true);
    setAcquiringGps(true);

    // 20s first window with one longer retry: a cold lock routinely misses
    // 4s, and the old code then pinned the user to a hardcoded fallback.
    getPositionOnce({ timeout: 20000, maximumAge: 10000 }).then(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setCurrentGps({ lat, lng, accuracy: accuracy || 15, time: new Date() });
        setAcquiringGps(false);
      },
      (err) => {
        setAcquiringGps(false);
        toast.error(err?.code ? gpsErrorMessage(err.code) : (err?.message ?? "Could not get your location."));
      }
    );
  };

  /* ─── Send Captured Location Pin to Chat ─── */
  const sendLocationPin = async () => {
    if (!activeCid || !currentGps) return;
    setSendingLocation(true);
    try {
      await api(`/api/conversations/${activeCid}/messages`, {
        kind: "location",
        lat: currentGps.lat,
        lng: currentGps.lng,
        accuracy: currentGps.accuracy,
      });
      loadMsgs(activeCid, true);
      toast.success("Location pin sent to chat!");
      setGpsOpen(false);
    } catch (e) {
      toast.error(e?.message ?? "Failed to send location pin.");
    } finally {
      setSendingLocation(false);
    }
  };

  /* ─── Toggle Continuous Live GPS Sharing for Session ─── */
  const toggleLiveBroadcast = async () => {
    if (!sessionId) {
      toast.info("Live GPS broadcast is only available in session chats.");
      return;
    }
    if (!isVerified) {
      toast.error("ID verification required.");
      setVerifyOpen(true);
      return;
    }

    if (isLiveBroadcasting) {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch?.(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsLiveBroadcasting(false);
      try {
        await api(`/api/sessions/${sessionId}/location`, { method: "DELETE" });
      } catch {
        // ignore
      }
      toast.info("Stopped broadcasting live GPS.");
      return;
    }

    setIsLiveBroadcasting(true);
    toast.loading("Starting live GPS broadcast...", { id: "live-gps" });

    const sendBroadcast = async (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      setCurrentGps({ lat, lng, accuracy, time: new Date() });
      toast.dismiss("live-gps");
      try {
        await api(`/api/sessions/${sessionId}/location`, {
          method: "PUT",
          lat,
          lng,
          accuracy,
        });
      } catch {
        // periodic
      }
    };

    const handleBroadcastError = () => {
      toast.dismiss("live-gps");
      setIsLiveBroadcasting(false);
      toast.error("GPS connection lost. Broadcasting paused.");
    };

    navigator.geolocation.getCurrentPosition(sendBroadcast, handleBroadcastError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(sendBroadcast, handleBroadcastError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });
      toast.success("Live GPS broadcast active! You are visible on the crew map.");
    } catch {
      // fallback
    }
  };

  // Filtered conversation list
  const filteredConvs = useMemo(() => {
    return convs.filter((c) => {
      if (filterType === "groups" && c.type !== "group") return false;
      if (filterType === "dms" && c.type !== "dm") return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.display_name?.toLowerCase().includes(q) ||
        c.last_message?.toLowerCase().includes(q)
      );
    });
  }, [convs, filterType, searchQuery]);

  let lastDate = null;

  return (
    <div className="relative mx-auto h-[calc(100dvh-13rem)] max-h-[880px] w-full grid grid-cols-1 gap-3.5 overflow-hidden md:h-[calc(100dvh-10rem)] lg:grid-cols-[340px_1fr]">
      {/* ─────────────────────────────────────────────────────────────
          SIDEBAR: Conversation List (Fixed viewport height with inner scroll)
      ────────────────────────────────────────────────────────────── */}
      <div
        className={`glass-70 flex h-full flex-col overflow-hidden rounded-2xl border-2 border-border shadow-shadow transition-all ${
          activeCid ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* Sidebar Header */}
        <div className="shrink-0 space-y-2.5 border-b-2 border-border bg-secondary-background/80 p-3.5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="size-4.5 text-main" aria-hidden="true" />
              <h2 className="font-bold tracking-tight text-base">Messages</h2>
            </div>
            <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1.5 h-8 px-3">
              <Plus className="size-3.5" aria-hidden="true" />
              <span>New</span>
            </Button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-xl border border-border bg-background/80 py-1.5 pl-8 pr-3 text-xs outline-none transition focus:border-main focus:ring-1 focus:ring-main"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          {/* Type Filter Pills */}
          <div className="flex gap-1.5">
            {[
              ["all", "All"],
              ["groups", "Crews"],
              ["dms", "Direct"],
            ].map(([t, label]) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  filterType === t
                    ? "border border-border bg-main text-main-foreground shadow-xs"
                    : "border border-transparent bg-background/50 text-muted-foreground hover:bg-background"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation Items List (Strictly scrollable — Lenis must not
            steal the wheel here, or the page scrolls instead of the list) */}
        <div data-lenis-prevent className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {filteredConvs.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center p-4 text-center text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">No conversations found</p>
              <p className="mt-1">
                {searchQuery ? "Try a different search." : "Start a chat with a crew member."}
              </p>
            </div>
          ) : (
            filteredConvs.map((c) => {
              const isSelected = c.id === activeCid;
              const hasUnread = c.unread_count > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/messages/${c.id}`)}
                  className={`group relative flex w-full items-center gap-3 rounded-xl border-2 p-2.5 text-left transition-all ${
                    isSelected
                      ? "border-border bg-secondary-background shadow-shadow scale-[0.99]"
                      : "border-transparent hover:border-border/60 hover:bg-secondary-background/60"
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar
                      name={c.display_name}
                      size={40}
                      art={c.type === "dm" ? c.other_user?.avatar_id : null}
                      custom={c.type === "dm" ? c.other_user?.avatar_url : null}
                    />
                    {c.type === "group" ? (
                      <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border border-background bg-main text-[9px] font-bold text-main-foreground">
                        <Users className="size-2.5" />
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={`truncate text-xs ${
                          hasUnread ? "font-bold text-foreground" : "font-semibold"
                        }`}
                      >
                        {c.display_name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {c.last_message_at ? timeAgo(c.last_message_at) : ""}
                      </span>
                    </div>

                    <p
                      className={`truncate text-[11px] leading-tight ${
                        hasUnread
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {c.last_message
                        ? `${c.type === "group" && c.last_sender_name ? `${c.last_sender_name.split(" ")[0]}: ` : ""}${c.last_message}`
                        : "No messages yet"}
                    </p>
                  </div>

                  {hasUnread ? (
                    <Badge variant="default" className="shrink-0 h-5 px-1.5 text-[10px]">
                      {c.unread_count}
                    </Badge>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          ACTIVE CHAT PANEL: Fixed viewport height with pinned input
      ────────────────────────────────────────────────────────────── */}
      <div
        className={`glass-70 flex h-full flex-col overflow-hidden rounded-2xl border-2 border-border shadow-shadow transition-all ${
          !activeCid ? "hidden lg:flex" : "flex"
        }`}
      >
        {!activeCid || !active ? (
          <div className="flex h-full flex-col items-center justify-center p-10 text-center">
            <div className="mb-4 grid size-16 place-items-center rounded-full border-2 border-border bg-secondary-background shadow-shadow">
              <Mail className="size-7 text-main" aria-hidden="true" />
            </div>
            <h3 className="font-bold text-base">Select a conversation</h3>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Pick a chat on the left or tap <strong>+ New</strong> to start talking with your crew.
            </p>
          </div>
        ) : (
          <>
            {/* ── Fixed Chat Header ── */}
            <div className="shrink-0 flex items-center justify-between gap-3 border-b-2 border-border bg-secondary-background/80 px-4 py-3 backdrop-blur-md z-10">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Mobile Back Button */}
                <button
                  onClick={() => navigate("/messages")}
                  className="lg:hidden -ml-1 p-1 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground transition"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="size-4" />
                </button>

                {active.type === "dm" ? (
                  <Avatar
                    name={active.display_name}
                    size={36}
                    art={active.other_user?.avatar_id}
                    custom={active.other_user?.avatar_url}
                  />
                ) : (
                  <span className="flex shrink-0 -space-x-2" aria-hidden="true">
                    {(active.members ?? []).slice(0, 3).map((m) => (
                      <Avatar
                        key={m.user_id}
                        name={m.name}
                        size={30}
                        art={m.avatar_id}
                        custom={m.avatar_url}
                      />
                    ))}
                  </span>
                )}

                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold leading-tight">
                    {active.display_name}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {active.type === "dm"
                        ? "Direct message"
                        : `${active.members?.length ?? 0} crew members`}
                    </span>
                    {isLiveBroadcasting ? (
                      <span className="flex items-center gap-1 font-bold text-emerald-500">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                        Live GPS active
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Header Action Shortcuts */}
              <div className="flex items-center gap-2 shrink-0">
                {sessionId ? (
                  <Button
                    size="sm"
                    variant="neutral"
                    onClick={() => navigate(`/sessions/${sessionId}?tab=map`)}
                    className="gap-1.5 h-8 text-xs font-bold"
                    title="View live GPS map for this session"
                  >
                    <Radio className="size-3.5 text-emerald-500" aria-hidden="true" />
                    <span>Live Map</span>
                  </Button>
                ) : null}
              </div>
            </div>

            {/* ── Scrollable Messages Container (Strictly bounded height;
                Lenis must not steal the wheel here either) ── */}
            <div
              ref={wrapRef}
              onScroll={handleScroll}
              data-lenis-prevent
              className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 space-y-2.5 scroll-smooth"
            >
              {msgs.length === 0 ? (
                <EmptyState
                  icon={<Mail className="size-6 text-muted-foreground" aria-hidden="true" />}
                  title="No messages yet"
                  body="Say hi to break the ice!"
                />
              ) : (
                msgs.map((m, idx) => {
                  const prevMsg = msgs[idx - 1];
                  const nextMsg = msgs[idx + 1];
                  const d = new Date(`${m.created_at}Z`);
                  const label = d.toLocaleDateString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });
                  const showDate = label !== lastDate;
                  lastDate = label;

                  const mine = m.sender_id === user?.id;
                  const isSameSenderAsPrev =
                    prevMsg &&
                    prevMsg.sender_id === m.sender_id &&
                    !showDate &&
                    new Date(`${m.created_at}Z`) - new Date(`${prevMsg.created_at}Z`) < 120000;
                  const isSameSenderAsNext =
                    nextMsg &&
                    nextMsg.sender_id === m.sender_id &&
                    new Date(`${nextMsg.created_at}Z`) - new Date(`${m.created_at}Z`) < 120000;

                  const isLocation = m.kind === "location";

                  return (
                    <div key={m.id} className={isSameSenderAsPrev ? "mt-0.5" : "mt-2.5"}>
                      {showDate ? (
                        <div className="my-3 flex items-center justify-center">
                          <span className="rounded-full border border-border/60 bg-background/80 px-3 py-0.5 text-[10px] font-bold text-muted-foreground shadow-xs backdrop-blur-sm">
                            {label}
                          </span>
                        </div>
                      ) : null}

                      <div
                        className={`flex max-w-[85%] items-end gap-2 ${
                          mine ? "ml-auto flex-row-reverse" : "flex-row"
                        }`}
                      >
                        {/* Member Avatar beside incoming messages */}
                        {!mine && (
                          <div className="size-7 shrink-0">
                            {!isSameSenderAsNext ? (
                              <Avatar
                                name={m.sender_name}
                                size={28}
                                art={m.sender_avatar}
                                custom={m.sender_avatar_url}
                              />
                            ) : null}
                          </div>
                        )}

                        <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                          {/* Sender Name (only on first message of cluster) */}
                          {!mine && !isSameSenderAsPrev ? (
                            <span className="mb-1 ml-1 text-[11px] font-bold text-muted-foreground">
                              {m.sender_name}
                            </span>
                          ) : null}

                          {isLocation && m.lat != null && m.lng != null ? (
                            <LocationBubble
                              lat={m.lat}
                              lng={m.lng}
                              senderName={m.sender_name ?? "Someone"}
                              mine={mine}
                              sessionId={sessionId}
                            />
                          ) : (
                            <div
                              className={`group relative max-w-prose px-3.5 py-2 text-xs leading-relaxed break-words transition-all ${
                                mine
                                  ? "rounded-2xl rounded-tr-xs bg-main text-main-foreground shadow-sm font-medium border border-black/10"
                                  : "rounded-2xl rounded-tl-xs border border-border/80 bg-secondary-background/90 text-foreground shadow-xs backdrop-blur-md"
                              }`}
                            >
                              <span>{m.content}</span>
                              <span
                                className={`ml-2 inline-block select-none text-[9px] ${
                                  mine ? "text-main-foreground/75" : "text-muted-foreground"
                                }`}
                              >
                                {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Floating Jump to Bottom Button */}
            <AnimatePresence>
              {showScrollBottom && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  onClick={() => scrollToBottom(true)}
                  className="absolute bottom-20 right-6 z-20 flex items-center gap-1.5 rounded-full border-2 border-border bg-background px-3 py-1.5 text-xs font-bold shadow-shadow hover:bg-secondary-background"
                >
                  <ArrowDown className="size-3.5" />
                  <span>Latest messages</span>
                </motion.button>
              )}
            </AnimatePresence>

            {/* ── Slide-up In-Chat GPS Tracker Drawer ── */}
            <AnimatePresence>
              {gpsOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 450, damping: 30 }}
                  className="shrink-0 overflow-hidden border-t-2 border-border bg-secondary-background/95 p-3.5 backdrop-blur-md"
                >
                  <div className="mb-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Navigation
                        className={`size-4 ${acquiringGps ? "animate-spin text-main" : "text-emerald-500"}`}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-bold">
                        {acquiringGps ? "Acquiring GPS Signal..." : "GPS Location Locked"}
                      </span>
                    </div>
                    <button
                      onClick={() => setGpsOpen(false)}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label="Close location tray"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {acquiringGps ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                      <RefreshCw className="size-3.5 animate-spin" />
                      <span>Locking coordinates from your GPS sensor...</span>
                    </div>
                  ) : currentGps ? (
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center justify-between rounded-xl border-2 border-border bg-background p-2.5 shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary-background">
                          <img
                            src={`https://staticmap.openstreetmap.de/staticmap.php?center=${currentGps.lat},${currentGps.lng}&zoom=15&size=100x100&markers=${currentGps.lat},${currentGps.lng},red-pushpin`}
                            alt="GPS Thumbnail"
                            className="size-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-mono text-xs font-bold">
                            {currentGps.lat.toFixed(5)}°, {currentGps.lng.toFixed(5)}°
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="secondary" className="font-mono text-[9px] px-1.5 py-0">
                              ±{Math.round(currentGps.accuracy)}m accuracy
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">Just now</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={sendLocationPin}
                          disabled={sendingLocation}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <Send className="size-3" aria-hidden="true" />
                          Send Pin to Chat
                        </Button>

                        {sessionId ? (
                          <Button
                            size="sm"
                            variant={isLiveBroadcasting ? "destructive" : "neutral"}
                            onClick={toggleLiveBroadcast}
                            className="h-8 gap-1.5 text-xs"
                          >
                            <Radio className="size-3" aria-hidden="true" />
                            {isLiveBroadcasting ? "Stop Live GPS" : "Broadcast Live GPS"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Fixed Compose Input Dock (Always pinned at bottom) ── */}
            <div className="shrink-0 border-t-2 border-border bg-secondary-background/80 p-3 backdrop-blur-md">
              <div className="flex items-end gap-2 rounded-2xl border-2 border-border bg-background/95 p-1.5 shadow-shadow focus-within:border-main focus-within:ring-2 focus-within:ring-main/20 transition-all">
                {/* GPS Trigger Button */}
                <Button
                  size="icon"
                  variant={gpsOpen || isLiveBroadcasting ? "default" : "neutral"}
                  onClick={() => {
                    if (gpsOpen) setGpsOpen(false);
                    else startGpsTracker();
                  }}
                  aria-label="Track & share GPS location"
                  title="Share or track live GPS"
                  className="size-9 shrink-0 rounded-xl"
                >
                  <Navigation
                    className={`size-4 ${isLiveBroadcasting ? "animate-pulse text-emerald-400" : ""}`}
                    aria-hidden="true"
                  />
                </Button>

                {/* Auto-expanding Input Area */}
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Type a message… (Press Enter to send)"
                  rows={1}
                  data-lenis-prevent
                  className="max-h-28 min-h-9 flex-1 resize-none border-0 bg-transparent p-2 text-xs shadow-none focus-visible:ring-0"
                  aria-label="Type a message"
                />

                {/* Send Button */}
                <Button
                  size="icon"
                  onClick={send}
                  disabled={!draft.trim()}
                  aria-label="Send message"
                  className="size-9 shrink-0 rounded-xl transition-transform active:scale-95 disabled:opacity-40"
                >
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <NewMessageDialog open={newOpen} onOpenChange={setNewOpen} />
      <VerificationDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
    </div>
  );
}
