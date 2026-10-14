import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Home,
  LogOut,
  Mail,
  Map as MapIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  GlassWater,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, initials } from "@/lib/api";
import { isMuted, setMuted } from "@/lib/sound";
import { useAuth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import Magnet from "@/components/reactbits/Magnet/Magnet";
import { OfficialLogo } from "@/components/OfficialLogo";
import { NotificationsDialog, VerificationDialog } from "@/components/sheets";
import { AvatarArt, isAvatarId } from "@/components/avatars";

export function Avatar({ name, size = 36, art = null, custom = null }) {
  if (custom) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-border bg-secondary-background"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <img src={custom} alt="" className="h-full w-full object-cover" draggable={false} />
      </span>
    );
  }
  if (isAvatarId(art)) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-border"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <AvatarArt id={art} size={size - 4} />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border-2 border-border bg-secondary-background font-bold text-foreground"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Lamp({ checkin }) {
  let cls = "bg-chart-3";
  let label = "Hasn't checked in yet";
  if (checkin?.home_confirmed_at) {
    cls = "bg-chart-4";
    label = "Made it home safely";
  } else if ((checkin?.flag_stage ?? 0) >= 3) {
    cls = "bg-chart-2";
    label = "No sign of life, escalated to admin";
  } else if ((checkin?.flag_stage ?? 0) === 2) {
    cls = "bg-chart-1";
    label = "Buddy was alerted";
  }
  return <span title={label} aria-label={label} className={`inline-block size-2.5 shrink-0 rounded-full border border-border ${cls}`} />;
}

const STATUS_VARIANT = {
  planning: "secondary",
  open: "default",
  wrapped: "default",
  closed: "outline",
};

export function StatusBadge({ status, label }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{label}</Badge>;
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center px-5 py-11 text-center">
      <div className="mb-3 grid size-13 place-items-center rounded-base border-2 border-border bg-main text-main-foreground shadow-shadow">
        {icon}
      </div>
      <h3 className="script-accent text-[22px] font-semibold">{title}</h3>
      {body ? <p className="mt-1 max-w-75 text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Field({ label, htmlFor, children }) {
  return (
    <div className="mt-3.5 first:mt-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function UserMenu({ compact = false }) {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(!isMuted());
  if (!user) return null;
  const first = user.name?.split(" ")[0] ?? "Account";
  const vs = user.verification_status; // "approved" | "pending" | "rejected" | null
  const isVerified = vs === "approved";
  const isPending = vs === "pending" || vs === "under_review";
  return (
    <>
      <div className="flex items-center gap-2">
        {!isVerified && !compact ? (
          <button
            type="button"
            onClick={() => setVerifyOpen(true)}
            className="tb-cursor hidden sm:inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-main/20 px-2.5 py-1 text-xs font-bold text-foreground transition-all hover:bg-main hover:text-main-foreground hover:-translate-x-0.5 hover:-translate-y-0.5"
            title={isPending ? "ID submitted - under review" : "Click to verify your ID"}
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            <span>{isPending ? "ID Pending" : "Verify now →"}</span>
          </button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex min-h-10 items-center gap-2 rounded-full border-2 border-border bg-secondary-background py-1 pr-2.5 pl-1 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
              aria-label={`Account: ${user.name}`}
            >
              <Avatar name={user.name} size={28} art={user.avatar_id} custom={user.avatar_url} />
              {compact ? null : (
                <>
                  <span className="hidden text-[13px] font-semibold sm:inline">{first}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-70 w-60">
          <DropdownMenuLabel>
            <div className="font-bold">{user.name}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
            <div className="mt-1.5">
              {isVerified ? (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="size-3" aria-hidden="true" /> ID checked · Vouched in
                </Badge>
              ) : isPending ? (
                <Badge variant="secondary" className="gap-1 text-amber-600 border-amber-400">
                  <ShieldAlert className="size-3" aria-hidden="true" /> Verification pending
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-main/10" onClick={() => setVerifyOpen(true)}>
                  <ShieldOff className="size-3" aria-hidden="true" /> Not verified · Verify now →
                </Badge>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/profile")}>
            <UserRound aria-hidden="true" /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/settings")}>
            <SettingsIcon aria-hidden="true" /> Settings
          </DropdownMenuItem>
          {user.role === "admin" ? (
            <DropdownMenuItem onSelect={() => navigate("/admin")}>
              <ShieldCheck aria-hidden="true" /> Ops console
            </DropdownMenuItem>
          ) : null}
          {!isVerified ? (
            <DropdownMenuItem onSelect={() => setVerifyOpen(true)} className="font-medium text-main">
              <ShieldCheck aria-hidden="true" /> Get verified →
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => navigate("/map")}>
            <MapIcon aria-hidden="true" /> Live hangout map
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/messages")}>
            <Mail aria-hidden="true" /> Messages
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              try {
                // Refresh auth state in place. A full reload would remount App and
                // replay the whole boot sequence just to flip one flag.
                const r = await api("/api/me", { can_drink: !user.can_drink }, "PATCH");
                if (r?.user) setUser(r.user);
                toast.success(r?.user?.can_drink ? "You drink. Drive-home plans still apply." : "Set as non-drinker.");
              } catch (e) {
                toast.error(e.message);
              }
            }}
          >
            <GlassWater aria-hidden="true" /> {user.can_drink ? "Set: non-drinker" : "Set: drinks"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              const next = !soundOn;
              setMuted(!next);
              setSoundOn(next);
            }}
          >
            {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            Sound: {soundOn ? "on" : "off"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await logout();
              navigate("/login");
            }}
            className="text-destructive focus:text-destructive"
          >
            <LogOut aria-hidden="true" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <VerificationDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
  </>
  );
}

const NAV = [
  { to: "/groups", label: "Sessions", icon: Home, match: (p) => p === "/" || p === "/groups" || p.startsWith("/groups/") || p.startsWith("/sessions") },
  { to: "/map", label: "Live map", icon: MapIcon, match: (p) => p.startsWith("/map") },
  { to: "/messages", label: "Messages", icon: Mail, match: (p) => p.startsWith("/messages") },
];

export function Layout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [compact, setCompact] = useState(false);
  const morphed = compact && !!user;

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 72);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api("/api/me/notifications")
      .then((n) => alive && setNotifCount(n.length))
      .catch(() => {});
    api("/api/conversations/unread-count")
      .then((r) => alive && setUnread(r.unread))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, location.pathname]);

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 h-[68px]">
        <div
          className="h-full w-full transition-[clip-path] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={
            morphed
              ? { clipPath: "inset(6px calc(50% - 170px) 6px calc(50% - 170px) round 999px)" }
              : { clipPath: "inset(0px 0px 0px 0px round 0px)" }
          }
        >
          <div className="grid h-full w-full">
        {/* Expanded bar row */}
        <div
          className={`glass-70 col-start-1 row-start-1 h-full w-full border-b-2 border-border transition-all duration-200 ${
            morphed ? "pointer-events-none scale-95 opacity-0 delay-300" : "scale-100 opacity-100 delay-100"
          }`}
          inert={morphed}
          aria-hidden={morphed}
        >
          <div className="mx-auto flex h-full w-full max-w-5xl items-center gap-3 px-4 sm:px-5">
          <Magnet padding={60} magnetStrength={1.5}>
            <Link
              to="/groups"
              className="grid size-9 place-items-center overflow-hidden rounded-base border-2 border-border bg-main text-main-foreground shadow-shadow transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
              aria-label="Uwian home"
            >
              <OfficialLogo size={30} />
            </Link>
          </Magnet>
          <Link to="/groups" className="shrink-0 no-underline" aria-label="Uwian home">
            <span
              className={`inline-block overflow-hidden whitespace-nowrap transition-all duration-500 ${
                morphed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100"
              }`}
            >
              <img src="/uwian-logo.svg" alt="uwian." className="h-[22px] w-auto" draggable={false} />
            </span>
          </Link>
          <span
            className={`mr-auto hidden overflow-hidden whitespace-nowrap text-[13px] text-muted-foreground transition-all duration-500 md:inline-block ${
              morphed ? "max-w-0 opacity-0" : "max-w-[220px] opacity-100"
            }`}
          >
            find your crew, get home safe
          </span>
          {user ? (
            <>
              <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
                {NAV.map((n) => {
                  const NIcon = n.icon;
                  return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className={({ isActive }) =>
                      `tb-cursor inline-flex items-center gap-2 rounded-base px-3 py-2 text-sm font-medium whitespace-nowrap no-underline transition-colors ${
                        isActive || n.match(location.pathname)
                          ? "border-2 border-border bg-main text-main-foreground shadow-shadow"
                          : "text-muted-foreground hover:bg-secondary-background hover:text-foreground"
                      }`
                    }
                  >
                    <NIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span
                      className={`overflow-hidden whitespace-nowrap transition-all duration-500 ${
                        morphed ? "max-w-0 opacity-0" : "max-w-[120px] opacity-100"
                      }`}
                    >
                      {n.label}
                    </span>
                  </NavLink>
                  );
                })}
              </nav>
              <button
                onClick={() => setNotifOpen(true)}
                className="relative grid min-h-11 min-w-11 place-items-center rounded-base border-2 border-border bg-secondary-background shadow-shadow transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
                aria-label={`Notifications${notifCount > 0 ? `, ${notifCount} unread` : ""}`}
              >
                <Bell className="size-4" aria-hidden="true" />
                {notifCount > 0 ? (
                  <span className="absolute -top-2 -right-2 grid h-5 min-w-5 place-items-center rounded-full border-2 border-border bg-destructive px-1 text-[10px] font-bold text-white">
                    {notifCount}
                  </span>
                ) : null}
              </button>
              <UserMenu />
            </>
          ) : (
            <Link to="/login" className="text-sm font-medium">
              Log in
            </Link>
          )}
            </div>
        </div>
        {/* Dock row: centered pill, revealed by the clip window as it shrinks */}
        {user ? (
          <div
            className={`col-start-1 row-start-1 flex h-full w-full items-center justify-center transition-all duration-300 ${
              morphed ? "scale-100 opacity-100 delay-200" : "pointer-events-none scale-95 opacity-0 delay-0"
            }`}
            inert={!morphed}
            aria-hidden={!morphed}
          >
            <div className="glass-70 flex w-[min(340px,calc(100vw-24px))] items-center justify-center gap-1 rounded-full border-2 border-border p-1.5 shadow-shadow">
              <Link
                to="/groups"
                className="grid size-9 place-items-center overflow-hidden rounded-full border-2 border-border bg-main text-main-foreground"
                aria-label="Uwian home"
              >
                <OfficialLogo size={30} />
              </Link>
              {NAV.map((n) => {
                const Icon = n.icon;
                const active = n.match(location.pathname);
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    aria-label={n.label}
                    title={n.label}
                    className={`tb-cursor relative grid size-10 place-items-center rounded-full border-2 border-border transition-colors ${
                      active
                        ? "bg-main text-main-foreground shadow-shadow"
                        : "bg-secondary-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4.5" aria-hidden="true" />
                    {n.to === "/messages" && unread > 0 ? (
                      <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-border bg-destructive px-0.5 text-[9px] font-bold text-white">
                        {unread}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
              <button
                onClick={() => setNotifOpen(true)}
                className="relative grid size-10 place-items-center rounded-full border-2 border-border bg-secondary-background"
                aria-label={`Notifications${notifCount > 0 ? `, ${notifCount} unread` : ""}`}
              >
                <Bell className="size-4" aria-hidden="true" />
                {notifCount > 0 ? (
                  <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-border bg-destructive px-0.5 text-[9px] font-bold text-white">
                    {notifCount}
                  </span>
                ) : null}
              </button>
              <UserMenu compact />
            </div>
          </div>
        ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pt-7 pb-28 sm:px-5 md:pb-16">
        {children}
      </main>

      {user ? (
        <nav
          className="glass-70 fixed bottom-3 left-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 items-center justify-around gap-1 overflow-x-auto rounded-base border-2 border-border p-1.5 shadow-shadow md:hidden"
          aria-label="Quick actions"
        >
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = n.match(location.pathname);
            return (
              <NavLink
                key={n.to}
                to={n.to}
                className={`tb-cursor relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-base px-3 text-[11px] font-semibold whitespace-nowrap no-underline ${
                  active ? "bg-main text-main-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-4.5" aria-hidden="true" />
                {n.label}
                {n.to === "/messages" && unread > 0 ? (
                  <span className="absolute top-0.5 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                    {unread}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>
      ) : null}

      <NotificationsDialog open={notifOpen} onOpenChange={setNotifOpen} onRead={() => setNotifCount(0)} />
      <Toaster position="bottom-center" />
    </div>
  );
}

export function PageHeader({ title, sub, actions }) {
  return (
    <div className="pt-1.5 pb-5">
      <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {sub ? <p className="mt-1.5 max-w-xl text-[15px] text-muted-foreground">{sub}</p> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}
