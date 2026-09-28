import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.mjs";
import { openStore, createUser, listRecords, verifyPassword } from "./store.mjs";
import { populateTestStore } from "./fixtures/records.mjs";

test("account management authorization, password revocation and isolated persistent bookmarks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rhine-accounts-"));
  const path = join(dir, "test.sqlite");
  let db = openStore(path);
  populateTestStore(db);
  const password = randomBytes(24).toString("hex"), changed = randomBytes(24).toString("hex");
  for (const [name, role] of [["admin", "admin"], ["reader", "reader"], ["other", "reader"]]) createUser(db, name, password, role);
  let server = createApp({ db }), origin;
  async function start() { await new Promise(r => server.listen(0, "127.0.0.1", r)); origin = `http://127.0.0.1:${server.address().port}`; }
  async function stop() { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  async function request(path, method = "GET", data, auth, extra = {}) {
    const res = await fetch(origin + path, { method, headers: { Origin: origin, "Content-Type": "application/json", ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf } : {}), ...extra }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: res.status, ...await res.json(), cookie: res.headers.get("set-cookie")?.split(";")[0] };
  }
  const login = (username, secret = password) => request("/api/login", "POST", { username, password: secret });
  await start();
  try {
    const admin = await login("admin"), adminOtherSession = await login("admin");
    let reader = await login("reader");
    const other = await login("other"), guest = await request("/api/guest", "POST", {});
    const users = await request("/api/users", "GET", undefined, admin);
    assert.equal(users.status, 200);
    assert.deepEqual(users.users.map(u => Object.keys(u).sort()), Array(3).fill(["id", "role", "self", "username"]));
    const self = users.users.find(u => u.self), target = users.users.find(u => u.username === "reader");
    for (const auth of [reader, guest]) {
      assert.equal((await request("/api/users", "GET", undefined, auth)).status, 403);
      assert.equal((await request(`/api/users/${target.id}`, "DELETE", { confirmUsername: "reader" }, auth)).status, 403);
      assert.equal((await request(`/api/users/${self.id}/password`, "PUT", { username: "admin", newPassword: changed }, auth)).status, 403);
    }
    assert.equal((await request("/api/users")).status, 401);
    assert.equal((await request(`/api/users/${self.id}`, "DELETE", { confirmUsername: "admin" }, admin)).status, 400);
    assert.equal((await request(`/api/users/${target.id}`, "DELETE", { confirmUsername: "wrong" }, admin)).status, 400);
    assert.equal((await request(`/api/users/${target.id}/password`, "PUT", { username: "reader", newPassword: changed }, admin, { "X-CSRF-Token": "wrong" })).status, 403);
    assert.equal((await request(`/api/users/${target.id}`, "DELETE", { confirmUsername: "reader" }, admin, { Origin: "https://wrong.invalid" })).status, 403);

    const record = listRecords(db)[0];
    const bookmark = `/api/bookmarks/${record.id}`;
    assert.equal((await request("/api/bookmarks", "GET", undefined, guest)).status, 403);
    assert.equal((await request(bookmark, "PUT", {}, guest)).status, 403);
    assert.equal((await request(bookmark, "PUT", {}, reader, { "X-CSRF-Token": "wrong" })).status, 403);
    assert.equal((await request(bookmark, "PUT", {}, reader, { Origin: "https://wrong.invalid" })).status, 403);
    assert.deepEqual((await request(bookmark, "PUT", { userId: self.id }, reader)).bookmarks, [record.id]);
    assert.deepEqual((await request(bookmark, "PUT", {}, reader)).bookmarks, [record.id]);
    for (const auth of [admin, other]) assert.deepEqual((await request("/api/bookmarks", "GET", undefined, auth)).bookmarks, []);
    assert.deepEqual((await request(bookmark, "DELETE", {}, reader)).bookmarks, []);
    await request(bookmark, "PUT", {}, reader);
    assert.equal((await request("/api/bookmarks/X-MISSING", "PUT", {}, reader)).status, 404);
    assert.equal((await request(`/api/archives/${record.id}`, "PUT", record, reader)).status, 403);
    // Stable internal keys retain bookmarks when a display code changes.
    const renamed = await request(`/api/archives/${record.id}`, "PUT", { ...record, codeSuffix: "RENAMED" }, admin);
    assert.equal(renamed.status, 200);
    assert.deepEqual((await request("/api/bookmarks", "GET", undefined, reader)).bookmarks, ["X-RENAMED"]);
    await stop(); db.close(); db = openStore(path); server = createApp({ db }); await start();
    assert.deepEqual((await request("/api/bookmarks", "GET", undefined, reader)).bookmarks, ["X-RENAMED"]);

    const passwordPath = `/api/users/${target.id}/password`;
    assert.equal((await request(passwordPath, "PUT", { username: "stale-name", newPassword: changed }, admin)).status, 409);
    for (const invalid of [null, "short", "a".repeat(129)]) assert.equal((await request(passwordPath, "PUT", { username: "reader", newPassword: invalid }, admin)).status, 400);
    assert.equal((await request(passwordPath, "PUT", { username: "reader", newPassword: changed }, admin)).status, 200);
    assert.equal((await request("/api/archives", "GET", undefined, reader)).status, 401);
    assert.equal((await login("reader")).status, 401);
    reader = await login("reader", changed); assert.equal(reader.status, 200);
    assert.deepEqual((await request("/api/bookmarks", "GET", undefined, reader)).bookmarks, ["X-RENAMED"]);
    const ownPath = `/api/users/${self.id}/password`;
    assert.equal((await request(ownPath, "PUT", { username: "admin", newPassword: changed, currentPassword: "wrong" }, admin)).status, 400);
    assert.equal((await request(ownPath, "PUT", { username: "admin", newPassword: changed, currentPassword: password }, admin)).status, 200);
    assert.equal((await request("/api/users", "GET", undefined, adminOtherSession)).status, 401);
    assert.equal((await request("/api/users", "GET", undefined, admin)).status, 200);
    assert.equal((await login("admin")).status, 401);
    assert.equal((await login("admin", changed)).status, 200);
    assert.ok(verifyPassword(changed, db.prepare("SELECT password_hash FROM users WHERE id=?").get(self.id).password_hash));
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes(changed));
    const contentBeforeDelete = listRecords(db);
    assert.equal((await request(`/api/users/${target.id}`, "DELETE", { confirmUsername: "reader" }, admin)).status, 200);
    assert.equal((await request("/api/archives", "GET", undefined, reader)).status, 401);
    assert.equal((await login("reader", changed)).status, 401);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE user_id=?").get(target.id).n, 0);
    assert.deepEqual(listRecords(db), contentBeforeDelete);
    assert.equal((await request(`/api/users/${target.id}`, "DELETE", { confirmUsername: "reader" }, admin)).status, 404);
    await request("/api/bookmarks/X-RENAMED", "PUT", {}, other);
    assert.equal((await request("/api/archives/X-RENAMED", "DELETE", { version: renamed.record.version }, admin)).status, 200);
    assert.deepEqual((await request("/api/bookmarks", "GET", undefined, other)).bookmarks, []);
  } finally { await stop(); db.close(); await rm(dir, { recursive: true, force: true }); }
});
