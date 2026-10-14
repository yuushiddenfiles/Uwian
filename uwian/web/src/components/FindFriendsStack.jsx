import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  UserPlus,
  UserCheck,
  Users,
  ShieldCheck,
  Car,
  Check,
  X,
  Shuffle,
  Sparkles,
  MessageSquare,
  Hash,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { playChime, playPop, playWhoosh } from "@/lib/sound";
import { Avatar } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Stack from "@/components/reactbits/Stack/Stack";
import { useNavigate } from "react-router-dom";

/* ─── Strip emoji from vibe text before display ─── */
const stripEmoji = (str = "") =>
  str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "").trim();

/* ─── Discovery Card ─── */
function DiscoveryCard({ u, isRequested, isFriend, onAdd, onPass }) {
  const isVerified = u.verification_status === "approved";
  const isDriver = u.can_drink === 0;
  const vibe = stripEmoji(u.vibe || "");


  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-[20px] select-none"
      style={{ background: "#0a0a0a" }}
    >
      {/* ── TOP 60%: user's own picture, scaled up and heavily blurred ── */}
      <div className="relative overflow-hidden" style={{ height: "60%" }}>
        {u.avatar_url ? (
          <img
            src={u.avatar_url}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 z-0 h-full w-full object-cover"
            style={{ filter: "blur(32px) saturate(1.5)", transform: "scale(1.2)" }}
          />
        ) : (
          <div aria-hidden className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
            <div style={{ filter: "blur(28px) saturate(1.8)", transform: "scale(3.2)" }}>
              <Avatar name={u.name} art={u.avatar_id} size={110} />
            </div>
          </div>
        )}
        {/* Slight dark overlay so the avatar and the text below stay readable */}
        <div
          aria-hidden
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: "rgba(0,0,0,0.35)" }}
        />
        {/* Bottom edge fades smoothly into the dark info section */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: "45%",
            background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 100%)",
          }}
        />

        {/* Avatar — centered, sharp, on top of blur */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="relative">
            <div
              className="rounded-full p-[3px]"
              style={{
                background: isVerified
                  ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                  : "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.06) 100%)",
                boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <div className="rounded-full p-[2px] bg-black/20">
                <Avatar name={u.name} art={u.avatar_id} custom={u.avatar_url} size={110} />
              </div>
            </div>
            {isVerified && (
              <div
                title="ID Verified"
                className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-black/40 shadow-lg"
                style={{ background: "linear-gradient(135deg, #10b981, #047857)" }}
              >
                <ShieldCheck className="size-3.5 text-white" strokeWidth={2.5} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM: Info panel — shrink-0 so it never clips ── */}
      <div
        className="relative shrink-0 flex flex-col gap-2 px-4 pb-4 pt-3"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 100%)" }}
      >
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-300">
              <ShieldCheck className="size-2.5" strokeWidth={2.5} /> Verified
            </span>
          )}
          {isDriver && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-sky-300">
              <Car className="size-2.5" strokeWidth={2.5} /> Sober Driver
            </span>
          )}
          {u.mutual_crews > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/8 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white/60">
              <Zap className="size-2.5" strokeWidth={2.5} /> {u.mutual_crews} mutual
            </span>
          )}
        </div>

        {/* Name + Handle */}
        <div>
          <h3 className="text-[19px] font-black leading-none tracking-[-0.02em] text-white truncate">
            {u.name}
          </h3>
          <div className="mt-0.5 flex items-center gap-1">
            <Hash className="size-3 text-white/30" strokeWidth={2} />
            <span className="font-mono text-[10px] font-medium tracking-wider text-white/35">
              {u.handle || `user#${u.id}`}
            </span>
          </div>
          {vibe && (
            <p className="mt-1 text-[11px] leading-snug text-white/45 truncate italic">
              {vibe}
            </p>
          )}
        </div>

        {/* Action row — always visible, never clipped */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-interactive="true"
            data-sound="pop"
            onClick={onPass}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/50 transition-all hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X className="size-3.5" strokeWidth={2.5} />
          </button>

          <button
            type="button"
            data-interactive="true"
            data-sound="chime"
            disabled={isRequested || isFriend}
            onClick={() => !isRequested && !isFriend && onAdd(u)}
            className={`flex flex-1 h-9 items-center justify-center gap-1.5 rounded-full text-[12px] font-bold tracking-wide transition-all active:scale-[0.97] disabled:cursor-default ${
              isFriend
                ? "border border-white/15 bg-white/8 text-white/50"
                : isRequested
                ? "border border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "bg-white text-black hover:bg-white/90"
            }`}
          >
            {isFriend ? (
              <><UserCheck className="size-3.5" strokeWidth={2.5} /> Friends</>
            ) : isRequested ? (
              <><Check className="size-3.5" strokeWidth={2.5} /> Sent</>
            ) : (
              <><UserPlus className="size-3.5" strokeWidth={2.5} /> Add Friend</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FindFriendsStack({ onFriendAdded }) {
  const navigate = useNavigate();
  const stackRef = useRef(null);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestedIds, setRequestedIds] = useState(new Set());
  const [friendsData, setFriendsData] = useState({ friends: [], incoming: [], outgoing: [] });

  // Dialog states
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [rosterModalOpen, setRosterModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagLoading, setTagLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("friends"); // 'friends' | 'requests'
  // Index of the card currently on top of the deck (via Stack's onChange),
  // so the "Up next" rail can preview the queue behind it.
  const [topIndex, setTopIndex] = useState(0);
  // Every top change is a card swap (pass, drag-fling, or auto-advance), so
  // the whoosh lives here and covers all of them uniformly.
  const handleTopChange = (top) => {
    setTopIndex(top);
    playWhoosh();
  };

  // Fetch discover users
  const loadDiscover = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api("/api/users/discover");
      setUsers(res.users ?? []);
    } catch (err) {
      console.error("Failed to load discover users", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch friend lists & pending requests
  const loadFriends = useCallback(async () => {
    try {
      const res = await api("/api/friends");
      setFriendsData(res);
      // Pre-populate requested IDs from outgoing requests
      const outgoingSet = new Set((res.outgoing ?? []).map((o) => o.id));
      setRequestedIds(outgoingSet);
    } catch (err) {
      console.error("Failed to load friends", err);
    }
  }, []);

  useEffect(() => {
    loadDiscover();
    loadFriends();
  }, [loadDiscover, loadFriends]);

  // Handle send friend request directly from a card
  const handleAddFriend = async (targetUser) => {
    if (requestedIds.has(targetUser.id)) return;
    try {
      const res = await api("/api/friends/request", { target_user_id: targetUser.id });
      setRequestedIds((prev) => new Set([...prev, targetUser.id]));
      playChime();
      toast.success(res.message || `Friend request sent to ${targetUser.name}!`);
      loadFriends();
      onFriendAdded?.();
      // Auto-advance card after 400ms for ultra-smooth feel
      setTimeout(() => {
        stackRef.current?.sendToBack();
      }, 400);
    } catch (err) {
      toast.error(err.message || "Could not send friend request.");
    }
  };

  // Pass card
  const handlePass = () => {
    playPop();
    stackRef.current?.sendToBack();
  };

  // Add by ID Tag (e.g. uwiandev#9999 or yuu#12345)
  const handleAddByTag = async (e) => {
    e?.preventDefault();
    const clean = tagInput.trim();
    if (!clean) return toast.error("Enter a handle (e.g. yuu#12345)");
    if (!/^[\w.-]{2,24}#\d{1,5}$/i.test(clean)) {
      return toast.error("Invalid format! Use name#12345 (up to 5 numbers only).");
    }

    setTagLoading(true);
    try {
      const res = await api("/api/friends/request", { handle: clean });
      toast.success(res.message || `Friend request sent to ${clean}!`);
      setTagInput("");
      setTagModalOpen(false);
      loadFriends();
      loadDiscover();
      onFriendAdded?.();
    } catch (err) {
      toast.error(err.message || "Could not find user with that ID tag.");
    } finally {
      setTagLoading(false);
    }
  };

  // Accept incoming friend request
  const handleAcceptRequest = async (requestId, senderName) => {
    try {
      const res = await api(`/api/friends/${requestId}/accept`, {});
      toast.success(res.message || `Connected with ${senderName}!`);
      loadFriends();
      loadDiscover();
      onFriendAdded?.();
    } catch (err) {
      toast.error(err.message || "Failed to accept request.");
    }
  };

  // Reject incoming friend request
  const handleRejectRequest = async (requestId) => {
    try {
      await api(`/api/friends/${requestId}/reject`, {});
      toast.info("Friend request declined.");
      loadFriends();
    } catch (err) {
      toast.error(err.message || "Failed to decline request.");
    }
  };

  // Unfriend
  const handleRemoveFriend = async (friendshipId, friendName) => {
    try {
      await api(`/api/friends/${friendshipId}`, {}, "DELETE");
      toast.info(`Removed ${friendName} from friends.`);
      loadFriends();
      loadDiscover();
    } catch (err) {
      toast.error(err.message || "Failed to remove friend.");
    }
  };

  // Open direct message with a friend
  const handleStartDM = async (friendId) => {
    try {
      const res = await api("/api/conversations/dm", { target_user_id: friendId });
      setRosterModalOpen(false);
      navigate("/messages");
    } catch (err) {
      toast.error(err.message || "Could not open chat.");
    }
  };

  // Build stack cards using the premium DiscoveryCard
  const cards = users.map((u) => {
    const isRequested = requestedIds.has(u.id) || u.friend_status === "pending";
    const isFriend = u.friend_status === "accepted";
    return (
      <DiscoveryCard
        key={u.id}
        u={u}
        isRequested={isRequested}
        isFriend={isFriend}
        onAdd={handleAddFriend}
        onPass={handlePass}
      />
    );
  });

  // End card — styled to match the dark card aesthetic
  const endCard = (
    <div
      key="end-card"
      className="flex h-full w-full flex-col items-center justify-center rounded-[20px] p-8 text-center"
      style={{ background: "linear-gradient(145deg, #0a0a0a 0%, #111 100%)" }}
    >
      <div
        className="grid size-16 place-items-center rounded-full border border-white/10"
        style={{ background: "linear-gradient(135deg, #1a1a1a, #0d0d0d)" }}
      >
        <Sparkles className="size-7 text-white/50" strokeWidth={1.5} />
      </div>
      <h3 className="mt-5 text-[18px] font-black tracking-tight text-white">
        You've seen everyone.
      </h3>
      <p className="mt-2 max-w-[200px] text-[12px] leading-relaxed text-white/40">
        Radar's caught up. Refresh to scan again or add someone by tag.
      </p>
      <div className="mt-6 flex flex-col gap-2 w-full max-w-[200px]">
        <button
          data-interactive="true"
          onClick={loadDiscover}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-white text-[13px] font-bold text-black transition-all hover:bg-white/90 active:scale-[0.97]"
        >
          <Shuffle className="size-3.5" strokeWidth={2.5} /> Reshuffle
        </button>
        <button
          data-interactive="true"
          onClick={() => setTagModalOpen(true)}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/8 text-[13px] font-semibold text-white/70 transition-all hover:bg-white/12 active:scale-[0.97]"
        >
          <Hash className="size-3.5" strokeWidth={2.5} /> Add by Tag
        </button>
      </div>
    </div>
  );

  const finalCards = cards.length > 0 ? [...cards, endCard] : [endCard];
  const pendingCount = (friendsData.incoming ?? []).length;
  const friendCount = (friendsData.friends ?? []).length;

  // Next three people behind the top card, wrapping past the end card back
  // to the top of the queue. Guarded: a reshuffle can shrink the deck under
  // a stale topIndex, and tiny decks must not repeat the same person.
  const upNext = [];
  if (users.length > 0) {
    const safeTop = topIndex < finalCards.length ? topIndex : 0;
    const seen = new Set();
    for (let i = 1; i <= 3; i++) {
      const idx = (safeTop + i) % finalCards.length;
      if (idx >= users.length) continue; // end card, not a person
      const nxt = users[idx];
      if (seen.has(nxt.id)) continue;
      seen.add(nxt.id);
      upNext.push(nxt);
    }
  }

  return (
    <div className="relative mt-5 rounded-2xl border-2 border-border bg-card p-5 shadow-shadow sm:p-6">
      {/* ── Section Header ── */}
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">
            Find Your Circle
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Drag cards to discover vouched members near you.
          </p>
        </div>

        <div className="flex items-center gap-2 mt-3 sm:mt-0">
          <button
            onClick={() => setTagModalOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-secondary-background px-3 text-[12px] font-bold text-foreground transition-all hover:bg-main hover:text-main-foreground hover:border-main active:scale-[0.97]"
          >
            <Hash className="size-3" strokeWidth={2.5} /> Add by Tag
          </button>
          <button
            onClick={() => setRosterModalOpen(true)}
            className={`relative flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold transition-all active:scale-[0.97] ${
              pendingCount > 0
                ? "border-main bg-main text-main-foreground hover:opacity-90"
                : "border-border bg-secondary-background text-foreground hover:bg-main hover:text-main-foreground hover:border-main"
            }`}
          >
            <Users className="size-3" strokeWidth={2.5} />
            Friends ({friendCount})
            {pendingCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Stack Arena flanked by desktop side rails ── */}
      {/* gap-24: the fan's behind-cards swing ~70px past the deck edge, so a
          normal gap lets them paint over the rails (their motion z-index
          beats static content). Wide clearance keeps them clear at rest. */}
      <div className="flex items-start justify-center gap-24">
        {/* Left rail: who is up next in the queue (desktop only) */}
        {/* relative z-30: stray card edges during flings duck *behind* the
            panels instead of covering their text. */}
        <aside className="relative z-30 hidden w-48 shrink-0 lg:block" aria-label="Up next">
          <div className="rounded-xl border-2 border-border bg-secondary-background p-3 shadow-shadow">
            <p className="kicker text-muted-foreground">Up next</p>
            {loading ? (
              <p className="mt-2 text-xs text-muted-foreground">Scanning radar…</p>
            ) : upNext.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Radar clear. Reshuffle to scan again.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {upNext.map((nxt, i) => (
                  <li key={nxt.id} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Avatar name={nxt.name} art={nxt.avatar_id} custom={nxt.avatar_url} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-foreground">{nxt.name}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {nxt.verification_status === "approved"
                          ? "ID-checked"
                          : nxt.handle || `user#${nxt.id}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Center deck */}
        <div className="flex flex-col items-center">
          {loading ? (
            <div
              className="flex h-[460px] w-full max-w-[300px] flex-col items-center justify-center gap-3 rounded-[20px]"
              style={{ background: "linear-gradient(145deg, #0a0a0a, #111)" }}
            >
              <Sparkles className="size-6 animate-spin text-white/30" strokeWidth={1.5} />
              <span className="font-mono text-[11px] font-semibold text-white/30 tracking-widest">
                SCANNING RADAR…
              </span>
            </div>
          ) : (
            <div className="relative h-[460px] w-full max-w-[300px] sm:max-w-[320px]">
              <Stack
                ref={stackRef}
                cards={finalCards}
                onChange={handleTopChange}
                layout="fan"
                visible={3}
                spread={0.7}
                depth={0.5}
                tilt={16}
                speed={1.0}
                radius={20}
              />
            </div>
          )}

          <p className="mt-4 text-center text-[11px] text-muted-foreground font-mono tracking-widest uppercase">
            drag to browse · tap add to connect
          </p>
        </div>

        {/* Right rail: live counts + tips (desktop only) */}
        <aside className="relative z-30 hidden w-48 shrink-0 lg:block" aria-label="Radar stats">
          <div className="rounded-xl border-2 border-border bg-secondary-background p-3 shadow-shadow">
            <p className="kicker text-muted-foreground">Radar</p>
            <dl className="mt-2 space-y-1.5">
              {[
                ["On radar", users.length],
                ["Friends", friendCount],
                ["Pending", pendingCount],
              ].map(([label, n]) => (
                <div key={label} className="flex items-baseline justify-between">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-sm font-bold text-foreground">{n}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 border-t-2 border-border pt-2.5">
              <p className="kicker text-muted-foreground">Tips</p>
              <ul className="mt-1.5 space-y-1.5 text-[11px] leading-snug text-muted-foreground">
                <li>Green ring means an admin checked their ID.</li>
                <li>Spot the sober-driver badge before planning rides home.</li>
                <li>Mutual crews are the fastest icebreaker.</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Modal: Add by Tag ── */}
      <Dialog open={tagModalOpen} onOpenChange={setTagModalOpen}>
        <DialogContent className="border-2 border-border bg-card shadow-shadow sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <Hash className="size-5 text-main" strokeWidth={2.5} /> Add by ID Tag
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter their exact handle: <span className="font-mono font-bold text-foreground">name#12345</span> (up to 5 digits)
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddByTag} className="mt-2 space-y-4">
            <div>
              <label htmlFor="friend-tag-input" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Unique Handle
              </label>
              <Input
                id="friend-tag-input"
                type="text"
                placeholder="e.g. yuu#12345"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="font-mono text-sm tracking-wide"
                autoFocus
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Example: <strong className="text-foreground">Curtney Trinidad</strong> → <code className="rounded bg-secondary-background px-1 py-0.5 font-bold text-main">yuu#12345</code>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="neutral" onClick={() => setTagModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={tagLoading || !tagInput.trim()} className="font-bold">
                {tagLoading ? "Sending…" : "Send Request"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Friends Roster ── */}
      <Dialog open={rosterModalOpen} onOpenChange={setRosterModalOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden border-2 border-border bg-card p-0 shadow-shadow sm:max-w-lg">
          <div className="border-b-2 border-border p-5">
            <DialogTitle className="text-xl font-black">Friends & Connections</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Accepted friends and pending invitations.
            </DialogDescription>

            <div className="mt-4 flex rounded-lg border-2 border-border bg-secondary-background p-1">
              {[
                { key: "friends", label: `Friends (${friendCount})` },
                { key: "requests", label: `Requests${pendingCount > 0 ? ` (${pendingCount})` : ""}`, badge: pendingCount },
              ].map(({ key, label, badge }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`relative flex-1 rounded-md py-1.5 text-xs font-bold transition-all ${
                    activeTab === key
                      ? "bg-main text-main-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  {badge > 0 && activeTab !== key && (
                    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[55vh] overflow-y-auto p-5">
            {activeTab === "friends" ? (
              friendsData.friends?.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Users className="mx-auto size-10 opacity-20" strokeWidth={1.5} />
                  <p className="mt-3 text-sm font-bold">No friends yet</p>
                  <p className="mt-1 text-xs">Swipe through radar cards to connect.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {friendsData.friends.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-secondary-background p-3 transition-colors hover:border-main/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={f.name} art={f.avatar_id} custom={f.avatar_url} size={40} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-foreground">{f.name}</div>
                          <div className="font-mono text-[10px] font-semibold text-muted-foreground">
                            {f.handle || `user#${f.id}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="neutral" onClick={() => handleStartDM(f.id)} className="size-8 p-0" title="Message">
                          <MessageSquare className="size-3.5" strokeWidth={2} />
                        </Button>
                        <Button size="sm" variant="neutral" onClick={() => handleRemoveFriend(f.friendship_id, f.name)} className="size-8 p-0 text-muted-foreground hover:text-red-500" title="Unfriend">
                          <X className="size-3.5" strokeWidth={2} />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              friendsData.incoming?.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Check className="mx-auto size-10 opacity-20 text-emerald-500" strokeWidth={1.5} />
                  <p className="mt-3 text-sm font-bold">No pending requests</p>
                  <p className="mt-1 text-xs">All caught up on invites.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {friendsData.incoming.map((req) => (
                    <li
                      key={req.request_id}
                      className="flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-secondary-background p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={req.name} art={req.avatar_id} custom={req.avatar_url} size={40} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-foreground">{req.name}</div>
                          <div className="font-mono text-[10px] font-semibold text-muted-foreground">
                            {req.handle || `user#${req.id}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" onClick={() => handleAcceptRequest(req.request_id, req.name)} className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs h-8 px-3">
                          Accept
                        </Button>
                        <Button size="sm" variant="neutral" onClick={() => handleRejectRequest(req.request_id)} className="font-bold text-xs h-8 px-3">
                          Decline
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
