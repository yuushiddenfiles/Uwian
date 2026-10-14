let lenis = null;

export function setLenis(instance) {
  lenis = instance;
}

export function getLenis() {
  return lenis;
}

export function scrollTopSmooth() {
  if (lenis) {
    try {
      lenis.scrollTo(0, { immediate: false });
      return;
    } catch {
      /* fall through to native */
    }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* Frozen-phase rise math (pure, unit-tested): progress 0 → card sits 60vh
   below its slot; 1 → docked. Opacity and settle follow the same curve. */
export const RISE_RANGE_PX = 1400;

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function riseStyle(p, vh) {
  const c = clamp01(p);
  const y = (1 - c) * 0.6 * vh;
  return {
    transform: `translate3d(0, ${y.toFixed(1)}px, 0) scale(${(0.97 + 0.03 * c).toFixed(4)})`,
    opacity: Number((0.25 + 0.75 * c).toFixed(4)),
  };
}
