import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { AuthProvider, useAuth } from "@/auth";
import { api } from "@/lib/api";
import { Layout } from "@/components/chrome";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Login, Signup } from "@/pages/auth";
import { Dashboard } from "@/pages/dashboard";
import { Crew } from "@/pages/crew";
import { Session } from "@/pages/session";
import { MapPage } from "@/pages/map";
import { Messages } from "@/pages/messages";
import { Join } from "@/pages/join";
import { Profile } from "@/pages/profile";
import { Settings } from "@/pages/settings";
import { Admin } from "@/pages/admin";
import PixelSnow from "@/components/reactbits/PixelSnow/PixelSnow";
import TargetCursor from "@/components/reactbits/TargetCursor/TargetCursor";
import GradualBlur from "@/components/reactbits/GradualBlur/GradualBlur";
import { Boot } from "@/components/Boot";
import { setLenis, scrollTopSmooth } from "@/lib/scroll";
import { playClick } from "@/lib/sound";

/* One delegated listener for the whole app: any click on an interactive
   element gets a soft blip. Elements with their own sound (card add/pass)
   opt out via data-sound so they don't double-play. */
function UiSounds() {
  useEffect(() => {
    const onClick = (e) => {
      const el = e.target?.closest?.(
        'button, a, [role="button"], [role="menuitem"], [data-interactive]'
      );
      if (!el || el.closest("[data-sound]")) return;
      playClick();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

/* The app is a single-page app: navigating never reloads code, so a tab left
   open keeps running yesterday's build. Check hourly; offer a reload toast
   when the server is serving a newer bundle. */
function UpdateCheck() {
  useEffect(() => {
    const current =
      document.querySelector('script[src^="/assets/index-"]')?.getAttribute("src");
    if (!current) return;
    let toasted = false;
    const check = async () => {
      if (toasted) return;
      try {
        const html = await (await fetch("/?v=" + Date.now(), { cache: "no-store" })).text();
        const m = html.match(/\/assets\/index-[A-Za-z0-9_.-]+\.js/);
        if (m && m[0] !== current) {
          toasted = true;
          const { toast } = await import("sonner");
          toast("A new version is available.", {
            description: "Reload to get the latest interface.",
            action: { label: "Reload", onClick: () => window.location.reload() },
            duration: Infinity,
          });
        }
      } catch {
        /* offline or server asleep; try again later */
      }
    };
    const t = setInterval(check, 120000);
    return () => clearInterval(t);
  }, []);
  return null;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    scrollTopSmooth();
  }, [pathname ]);
  return null;
}

/* Buttery wheel scrolling (skipped entirely when the OS asks for reduced
   motion), kept in sync with GSAP ScrollTrigger reveals. */
function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lenis = null;
    let raf = 0;
    let alive = true;
    (async () => {
      const { default: Lenis } = await import("lenis");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (!alive) return;
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      setLenis(lenis);
      lenis.on("scroll", ScrollTrigger.update);
      const loop = (time) => {
        lenis.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      setLenis(null);
      try {
        lenis?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, []);
  return null;
}

/* Old vanilla links used hash routes (#/g/5). Forward them to history routes. */
const HASH_FORWARD = { "/g/": "/groups/", "/s/": "/sessions/", "/join/": "/join/" };

function HashForward() {
  const location = useLocation();
  useEffect(() => {
    const h = window.location.hash;
    if (h.startsWith("#/")) {
      const rest = h.slice(1);
      for (const [from, to] of Object.entries(HASH_FORWARD)) {
        if (rest.startsWith(from)) {
          window.location.hash = "";
          window.history.replaceState(null, "", to + rest.slice(from.length));
          window.dispatchEvent(new PopStateEvent("popstate"));
          return;
        }
      }
      if (["/groups", "/map", "/messages", "/login", "/signup"].some((p) => rest === p || rest.startsWith(`${p}/`))) {
        window.location.hash = "";
        window.history.replaceState(null, "", rest);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }
  }, [location.pathname ]);
  return null;
}

function Fade({ children }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Guard({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  useEffect(() => {
    api("/api/escalation-tick", {}, "POST").catch(() => {});
  }, [location.pathname ]);
  if (!ready) return <p className="py-10 text-center text-background">Loading.</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Fade>{children}</Fade>;
}

function Authed({ children }) {
  return (
    <Layout>
      <Guard>{children}</Guard>
    </Layout>
  );
}

function OpenRoute({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="py-10 text-center text-background">Loading.</p>;
  if (user) return <Navigate to="/groups" replace />;
  return (
    <Layout>
      <Fade>{children}</Fade>
    </Layout>
  );
}

function LegacyCrew() {
  const { gid } = useParams();
  return <Navigate to={`/groups/${gid}`} replace />;
}

function LegacySession() {
  const { sid } = useParams();
  return <Navigate to={`/sessions/${sid}`} replace />;
}

export default function App() {
  const [booted, setBooted] = useState(false);
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollTop />
        <SmoothScroll />
        <HashForward />
        <UpdateCheck />
        <UiSounds />
        {!booted && <Boot onDone={() => setBooted(true)} />}
        <ErrorBoundary>
        {/* Fixed WebGL snowfall behind everything. Content layers sit above it
            (header/nav z-40, main z-10). Frozen automatically when the OS asks
            for reduced motion. */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
          <PixelSnow
            color="#ffffff"
            variant="snowflake"
            density={0.7}
            speed={1.1}
            wind={0.2}
            flakeSize={1.2}
            pixelSize={3}
            brightness={1.3}
            glow={0.8}
            twinkle={0.4}
            opacity={0.95}
          />
        </div>
        <div aria-hidden="true" className="analog-overlay pointer-events-none fixed inset-0 z-0" />
        <GradualBlur
          position="bottom"
          target="page"
          height="4.5rem"
          strength={2}
          zIndex={20}
          className="hidden md:block pointer-events-none"
        />
        {/* Corner-bracket highlight that follows the pointer across containers.
            Native cursor stays on; touch and keyboard users are unaffected. */}
        <TargetCursor
          targetSelector=".tb-cursor"
          hideDefaultCursor={false}
          cursorColor="#000000"
          cursorColorOnTarget="#5294FF"
          spinDuration={2.5}
          size={30}
          showLabel={false}
        />
        <Routes>
          <Route path="/login" element={<OpenRoute><Login /></OpenRoute>} />
          <Route path="/signup" element={<OpenRoute><Signup /></OpenRoute>} />
          <Route path="/" element={<Authed><Dashboard /></Authed>} />
          <Route path="/groups" element={<Authed><Dashboard /></Authed>} />
          <Route path="/groups/:gid" element={<Authed><Crew /></Authed>} />
          <Route path="/sessions/:sid" element={<Authed><Session /></Authed>} />
          <Route path="/map" element={<Authed><MapPage /></Authed>} />
          <Route path="/map/:gid" element={<Authed><MapPage /></Authed>} />
          <Route path="/messages" element={<Authed><Messages /></Authed>} />
          <Route path="/messages/:cid" element={<Authed><Messages /></Authed>} />
          <Route path="/join/:gid" element={<Authed><Join /></Authed>} />
          <Route path="/profile" element={<Authed><Profile /></Authed>} />
          <Route path="/settings" element={<Authed><Settings /></Authed>} />
          <Route path="/admin" element={<Authed><Admin /></Authed>} />
          <Route path="/g/:gid" element={<LegacyCrew />} />
          <Route path="/s/:sid" element={<LegacySession />} />
          <Route
            path="*"
            element={
              <Layout>
                <div className="rounded-base border-2 border-border bg-background p-6 text-center shadow-shadow">
                  <h1 className="text-xl font-bold">Page not found</h1>
                </div>
              </Layout>
            }
          />
        </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
