/* App icon: the official uwian mark (web/public/uwian-icon.svg).
   Full-color vector art, so no ElectricLogo tracing and no reduced-motion
   variant needed — a static img is already motion-free. */

/* Legacy U-house mark, kept only because the boot loader's MetallicPaint
   traces it. Do not use for new placements — use /uwian-icon.svg. */
const ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M5 29 16 15l11 14z" fill="#fff"/><rect x="9" y="28" width="14" height="22" fill="#fff"/><path d="M37 29 48 15l11 14z" fill="#fff"/><rect x="41" y="28" width="14" height="22" fill="#fff"/><rect x="9" y="44" width="46" height="6" fill="#fff"/><rect x="29" y="38" width="6" height="12" rx="1" fill="#1D4ED8"/></svg>`;

export const UHOUSE_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ART)}`;

export function OfficialLogo({ size = 20 }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Uwian home"
    >
      <img
        src="/uwian-icon.svg"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}
