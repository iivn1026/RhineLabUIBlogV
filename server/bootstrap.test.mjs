import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { openStore, projectRoot, verifyPassword } from "./store.mjs";
import { createApp } from "./app.mjs";

test("clean bootstrap uses stdin only, has no seeded accounts and survives restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rhine-bootstrap-"));
  let db, app;
  const password = randomBytes(24).toString("hex") + " trailing space ";
  const run = (args, input) => spawnSync(process.execPath, ["server/create-user.mjs", ...args], {
    cwd: projectRoot, env: { ...process.env, DATA_DIR: dir }, input, encoding: "utf8",
  });
  try {
    db = openStore(join(dir, "blog.sqlite"));
    for (const table of ["users", "sessions", "records", "photos", "bookmarks"])
      assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
    db.close(); db = undefined;
    assert.notEqual(run(["bootstrap_owner", "admin", "forbidden-extra-argument"], password).status, 0);
    assert.notEqual(run(["bootstrap_owner", "admin"], "short").status, 0);
    const created = run(["bootstrap_owner", "admin"], password + "\n");
    assert.equal(created.status, 0, created.stderr);
    assert.ok(!(created.stdout + created.stderr).includes(password));
    assert.notEqual(run(["bootstrap_owner", "admin"], password).status, 0);
    db = openStore(join(dir, "blog.sqlite"));
    assert.equal(db.prepare("SELECT count(*) AS n FROM users").get().n, 1);
    const user = db.prepare("SELECT * FROM users").get();
    assert.equal(user.role, "admin");
    assert.ok(verifyPassword(password, user.password_hash));
    app = createApp({ db });
    await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${app.address().port}`;
    const request = (path, input) => fetch(origin + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    assert.equal((await request("/api/login", { username: user.username, password })).status, 200);
    const guest = await request("/api/guest", {});
    assert.equal(guest.status, 200);
    const archives = await fetch(origin + "/api/archives", { headers: { Cookie: guest.headers.get("set-cookie").split(";")[0] } });
    assert.deepEqual((await archives.json()).records, []);
    assert.equal((await fetch(origin + "/.local-data/blog.sqlite")).status, 404);
  } finally {
    if (app?.listening) { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
    db?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
