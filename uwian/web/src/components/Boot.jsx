import { Component, useEffect, useRef, useState } from "react";
import CountUp from "@/components/reactbits/CountUp/CountUp";
import MetallicPaint from "@/components/reactbits/MetallicPaint/MetallicPaint";
import ElasticMesh from "@/components/reactbits/ElasticMesh/ElasticMesh";
import PrismaticBurst from "@/components/reactbits/PrismaticBurst/PrismaticBurst";
import { UHOUSE_SRC } from "@/components/OfficialLogo";
import { playBoot, playSample } from "@/lib/sound";

/* If WebGL (or anything stage-side) fails, bail out to the site instead of
   trapping the user on a dead loader. */
class StageGuard extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/* Boot loader sequence:
   prismatic burst (intro rays) -> counter (0-100%) -> metallic U-house logo
   -> elastic "uwian." text mesh -> smooth fadeout to reveal site. */
export function Boot({ onDone }) {
  const [phase, setPhase] = useState("burst");
  const done = useRef(onDone);
  done.current = onDone;
  const finish = () => done.current?.();

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    // Sweep plays (or queues until first interaction unlocks audio).
    playBoot();
    // Safety backstop: never trap the user longer than 11s under any circumstance
    const backstop = setTimeout(finish, 11000);
    return () => clearTimeout(backstop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The PrismaticBurst intro sweep takes ~2.4s to expand from the centre,
    // and the rays measured dim (peak channel ~61/255 at intensity 0.85), so
    // the old 1.3s hold never let the effect register. 2.2s lets the sweep
    // nearly finish while staying well under the 11s backstop (total ~8.2s).
    if (phase === "burst") {
      const t = setTimeout(() => setPhase("count"), 2200);
      return () => clearTimeout(t);
    }
    if (phase === "metal") {
      // Shimmer as the metallic mark pours in.
      playSample("sparkle");
      const t = setTimeout(() => setPhase("elastic"), 2000);
      return () => clearTimeout(t);
    }
    if (phase === "elastic") {
      // Wet splat as the mesh wakes up.
      playSample("slime");
      const t = setTimeout(() => setPhase("out"), 1800);
      return () => clearTimeout(t);
    }
    if (phase === "out") {
      const t = setTimeout(finish, 700);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Loading Uwian"
      className={`fixed inset-0 z-[1100] flex flex-col items-center justify-center bg-[#0a0a14] transition-opacity duration-700 ease-out ${
        phase === "out" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* 1. PrismaticBurst backdrop — runs as atmospheric cosmic rays.
          The static gradient underneath is a fallback, not decoration: if
          WebGL fails, StageGuard renders nothing and the canvas stays
          transparent, so without this the loader would sit on flat black. */}
      <div aria-hidden="true" className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 50% 45%, rgba(29,78,216,0.35), rgba(10,10,20,0) 70%), radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59,130,246,0.22), rgba(10,10,20,0) 70%)",
          }}
        />
        <StageGuard>
          <PrismaticBurst
            colors={["#1e3a8a", "#1d4ed8", "#3b82f6", "#93c5fd", "#dbeafe"]}
            intensity={1.6}
            speed={0.5}
            rayCount={14}
            rayWidth={1.5}
            distort={2.5}
            glow={0.8}
            intro={true}
          />
        </StageGuard>
      </div>

      {/* 2. Center stage content: burst -> counter -> metallic -> elastic */}
      <div aria-hidden="true" className="relative z-10 flex flex-col items-center justify-center">
        {/* Stage 1: Prismatic Burst solo intro */}
        {phase === "burst" && (
          <div className="flex h-[260px] w-[260px] items-center justify-center animate-[boot-in_600ms_ease-out]">
            <span className="font-mono text-[11px] font-bold tracking-[0.4em] text-white/40 uppercase">
              INITIALIZING
            </span>
          </div>
        )}

        {/* Stage 2: Monospace Counter 0-100% */}
        {phase === "count" && (
          <div className="flex h-[260px] w-[260px] flex-col items-center justify-center animate-[boot-in_400ms_ease-out]">
            <p className="font-mono text-7xl font-bold text-white tabular-nums drop-shadow-[0_4px_24px_rgba(29,78,216,0.5)]">
              <CountUp to={100} duration={1.5} onEnd={() => setPhase("metal")} />
              <span>%</span>
            </p>
            <p className="mt-4 font-mono text-[11px] font-semibold tracking-[0.3em] text-white/50 uppercase">
              SYNCING MESH
            </p>
          </div>
        )}

        {/* Stages 3 & 4: Metallic mark & Elastic text cross-fade */}
        {(phase === "metal" || phase === "elastic" || phase === "out") && (
          <div className="relative h-[260px] w-[260px]">
            {/* Metallic U-house mark */}
            <div
              className={`absolute inset-0 transition-all duration-500 ease-out ${
                phase === "metal"
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-95 pointer-events-none"
              }`}
            >
              <StageGuard onFail={finish}>
                <MetallicPaint
                  imageSrc={UHOUSE_SRC}
                  color="#ffffff"
                  backgroundColor="transparent"
                  speed={1.1}
                  intro={true}
                />
              </StageGuard>
            </div>

            {/* Elastic "uwian." text mesh */}
            <div
              className={`absolute inset-0 transition-all duration-500 ease-out ${
                phase === "elastic" || phase === "out"
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-95 pointer-events-none"
              }`}
            >
              <StageGuard onFail={finish}>
                <ElasticMesh
                  text="uwian."
                  fontFamily='"Archivo Black", "Archivo", sans-serif'
                  fontWeight={400}
                  color="#ffffff"
                  theme="dark"
                  intro={true}
                />
              </StageGuard>
            </div>
          </div>
        )}

        {/* Micro-label readouts for metallic & elastic stages */}
        {phase === "metal" && (
          <p className="mt-4 font-mono text-xs tracking-[0.3em] text-white/60 uppercase animate-[boot-in_400ms_ease-out]">
            POURING THE MARK
          </p>
        )}
        {(phase === "elastic" || phase === "out") && (
          <p className="mt-4 font-mono text-xs tracking-[0.3em] text-white/60 uppercase animate-[boot-in_400ms_ease-out]">
            WAKING THE MESH
          </p>
        )}
      </div>

      <button
        onClick={finish}
        className="absolute bottom-8 rounded-base border-2 border-white/20 bg-black/40 px-4 py-2 font-mono text-xs tracking-wider text-white/70 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-black/60 hover:text-white"
      >
        SKIP INTRO
      </button>

      <style>{`@keyframes boot-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}
