// Money helpers — every amount is an INTEGER number of centavos.
// We never touch floats for arithmetic. Display formatting divides by 100 only at render time.

export function pesoToCentavos(input) {
  // Accepts "100", "100.5", "100.25", or a number that came from a peso input.
  const s = String(input).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Halaga hindi valid: " + s);
  const [whole, frac = ""] = s.split(".");
  const cents = (frac + "00").slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

export function formatPeso(centavos) {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}₱${pesos.toLocaleString("en-PH")}.${cents}`;
}
