// Deterministic generative art for spots. Same id always yields the same
// tile: abstract shapes only, never fake photography.
const PALETTES = [
  ["#DFE8F7", "#2D5891"],
  ["#FCF1D6", "#7F6317"],
  ["#FDE2D7", "#B24628"],
  ["#DBEFE4", "#237446"],
];

function hashSeed(seed) {
  const s = String(seed ?? "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function Motif({ kind, fg }) {
  if (kind === 0) {
    return (
      <g fill="none" stroke={fg} strokeWidth="5">
        <circle cx="32" cy="32" r="10" />
        <circle cx="32" cy="32" r="19" opacity="0.65" />
        <circle cx="32" cy="32" r="27" opacity="0.35" />
      </g>
    );
  }
  if (kind === 1) {
    return (
      <g fill={fg}>
        <rect x="10" y="34" width="8" height="20" rx="2" />
        <rect x="22" y="22" width="8" height="32" rx="2" />
        <rect x="34" y="12" width="8" height="42" rx="2" />
        <rect x="46" y="28" width="8" height="26" rx="2" opacity="0.65" />
      </g>
    );
  }
  if (kind === 2) {
    return (
      <g fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round">
        <path d="M6 24q7-9 13 0t13 0t13 0t13 0" />
        <path d="M6 40q7-9 13 0t13 0t13 0t13 0" opacity="0.65" />
      </g>
    );
  }
  return (
    <g>
      <path d="M32 6 A26 26 0 0 1 58 32 L50 32 A18 18 0 0 0 32 14 Z" fill={fg} />
      <circle cx="22" cy="42" r="9" fill={fg} opacity="0.65" />
      <circle cx="48" cy="48" r="4" fill={fg} />
    </g>
  );
}

export function SpotArt({ seed, size = 40 }) {
  const h = hashSeed(seed);
  const [bg, fg] = PALETTES[h % PALETTES.length];
  const kind = (h >> 2) % 4;
  const flip = (h >> 4) % 2 === 1;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ borderRadius: "inherit", display: "block" }}
    >
      <rect width="64" height="64" fill={bg} />
      <g transform={flip ? "translate(64,0) scale(-1,1)" : undefined}>
        <Motif kind={kind} fg={fg} />
      </g>
    </svg>
  );
}
