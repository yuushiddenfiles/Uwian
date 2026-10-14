/* Tiny synthesized UI sounds. Zero assets: everything is Web Audio oscillators,
   so there is nothing to download, host, or license.
   Browsers block audio before the first user gesture, so the context starts
   suspended: blips attempted while locked are dropped, and a boot sweep
   requested while locked is queued and plays on unlock instead. */

const KEY = "uwian-sound"; // "off" = muted, anything else (or missing) = on
let ctx = null;
let unlocked = false;
let pendingBoot = false;

export function isMuted() {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

export function setMuted(m) {
  try {
    localStorage.setItem(KEY, m ? "off" : "on");
  } catch {
    /* private mode — sound just stays as-is */
  }
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  try {
    ensureCtx()?.resume();
  } catch {
    /* resume is best-effort */
  }
  if (pendingBoot) {
    pendingBoot = false;
    playBoot();
  }
  if (pendingSamples.length > 0) {
    const queued = pendingSamples;
    pendingSamples = [];
    queued.forEach((name) => playSample(name));
  }
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

/* One enveloped oscillator. Gains stay low on purpose — UI sounds sit under
   the interface, never over it. */
function tone({ type = "sine", from, to = null, at = 0, dur = 0.1, gain = 0.08, filterTo = null }) {
  const ac = ensureCtx();
  if (!ac || isMuted() || ac.state === "suspended") return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (filterTo) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(filterTo, t + dur);
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/* Soft blip for everyday buttons, links, and menu items (wired globally). */
export function playClick() {
  if (typeof window === "undefined" || isMuted()) return;
  tone({ type: "triangle", from: 620, to: 880, dur: 0.07, gain: 0.05 });
}

/* Downward pop for dismissals and passes. Kept short with the floor at 300Hz —
   anything lower and longer starts reading as flatulence, per owner review. */
export function playPop() {
  if (typeof window === "undefined" || isMuted()) return;
  tone({ type: "sine", from: 500, to: 300, dur: 0.09, gain: 0.08 });
}

/* Airy whoosh for the friend-deck card swap. Filtered noise, not a tone, so
   it reads as motion rather than a beep. Short enough to sit under the pop
   on button passes without muddying it. */
let noiseBuf = null;
export function playWhoosh() {
  if (typeof window === "undefined" || isMuted()) return;
  const ac = ensureCtx();
  if (!ac || ac.state === "suspended") return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(600, t);
  f.frequency.exponentialRampToValueAtTime(3600, t + 0.22);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  src.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  src.start(t);
  src.stop(t + 0.3);
}

/* Two-note confirm for friend requests sent. */
export function playChime() {
  if (typeof window === "undefined" || isMuted()) return;
  tone({ type: "sine", from: 523.25, dur: 0.22, gain: 0.09 });
  tone({ type: "sine", from: 784, at: 0.09, dur: 0.28, gain: 0.09 });
}

/* Slow rising shimmer across the boot sequence. An ascending pentatonic run of
   soft plucks over a low swell — it follows the rays unfolding instead of
   fighting them like the old plain two-sine sweep did. 2.2s to match the
   burst hold. */
export function playBoot() {
  if (typeof window === "undefined" || isMuted()) return;
  const ac = ensureCtx();
  if (!ac || ac.state === "suspended") {
    pendingBoot = true;
    return;
  }
  const notes = [659.25, 784, 880, 987.77, 1174.66, 1318.51]; // E5 G5 A5 B5 D6 E6
  notes.forEach((f, i) => {
    tone({ type: "triangle", from: f, at: i * 0.3, dur: 0.4, gain: 0.06 });
  });
  tone({ type: "sine", from: 110, to: 220, dur: 2.2, gain: 0.07, filterTo: 2800 });
}

/* Bundled audio files (web/public/sfx, served at /sfx). Mixkit license:
   free for commercial use, no attribution required. Files live in the repo
   so playback never depends on a third-party server being up. */
const SAMPLES = {
  sparkle: { src: "/sfx/sparkle.mp3", volume: 0.4 }, // metallic pour shimmer
  slime: { src: "/sfx/slime.mp3", volume: 0.5 }, // elastic mesh splat
};
const sampleEls = {};
let pendingSamples = [];

function getSample(name) {
  const def = SAMPLES[name];
  if (!def || typeof window === "undefined") return null;
  if (!sampleEls[name]) {
    const a = new Audio(def.src);
    a.preload = "auto";
    a.volume = def.volume;
    sampleEls[name] = a;
  }
  return sampleEls[name];
}

/* Play a bundled sample. Blocked-before-gesture plays queue behind unlock,
   same as the boot sweep. Overlapping calls restart the sample instead of
   layering it. */
export function playSample(name) {
  if (typeof window === "undefined" || isMuted()) return;
  if (!unlocked) {
    if (!pendingSamples.includes(name)) pendingSamples.push(name);
    return;
  }
  const a = getSample(name);
  if (!a) return;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p) p.catch(() => {});
  } catch {
    /* unsupported format — staying silent beats crashing */
  }
}
