// Creates (or promotes) the Uwian staff account. Run any time:
//   node server/make-admin.js
// Staff is a site-wide role (users.role='admin'), separate from crew admins,
// who only ever govern their own crew via group_members.
import { db } from "./src/db.js";
import { hashPw } from "./src/lib/authz.js";

const EMAIL = process.env.UWIAN_ADMIN_EMAIL ?? "uwiandev@uwian.dev";
const NAME = process.env.UWIAN_ADMIN_NAME ?? "Uwian Dev";
const PW = process.env.UWIAN_ADMIN_PASSWORD ?? "UwianOps!2026";

const existing = db.prepare("SELECT id, role FROM users WHERE email=?").get(EMAIL);
let uid;
if (existing) {
  uid = existing.id;
  if (existing.role !== "admin") {
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(uid);
    console.log(`Promoted ${EMAIL} (id ${uid}) to staff.`);
  } else {
    console.log(`${EMAIL} (id ${uid}) is already staff.`);
  }
} else {
  const r = db.prepare("INSERT INTO users (name,email,password_hash,birthdate,role) VALUES (?,?,?,?, 'admin')")
    .run(NAME, EMAIL, hashPw(PW), "1990-01-01");
  uid = r.lastInsertRowid;
  console.log(`Created staff account ${EMAIL} (id ${uid}).`);
  console.log(`  password: ${PW}`);
  console.log("  Change it after first login, or override with UWIAN_ADMIN_* env vars.");
}
console.log(`Staff console: http://localhost:3000/admin`);
