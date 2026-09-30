import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const db = new Database(process.env.UWIAN_DB ?? path.join(__dirname, "..", "uwian.sqlite"));
db.exec("CREATE TABLE IF NOT EXISTS _schema_done (x INTEGER)");
if (!db.prepare("SELECT _rowid_ FROM _schema_done LIMIT 1").get()) {
  // idempotent: rewrite CREATE TABLE → CREATE TABLE IF NOT EXISTS so re-running never breaks
  const sql = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8")
    .replace(/^CREATE TABLE /gm, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE INDEX /gm, "CREATE INDEX IF NOT EXISTS ");
  db.exec(sql);
  db.prepare("INSERT INTO _schema_done VALUES (1)").run();
}
