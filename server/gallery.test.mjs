const password = randomBytes(24).toString("hex");
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "./app.mjs";
import { openStore, createUser, listRecords, decodePhoto } from "./store.mjs";
import { fixture as seed, populateTestStore } from "./fixtures/records.mjs";

const jpeg = readFileSync(new URL("./fixtures/photo.jpg", import.meta.url));
const photoData = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

test("gallery photos, unique custom codes, deletion, and empty library", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rhine-gallery-"));
  const path = join(dir, "test.sqlite");
  let db = openStore(path);
  populateTestStore(db);
  createUser(db, "admin", password, "admin");
  createUser(db, "reader", password, "reader");
  const app = createApp({ db });
  await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  async function request(path, method = "GET", body, auth) {
    const response = await fetch(origin + path, { method, headers: { Origin: origin, "Content-Type":"application/json", ...(auth ? { Cookie:auth.cookie, "X-CSRF-Token":auth.csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get("content-type") === "image/jpeg") return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
    return { status:response.status, ...await response.json(), cookie:response.headers.get("set-cookie")?.split(";")[0] };
  }
  try {
    const admin = await request("/api/login", "POST", {username:"admin",password:password});
    const reader = await request("/api/login", "POST", {username:"reader",password:password});
    const guest = await request("/api/guest", "POST", {});
    const record = { ...seed.records[0], codeSuffix:"photo-2026", category:seed.columns[2], photoData };
    const created = await request("/api/archives", "POST", record, admin);
    assert.equal(created.status, 201);
    assert.equal(created.record.id, "X-PHOTO-2026");
    assert.match(created.record.photo, /^\/api\/photos\/[a-f0-9]{64}$/);
    assert.equal((await request(created.record.photo)).status, 401);
    assert.deepEqual((await request(created.record.photo,"GET",undefined,guest)).bytes, jpeg);
    assert.deepEqual((await request(created.record.photo,"GET",undefined,reader)).bytes, jpeg);
    assert.equal((await request("/api/archives","POST",record,reader)).status,403);
    assert.equal((await request(`/api/archives/${created.record.id}`,"DELETE",{version:1},reader)).status,403);
    assert.equal((await request(`/api/archives/${created.record.id}`,"DELETE",{version:1},guest)).status,403);
    assert.equal((await request("/api/archives","POST",record,admin)).status,409);
    assert.equal((await request("/api/archives","POST",{...record,codeSuffix:"0001"},admin)).status,409);
    for (const codeSuffix of ["../bad", "a".repeat(25), 123, "包含空格 "]) assert.equal((await request("/api/archives","POST",{...record,codeSuffix},admin)).status,400);
    assert.equal((await request("/api/archives","POST",{...record,codeSuffix:"invalid",photoData:"data:image/svg+xml;base64,PHN2Zy8+"},admin)).status,400);
    assert.equal((await request("/api/archives","POST",{...record,codeSuffix:"invalid",category:seed.columns[0]},admin)).status,400);
    const race = await Promise.all([1,2].map(()=>request("/api/archives","POST",{...record,codeSuffix:"RACE"},admin)));
    assert.deepEqual(race.map(r=>r.status).sort(), [201,409]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photos").get().n,1,"duplicate image is stored once");
    const renamed = await request(`/api/archives/${created.record.id}`,"PUT",{...created.record,codeSuffix:"TRAVEL_01"},admin);
    assert.equal(renamed.record.id,"X-TRAVEL_01");
    assert.equal(renamed.record.photo,created.record.photo,"text edits retain photo");
    assert.equal((await request("/api/archives/X-TRAVEL_01","PUT",{...renamed.record,codeSuffix:"001"},admin)).status,409);
    assert.equal((await request("/api/archives/X-TRAVEL_01","DELETE",{version:1},admin)).status,409);
    const removedPhoto = await request("/api/archives/X-TRAVEL_01","PUT",{...renamed.record,removePhoto:true},admin);
    assert.equal(removedPhoto.record.photo,undefined);
    assert.equal((await request(created.record.photo,"GET",undefined,guest)).status,200,"shared photo retained by another archive");
    const all = (await request("/api/archives","GET",undefined,admin)).records;
    for (const r of all) assert.equal((await request(`/api/archives/${r.id}`,"DELETE",{version:r.version},admin)).status,200);
    assert.equal((await request("/api/archives","GET",undefined,guest)).records.length,0);
    assert.equal((await request(created.record.photo,"GET",undefined,guest)).status,404);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photos").get().n,0);
    assert.equal((await request("/api/archives/X-001","DELETE",{version:1},admin)).status,404);
    const fresh = await request("/api/archives","POST",record,admin);
    assert.equal(fresh.status,201,"deleted code may be used again");
    assert.ok(db.prepare("SELECT id FROM records").get().id > 42,"internal IDs are never reused");
    app.closeAllConnections(); await new Promise(resolve=>app.close(resolve));
    db.close(); db=openStore(path);
    assert.equal(listRecords(db)[0].photo,created.record.photo);
    assert.deepEqual(Buffer.from(db.prepare("SELECT bytes FROM photos").get().bytes),jpeg);
    assert.throws(()=>decodePhoto("data:image/jpeg;base64,"+jpeg.subarray(0,40).toString("base64")));
  } finally {
    if (app.listening) { app.closeAllConnections(); await new Promise(resolve=>app.close(resolve)); }
    db.close(); await rm(dir,{recursive:true,force:true});
  }
});

test("migrate an existing database without overwriting user content", async () => {
  const dir=await mkdtemp(join(tmpdir(),"rhine-migration-"));
  const path=join(dir,"old.sqlite");
  const old=new DatabaseSync(path);
  old.exec("CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO metadata VALUES('seeded','1');");
  old.prepare("INSERT INTO records(id,data,version) VALUES(?,?,?)").run(41,JSON.stringify({...seed.records[0],id:"X-041",title:"已有用户内容"}),3);
  old.close();
  const migrated=openStore(path);
  try {
    assert.equal(listRecords(migrated).length,1);
    assert.equal(listRecords(migrated)[0].title,"已有用户内容");
    assert.equal(migrated.prepare("SELECT code,version FROM records").get().code,"X-041");
    assert.equal(listRecords(migrated)[0].version,3);
  } finally { migrated.close(); await rm(dir,{recursive:true,force:true}); }
});
