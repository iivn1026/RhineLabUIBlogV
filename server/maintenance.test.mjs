const password = randomBytes(24).toString("hex");
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, createUser, listRecords, verifyPassword } from "./store.mjs";
import { clearArchives } from "./maintenance.mjs";
import { populateTestStore } from "./fixtures/records.mjs";

test("empty installation, backup, content removal and restart without reseeding", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rhine-clear-"));
  const path = join(dir, "blog.sqlite"), snapshot = join(dir, "backup.sqlite");
  let db = openStore(path);
  try {
    assert.deepEqual(listRecords(db), []);
    createUser(db, "admin", password, "admin");
    populateTestStore(db);
    db.prepare("INSERT INTO photos VALUES(?,?)").run("test-photo", Buffer.from("fixture"));
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run("test-session", 1, "csrf", Date.now() + 10000);
    assert.equal(await clearArchives(db, snapshot), 40);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photos").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    assert.ok(verifyPassword(password, db.prepare("SELECT password_hash FROM users").get().password_hash));
    db.close(); db = openStore(path);
    assert.deepEqual(listRecords(db), [], "restart must never repopulate the library");
    const restored = openStore(snapshot);
    try {
      assert.equal(listRecords(restored).length, 40);
      assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM photos").get().n, 1);
      assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
    } finally { restored.close(); }
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});
