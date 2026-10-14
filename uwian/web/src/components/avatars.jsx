// Preset profile pictures.
// CLASSIC_IDS: the original hand-drawn geometric marks. Still renderable and
// still accepted by the server, so nobody's existing picture ever breaks —
// but the picker only offers the chibi set now.
// Mirrors the server allowlist AVATAR_IDS in server/src/index.js.
const CLASSIC_IDS = ["sun", "moon", "star", "bolt", "wave", "peak", "bloom", "orbit"];
export const CHIBI_IDS = ["emo-boy", "emo-girl", "skater", "preppy", "goth", "sporty", "artist", "softie"];
export const CHIBI_LABELS = {
  "emo-boy": "Emo Boy",
  "emo-girl": "Emo Girl",
  skater: "Skater",
  preppy: "Preppy",
  goth: "Goth",
  sporty: "Sporty",
  artist: "Artist",
  softie: "Softie",
};
export const AVATAR_IDS = [...CLASSIC_IDS, ...CHIBI_IDS];

const T = ({ bg, children }) => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect width="48" height="48" fill={bg} />
    {children}
  </svg>
);

const ART = {
  sun: (
    <T bg="#FCE9C8">
      <g stroke="#8F4A12" strokeWidth="3" strokeLinecap="round">
        <line x1="24" y1="6" x2="24" y2="11" />
        <line x1="24" y1="37" x2="24" y2="42" />
        <line x1="6" y1="24" x2="11" y2="24" />
        <line x1="37" y1="24" x2="42" y2="24" />
        <line x1="11" y1="11" x2="14.5" y2="14.5" />
        <line x1="33.5" y1="33.5" x2="37" y2="37" />
        <line x1="37" y1="11" x2="33.5" y2="14.5" />
        <line x1="14.5" y1="33.5" x2="11" y2="37" />
      </g>
      <circle cx="24" cy="24" r="9" fill="#E8831F" />
    </T>
  ),
  moon: (
    <T bg="#DFE8F7">
      <circle cx="24" cy="24" r="13" fill="#1A2F4B" />
      <circle cx="30" cy="19" r="11" fill="#DFE8F7" />
      <circle cx="15" cy="14" r="1.8" fill="#1A2F4B" />
      <circle cx="36" cy="34" r="1.8" fill="#1A2F4B" />
    </T>
  ),
  star: (
    <T bg="#FDE2D7">
      <polygon
        points="24,7 28.7,19.5 42,20 31.5,28.5 35,41.5 24,34 13,41.5 16.5,28.5 6,20 19.3,19.5"
        fill="#B34424"
      />
    </T>
  ),
  bolt: (
    <T bg="#FCF1D6">
      <polygon points="27,5 14,28 22.5,28 20,43 33,21 24.5,21" fill="#7F6317" />
    </T>
  ),
  wave: (
    <T bg="#DBEFE4">
      <g fill="none" stroke="#1E5C3B" strokeWidth="4" strokeLinecap="round">
        <path d="M4 19q6-8 12 0t12 0 12 0" />
        <path d="M4 30q6-8 12 0t12 0t12 0" />
      </g>
    </T>
  ),
  peak: (
    <T bg="#F3E8FD">
      <polygon points="4,40 17,15 30,40" fill="#5B2E91" />
      <polygon points="20,40 32,20 44,40" fill="#8B5CB6" />
      <polygon points="14.2,20.5 17,15 19.8,20.5 17,22.5" fill="#fff" />
    </T>
  ),
  bloom: (
    <T bg="#FCE2D7">
      <g fill="#B34424">
        <circle cx="24" cy="12" r="6" />
        <circle cx="34.5" cy="18" r="6" />
        <circle cx="34.5" cy="30" r="6" />
        <circle cx="24" cy="36" r="6" />
        <circle cx="13.5" cy="30" r="6" />
        <circle cx="13.5" cy="18" r="6" />
      </g>
      <circle cx="24" cy="24" r="5.5" fill="#431E14" />
    </T>
  ),
  orbit: (
    <T bg="#E8F5EE">
      <circle cx="24" cy="24" r="10" fill="#1E7E5C" />
      <ellipse cx="24" cy="24" rx="17" ry="6.5" fill="none" stroke="#1E7E5C" strokeWidth="3" transform="rotate(-20 24 24)" />
      <circle cx="38" cy="17" r="2.5" fill="#1E7E5C" />
    </T>
  ),

  /* ---------- Chibi crew: hand-drawn characters, one per id ----------
     Shared anatomy on the 48 grid: head circle (24,20.5) r13, body below.
     Paint order per entry: background → back hair → body → head → fringe →
     face → accessories. */
  "emo-boy": (
    <T bg="#2b2f4a">
      <circle cx="24" cy="17" r="15" fill="#17171f" />
      <rect x="15" y="36" width="18" height="12" rx="5" fill="#3a3f5c" />
      <line x1="21" y1="38.5" x2="21" y2="44" stroke="#c9cede" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="27" y1="38.5" x2="27" y2="44" stroke="#c9cede" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="24" cy="20.5" r="13" fill="#ffd9c0" />
      <path d="M10.5 23 L10 15 Q11 5 24 4.5 Q37 5 38 15 L37.5 23 L34.5 15.5 L31.5 21 L28 13.5 L24.5 19 L20.5 13 L17 19.5 L14 15 Z" fill="#17171f" />
      <ellipse cx="18.5" cy="23.5" rx="2.5" ry="3" fill="#fff" />
      <circle cx="18.5" cy="24" r="1.4" fill="#23232e" />
      <circle cx="19.3" cy="23" r="0.55" fill="#fff" />
      <path d="M15.5 21 Q18.5 19.5 21.5 21" stroke="#23232e" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M15.5 21 L13.8 20" stroke="#23232e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M29 22 L34 21" stroke="#0c0c12" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15.5 17.5 L21 18.5" stroke="#17171f" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="15" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.35" />
      <ellipse cx="33" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.35" />
      <path d="M21 29 Q25 30.5 28.5 27.5" stroke="#8a4a3a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="27.8" cy="29.8" r="0.9" fill="none" stroke="#c9cede" strokeWidth="0.8" />
    </T>
  ),
  "emo-girl": (
    <T bg="#3a2340">
      <circle cx="24" cy="18" r="15.5" fill="#23232e" />
      <rect x="8" y="18" width="6" height="17" rx="3" fill="#23232e" />
      <rect x="34" y="18" width="6" height="17" rx="3" fill="#23232e" />
      <rect x="15" y="36" width="18" height="12" rx="5" fill="#2c2136" />
      <rect x="20" y="32.5" width="8" height="2.4" rx="1.2" fill="#14141c" />
      <circle cx="24" cy="32.5" r="0.9" fill="#c9cede" />
      <circle cx="24" cy="20.5" r="13" fill="#f2b88f" />
      <path d="M11 20 Q12 8 24 7.5 Q36 8 37 20 Q30 13 24 15 Q17 13 11 20 Z" fill="#23232e" />
      <path d="M33 12 Q36 20 34.5 30" stroke="#ff6fa5" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <ellipse cx="18.5" cy="23.5" rx="2.5" ry="3" fill="#fff" />
      <ellipse cx="29.5" cy="23.5" rx="2.5" ry="3" fill="#fff" />
      <circle cx="18.5" cy="24" r="1.4" fill="#2b1a2e" />
      <circle cx="29.5" cy="24" r="1.4" fill="#2b1a2e" />
      <circle cx="19.3" cy="23" r="0.55" fill="#fff" />
      <circle cx="30.3" cy="23" r="0.55" fill="#fff" />
      <path d="M15.5 21 Q18.5 19.3 21.5 21" stroke="#1a1a24" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M26.5 21 Q29.5 19.3 32.5 21" stroke="#1a1a24" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M15.5 21 L13.6 19.8 M32.5 21 L34.4 19.8" stroke="#1a1a24" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="15" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.45" />
      <ellipse cx="33" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.45" />
      <ellipse cx="24" cy="29.3" rx="1.7" ry="1.3" fill="#a34a5e" />
      <polygon points="35,9 38.5,7 38.5,12" fill="#ff6fa5" />
      <polygon points="35,9 31.5,7 31.5,12" fill="#ff6fa5" />
      <circle cx="35" cy="9.5" r="1.6" fill="#d64a86" />
    </T>
  ),
  skater: (
    <T bg="#d8ecf5">
      <rect x="9" y="16" width="5" height="14" rx="2.5" fill="#4a2f1d" />
      <rect x="34" y="16" width="5" height="14" rx="2.5" fill="#4a2f1d" />
      <rect x="15" y="36" width="18" height="12" rx="5" fill="#f5f0e6" />
      <rect x="15" y="41" width="18" height="3" fill="#2f6bff" />
      <circle cx="24" cy="20.5" r="13" fill="#c98a5e" />
      <path d="M11 16 Q11 3 24 3 Q37 3 37 16 L37 13 Q24 8 11 13 Z" fill="#e4572e" />
      <ellipse cx="12" cy="13.5" rx="5.5" ry="2.6" fill="#c74527" />
      <circle cx="24" cy="4.5" r="1.6" fill="#c74527" />
      <circle cx="18.5" cy="22.5" r="3.2" fill="#fff" />
      <circle cx="29.5" cy="22.5" r="3.2" fill="#fff" />
      <circle cx="18.5" cy="22.8" r="1.7" fill="#241812" />
      <circle cx="29.5" cy="22.8" r="1.7" fill="#241812" />
      <circle cx="19.5" cy="21.8" r="1" fill="#fff" />
      <circle cx="30.5" cy="21.8" r="1" fill="#fff" />
      <circle cx="14.5" cy="26" r="0.8" fill="#8a5a3b" />
      <circle cx="16.5" cy="27" r="0.8" fill="#8a5a3b" />
      <circle cx="33.5" cy="26" r="0.8" fill="#8a5a3b" />
      <circle cx="31.5" cy="27" r="0.8" fill="#8a5a3b" />
      <path d="M19 27.5 Q24 32.5 29 27.5 Q24 29 19 27.5 Z" fill="#7a2e2e" />
      <rect x="20.5" y="27.6" width="7" height="1.6" rx="0.8" fill="#fff" />
    </T>
  ),
  preppy: (
    <T bg="#e9f7ef">
      <circle cx="24" cy="17" r="14.5" fill="#b07a3f" />
      <rect x="15" y="36" width="18" height="12" rx="5" fill="#ffffff" />
      <path d="M20 37 L24 41.5 L28 37" fill="none" stroke="#9db4d0" strokeWidth="1.6" />
      <line x1="24" y1="41.5" x2="24" y2="45" stroke="#9db4d0" strokeWidth="1.4" />
      <circle cx="24" cy="20.5" r="13" fill="#ffd9c0" />
      <path d="M11.5 19 Q12 7 24 6.5 Q30 6.5 33 9 Q28 9.5 24 12 Q18 10 15 14 Q12.5 16 11.5 19 Z" fill="#b07a3f" />
      <circle cx="18.5" cy="22.5" r="3.2" fill="#fff" />
      <circle cx="29.5" cy="22.5" r="3.2" fill="#fff" />
      <circle cx="18.5" cy="22.8" r="1.7" fill="#3a2a1a" />
      <circle cx="29.5" cy="22.8" r="1.7" fill="#3a2a1a" />
      <circle cx="19.5" cy="21.8" r="1" fill="#fff" />
      <circle cx="30.5" cy="21.8" r="1" fill="#fff" />
      <ellipse cx="15" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.5" />
      <ellipse cx="33" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.5" />
      <path d="M20 28.5 Q24 31 28 28.5" stroke="#8a4a3a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <polygon points="36,8 37.2,10.6 40,11 37.6,12.8 38,15.6 35.6,14.2 33.2,15.4 33.8,12.6 31.8,10.8 34.6,10.6" fill="#fff" opacity="0.9" />
    </T>
  ),
  goth: (
    <T bg="#1f1b2d">
      <rect x="9" y="6" width="30" height="33" rx="13" fill="#0f0f16" />
      <rect x="15" y="36" width="18" height="12" rx="5" fill="#262033" />
      <circle cx="24" cy="31" r="1" fill="#c9cede" />
      <rect x="19.5" y="32" width="9" height="2.6" rx="1.3" fill="#0c0c12" />
      <circle cx="24" cy="33.3" r="0.9" fill="#c9cede" />
      <circle cx="24" cy="20.5" r="13" fill="#f5e6da" />
      <path d="M11 21 Q11 7 24 7 Q37 7 37 21 L34 21 Q34 12 24 12 Q14 12 14 21 Z" fill="#0f0f16" />
      <line x1="24" y1="7" x2="24" y2="11" stroke="#2c2c3a" strokeWidth="1.6" />
      <ellipse cx="18.5" cy="23" rx="3.4" ry="4" fill="#7a4a8f" opacity="0.55" />
      <ellipse cx="29.5" cy="23" rx="3.4" ry="4" fill="#7a4a8f" opacity="0.55" />
      <ellipse cx="18.5" cy="23.5" rx="2.4" ry="2.9" fill="#fff" />
      <ellipse cx="29.5" cy="23.5" rx="2.4" ry="2.9" fill="#fff" />
      <circle cx="18.5" cy="24" r="1.35" fill="#1c1024" />
      <circle cx="29.5" cy="24" r="1.35" fill="#1c1024" />
      <path d="M15.5 21 Q18.5 19.5 21.5 21" stroke="#0f0f16" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M26.5 21 Q29.5 19.5 32.5 21" stroke="#0f0f16" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="24" cy="29" rx="2.2" ry="1.4" fill="#5b2340" />
    </T>
  ),
  sporty: (
    <T bg="#fdeeda">
      <circle cx="24" cy="17" r="14" fill="#14100c" />
      <circle cx="38" cy="27" r="5" fill="#14100c" />
      <rect x="15" y="36" width="18" height="12" rx="5" fill="#e4572e" />
      <path d="M15 40 L33 40" stroke="#fff" strokeWidth="2" />
      <circle cx="24" cy="20.5" r="13" fill="#8a5a3b" />
      <rect x="11" y="11.5" width="26" height="6.5" rx="3.2" fill="#2f6bff" />
      <line x1="16" y1="12.5" x2="16" y2="17" stroke="#fff" strokeWidth="1.2" />
      <line x1="32" y1="12.5" x2="32" y2="17" stroke="#fff" strokeWidth="1.2" />
      <ellipse cx="18.5" cy="23" rx="2.6" ry="3" fill="#fff" />
      <ellipse cx="29.5" cy="23" rx="2.6" ry="3" fill="#fff" />
      <circle cx="18.5" cy="22.4" r="1.45" fill="#1d130c" />
      <circle cx="29.5" cy="22.4" r="1.45" fill="#1d130c" />
      <circle cx="19.2" cy="21.7" r="0.55" fill="#fff" />
      <circle cx="30.2" cy="21.7" r="0.55" fill="#fff" />
      <path d="M15.5 18.5 L21 20 M32.5 18.5 L27 20" stroke="#14100c" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="15" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.4" />
      <ellipse cx="33" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.4" />
      <path d="M18.5 27.5 Q24 33.5 29.5 27.5 Q24 29.5 18.5 27.5 Z" fill="#5e2b1e" />
      <path d="M35.5 15.5 q2.2 3.2 0 5 q-2.2 -1.8 0 -5" fill="#7ab8ff" />
    </T>
  ),
  artist: (
    <T bg="#f3e8fd">
      <circle cx="24" cy="17" r="14.5" fill="#3d2560" />
      <circle cx="30" cy="5.5" r="5" fill="#3d2560" />
      <rect x="15" y="36" width="18" height="12" rx="5" fill="#7a83ff" />
      <rect x="21" y="38" width="6" height="5" rx="1" fill="#5a63d8" />
      <circle cx="31" cy="27" r="1.2" fill="#2f6bff" />
      <circle cx="24" cy="20.5" r="13" fill="#f2b88f" />
      <path d="M11 20 Q12 8 24 7.5 Q36 8 37 20 Q33 13 30 15 Q31 10 27 9 Q22 8 18 12 Q13 13 11 20 Z" fill="#3d2560" />
      <ellipse cx="16" cy="8" rx="8" ry="4" fill="#c22f4f" transform="rotate(-15 16 8)" />
      <circle cx="22.5" cy="6" r="1.1" fill="#c22f4f" />
      <ellipse cx="18.5" cy="23" rx="2.6" ry="3" fill="#fff" />
      <ellipse cx="29.5" cy="23" rx="2.6" ry="3" fill="#fff" />
      <circle cx="19.2" cy="23.2" r="1.45" fill="#33231a" />
      <circle cx="30.2" cy="23.2" r="1.45" fill="#33231a" />
      <circle cx="20" cy="22.4" r="0.55" fill="#fff" />
      <circle cx="31" cy="22.4" r="0.55" fill="#fff" />
      <ellipse cx="15" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.5" />
      <ellipse cx="33" cy="26.5" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.5" />
      <path d="M21.5 28.5 Q22.5 29.5 23.5 28.5 Q24.5 29.5 25.5 28.5" stroke="#8a4a3a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </T>
  ),
  softie: (
    <T bg="#ffeef4">
      <circle cx="14" cy="13" r="6.5" fill="#f7b8c4" />
      <circle cx="24" cy="9" r="7.5" fill="#f7b8c4" />
      <circle cx="34" cy="13" r="6.5" fill="#f7b8c4" />
      <rect x="15" y="36" width="18" height="12" rx="6" fill="#fff7ea" />
      <line x1="18" y1="38" x2="18" y2="46" stroke="#e8d5b8" strokeWidth="1.2" />
      <line x1="24" y1="38" x2="24" y2="46" stroke="#e8d5b8" strokeWidth="1.2" />
      <line x1="30" y1="38" x2="30" y2="46" stroke="#e8d5b8" strokeWidth="1.2" />
      <circle cx="24" cy="20.5" r="13" fill="#ffd9c0" />
      <path d="M11.5 19 Q12 10 20 9 Q16 12 16 16 Q13 16 11.5 19 Z" fill="#f7b8c4" />
      <path d="M36.5 19 Q36 10 28 9 Q32 12 32 16 Q35 16 36.5 19 Z" fill="#f7b8c4" />
      <path d="M15.8 23 Q18.5 20.2 21.2 23" stroke="#3a2a2a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M26.8 23 Q29.5 20.2 32.2 23" stroke="#3a2a2a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="15" cy="26" rx="2.8" ry="1.8" fill="#ff8fa3" opacity="0.65" />
      <ellipse cx="33" cy="26" rx="2.8" ry="1.8" fill="#ff8fa3" opacity="0.65" />
      <ellipse cx="24" cy="28.5" rx="2.6" ry="2.4" fill="#8a3b3b" />
    </T>
  ),
};

export function isAvatarId(v) {
  return AVATAR_IDS.includes(v);
}

export function AvatarArt({ id, size = 36, className = "" }) {
  if (!isAvatarId(id)) return null;
  return (
    <span
      className={`inline-grid shrink-0 place-items-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span style={{ width: size, height: size, display: "grid" }}>{ART[id]}</span>
    </span>
  );
}
