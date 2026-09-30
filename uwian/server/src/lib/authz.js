// Friendly auth rules baked in here:
//  - 18+ gate at signup (self-declared birthdate; see docs/privacy.md for honest limits)
//  - no third-party trackers, passwords hashed, sessions are httpOnly cookies
import bcrypt from "bcryptjs";

export function ageOk(birthdate, minAge = 18) {
  if (!birthdate) return false;
  const b = new Date(birthdate);
  if (Number.isNaN(b)) return false;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= minAge;
}

export const hashPw = (pw) => bcrypt.hashSync(pw, 10);
export const checkPw = (pw, h) => bcrypt.compareSync(pw, h);
