import { pesoToCentavos } from "./money.js";

// Deterministic split of `amount` centavos among `participants` (array of user ids).
// Rule from the spec: base share for everyone; leftover centavos are handed out
// ONE AT A TIME in a fixed order (sorted by user id) so the result is identical
// on every run and on every device.
export function splitExpense(amountCentavos, participants) {
  if (!Number.isInteger(amountCentavos) || amountCentavos < 0)
    throw new Error("Amount must be integer centavos");
  const ids = [...new Set(participants)].sort(); // dedupe + stable order
  if (ids.length === 0) throw new Error("Walang kasama sa item na ito.");
  const base = Math.floor(amountCentavos / ids.length);
  const remainder = amountCentavos - base * ids.length;
  const shares = {};
  ids.forEach((id, i) => {
    shares[id] = base + (i < remainder ? 1 : 0);
  });
  return shares; // { userId: centavos }
}

// Who should be included automatically when an expense is logged.
// Friendly defaults, always overridable per-item in the UI:
//  - alcohol: everyone marked "in" who drinks, minus designated driver
//  - food / non-alcohol: everyone marked "in" (driver and non-drinkers included)
export function defaultParticipants({ isIn, isDrinker, isDesignatedDriver, isAlcohol }) {
  return Object.keys(isIn).filter((uid) => {
    if (!isIn[uid]) return false;
    if (isAlcohol && isDesignatedDriver[uid]) return false;
    if (isAlcohol && !isDrinker[uid]) return false;
    return true;
  });
}
