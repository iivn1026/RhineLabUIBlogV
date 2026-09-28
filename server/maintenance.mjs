import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore, projectRoot } from "./store.mjs";

export async function backupStore(db, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  await backup(db, destination);
  return destination;
}

export async function clearArchives(db, destination) {
  // Stop the application before clearing so no writes occur after backup.
  await backupStore(db, destination);
  db.exec("BEGIN IMMEDIATE");
  try {
    const removed = db.prepare("SELECT COUNT(*) AS count FROM records").get().count;
    db.exec("DELETE FROM records; DELETE FROM photos; DELETE FROM sessions; DELETE FROM audit WHERE record_id IS NOT NULL;");
    db.prepare("INSERT INTO audit(action) VALUES(?)").run(`clear-archives:${removed}`);
    db.exec("COMMIT");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
    return removed;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, confirmation] = process.argv.slice(2);
  if (action !== "backup" && !(action === "clear-archives" && confirmation === "--confirm-delete-all"))
    throw new Error("Usage: node server/maintenance.mjs backup | clear-archives --confirm-delete-all (stop server before clearing)");
  const dataDir = resolve(process.env.DATA_DIR || resolve(projectRoot, ".local-data"));
  const destination = resolve(dataDir, "backups", `${action}-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
  const db = openStore();
  try {
    if (action === "backup") await backupStore(db, destination);
    else console.log(`Deleted archives: ${await clearArchives(db, destination)}`);
    console.log(`Backup: ${destination}`);
  } finally { db.close(); }
}
