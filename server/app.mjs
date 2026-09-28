import http from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore, projectRoot, site, labels, digest, verifyPassword, hashPassword, createUser, listRecords, validateRecord, archiveCode, decodePhoto } from "./store.mjs";

const failure = (status, message) => Object.assign(new Error(message), { status });
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json", ".glb":"model/gltf-binary", ".woff2":"font/woff2", ".svg":"image/svg+xml", ".jpg":"image/jpeg", ".png":"image/png", ".ogg":"audio/ogg", ".wav":"audio/wav", ".mp3":"audio/mpeg", ".pdf":"application/pdf", ".txt":"text/plain; charset=utf-8" };

export function createApp({ db = openStore(), staticRoot = resolve(projectRoot, "dist"), origin = process.env.APP_ORIGIN, secure = origin?.startsWith("https://"), now = Date.now } = {}) {
  if (origin && new URL(origin).origin !== origin) throw new Error("APP_ORIGIN must be an origin without path, query or trailing slash.");
  if (process.env.NODE_ENV === "production" && !origin?.startsWith("https://")) throw new Error("Production requires an HTTPS APP_ORIGIN.");
  const attempts = new Map();
  function rateLimit(key, limit) {
    const time = now();
    for (const [k, v] of attempts) if (v.until <= time) attempts.delete(k);
    const current = attempts.get(key) || { count: 0, until: time + 10 * 60 * 1000 };
    current.count++;
    attempts.set(key, current);
    if (current.count > limit) throw failure(429, "尝试过于频繁，请十分钟后再试。");
  }
  function session(req) {
    const token = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("rhine_session="))?.slice(14);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db.prepare("SELECT s.*, u.username, u.role FROM sessions s LEFT JOIN users u ON s.user_id=u.id WHERE token_hash=? AND expires>?").get(digest(token), now());
    return row || null;
  }
  const publicSession = s => s ? { user: { username: s.username || "游客", role: s.role || "guest" }, csrf: s.csrf } : { user: null };
  function setSession(req, res, userId) {
    const previous = session(req);
    if (previous) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(previous.token_hash);
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(now());
    const token = randomBytes(32).toString("hex"), csrf = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(digest(token), userId, csrf, now() + 12 * 3600000);
    res.setHeader("Set-Cookie", `rhine_session=${token}; HttpOnly; SameSite=Strict; Path=/${secure ? "; Secure" : ""}`);
    return publicSession(db.prepare("SELECT s.*,u.username,u.role FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_hash=?").get(digest(token)));
  }
  async function body(req, limit = 131072) {
    if (!req.headers["content-type"]?.startsWith("application/json")) throw failure(415, "请求必须使用 JSON。");
    let size = 0, chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw failure(413, "内容过长。");
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw failure(400, "无效 JSON。"); }
  }
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    const json = (status, value) => { res.writeHead(status, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" }); res.end(JSON.stringify(value)); };
    try {
      const path = new URL(req.url, "http://local").pathname;
      if (path === "/healthz" && ["GET", "HEAD"].includes(req.method)) {
        db.prepare("SELECT 1").get();
        return json(200, { status: "ok" });
      }
      if (path.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
        const s = session(req);
        if (!["GET", "HEAD"].includes(req.method)) {
          const expected = origin || `http://${req.headers.host}`;
          if (req.headers.origin !== expected) throw failure(403, "请求来源不受信任。");
          if (!["/api/login", "/api/guest", "/api/session/reset"].includes(path)) {
            if (!s) throw failure(401, "会话已过期，请重新登录。");
            if (req.headers["x-csrf-token"] !== s.csrf) throw failure(403, "请求验证失败，请刷新页面。");
          }
        }
        if (path === "/api/session" && req.method === "GET") return json(200, publicSession(s));
        // A new page entry revokes any previous identity, including guests.
        // Origin is required above; resetting grants no access and is idempotent.
        if (path === "/api/session/reset" && req.method === "POST") {
          if (s) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(s.token_hash);
          res.setHeader("Set-Cookie", `rhine_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? "; Secure" : ""}`);
          return json(200, { user: null });
        }
        if (path === "/api/login" && req.method === "POST") {
          rateLimit(`login:${req.socket.remoteAddress}`, 15);
          const input = await body(req);
          if (typeof input?.username !== "string" || typeof input?.password !== "string" || input.username.length > 32 || input.password.length > 128) throw failure(400, "请输入有效账户和密码。");
          const user = db.prepare("SELECT * FROM users WHERE username=?").get(input.username.trim());
          if (!verifyPassword(input.password, user?.password_hash) || !user) throw failure(401, "账户或密码错误。");
          return json(200, setSession(req, res, user.id));
        }
        if (path === "/api/guest" && req.method === "POST") {
          rateLimit(`guest:${req.socket.remoteAddress}`, 60);
          return json(200, setSession(req, res, null));
        }
        if (!s) throw failure(401, "请登录或选择游客浏览。");
        if (path === "/api/logout" && req.method === "POST") {
          db.prepare("DELETE FROM sessions WHERE token_hash=?").run(s.token_hash);
          res.setHeader("Set-Cookie", `rhine_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? "; Secure" : ""}`);
          return json(200, { ok: true });
        }
        if (path === "/api/archives" && req.method === "GET") return json(200, { categories: site.categories, columns: site.columns, labels, records: listRecords(db) });
        const imageMatch = path.match(/^\/api\/photos\/([a-f0-9]{64})$/);
        if (imageMatch && ["GET", "HEAD"].includes(req.method)) {
          const image = db.prepare("SELECT bytes FROM photos WHERE id=? AND EXISTS (SELECT 1 FROM records WHERE json_extract(data,'$.photo')=?)").get(imageMatch[1], path);
          if (!image) throw failure(404, "照片不存在。");
          res.writeHead(200, { "Content-Type":"image/jpeg", "Content-Length":image.bytes.length, "Cache-Control":"private, no-store" });
          return res.end(req.method === "HEAD" ? undefined : image.bytes);
        }
        const bookmarkMatch = path.match(/^\/api\/bookmarks\/(X-[A-Z0-9][A-Z0-9_-]{0,23})$/);
        if (path === "/api/bookmarks" || bookmarkMatch) {
          if (!s.user_id || !["admin", "reader"].includes(s.role)) throw failure(403, "请使用账户登录后收藏档案。");
          const bookmarks = () => db.prepare("SELECT r.code FROM bookmarks b JOIN records r ON b.record_id=r.id WHERE b.user_id=? ORDER BY r.id").all(s.user_id).map(r => r.code);
          if (path === "/api/bookmarks" && req.method === "GET") return json(200, { bookmarks: bookmarks() });
          if (bookmarkMatch && ["PUT", "DELETE"].includes(req.method)) {
            const record = db.prepare("SELECT id FROM records WHERE code=?").get(bookmarkMatch[1]);
            if (!record) throw failure(404, "档案不存在或已被删除。");
            if (req.method === "PUT") db.prepare("INSERT OR IGNORE INTO bookmarks(user_id,record_id) VALUES(?,?)").run(s.user_id, record.id);
            else db.prepare("DELETE FROM bookmarks WHERE user_id=? AND record_id=?").run(s.user_id, record.id);
            return json(200, { bookmarks: bookmarks() });
          }
          throw failure(405, "不支持此方法。");
        }
        if (s.role !== "admin") throw failure(403, "只有管理员可以修改内容。");
        if (path === "/api/users" && req.method === "GET") {
          return json(200, { users: db.prepare("SELECT id,username,role FROM users ORDER BY id").all().map(user => ({ ...user, self: user.id === s.user_id })) });
        }
        const userMatch = path.match(/^\/api\/users\/([1-9]\d*)(\/password)?$/);
        if (userMatch && ((req.method === "DELETE" && !userMatch[2]) || (req.method === "PUT" && userMatch[2]))) {
          const id = Number(userMatch[1]);
          if (!Number.isSafeInteger(id)) throw failure(400, "无效账户编号。");
          const input = await body(req);
          // Check the target again inside the transaction after reading the request body.
          db.exec("BEGIN IMMEDIATE");
          try {
            if (session(req)?.role !== "admin") throw failure(401, "会话已过期，请重新登录。");
            const target = db.prepare("SELECT * FROM users WHERE id=?").get(id);
            if (!target) throw failure(404, "账户不存在或已被删除。");
            if (req.method === "DELETE") {
              if (id === s.user_id) throw failure(400, "不能删除当前登录的管理员账户。");
              if (input?.confirmUsername !== target.username) throw failure(400, "请输入要删除的账户名称以确认。");
              db.prepare("DELETE FROM users WHERE id=?").run(id);
              db.prepare("INSERT INTO audit(user_id,action) VALUES(?,?)").run(s.user_id, `delete-user:${target.username}`);
            } else {
              rateLimit(`password:${s.user_id}`, 15);
              if (input?.username !== target.username) throw failure(409, "账户已变化，请重新打开账户管理。");
              if (typeof input?.newPassword !== "string" || input.newPassword.length < 8 || input.newPassword.length > 128) throw failure(400, "新密码须为 8–128 位。");
              if (id === s.user_id && (typeof input.currentPassword !== "string" || input.currentPassword.length > 128 || !verifyPassword(input.currentPassword, target.password_hash))) throw failure(400, "当前密码不正确。");
              db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(input.newPassword), id);
              // Keep only the administrator's current session when changing their own password.
              db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").run(id, id === s.user_id ? s.token_hash : "");
              db.prepare("INSERT INTO audit(user_id,action) VALUES(?,?)").run(s.user_id, `change-password:${target.username}`);
            }
            db.exec("COMMIT");
            return json(200, { ok: true });
          } catch (error) { db.exec("ROLLBACK"); throw error; }
        }
        if (path === "/api/users" && req.method === "POST") {
          const input = await body(req);
          let user;
          try { user = createUser(db, input.username, input.password, "reader"); } catch (e) { throw failure(400, e.message); }
          db.prepare("INSERT INTO audit(user_id,action) VALUES(?,?)").run(s.user_id, `create-reader:${user.username}`);
          return json(201, { user });
        }
        const match = path.match(/^\/api\/archives\/(X-[A-Z0-9][A-Z0-9_-]{0,23})$/);
        if (match && req.method === "DELETE") {
          const input = await body(req);
          db.exec("BEGIN IMMEDIATE");
          try {
            const row = db.prepare("SELECT * FROM records WHERE code=?").get(match[1]);
            if (!row) throw failure(404, "档案不存在或已被删除。");
            if (row.version !== input?.version) throw failure(409, "档案已更新，请刷新后再删除。");
            db.prepare("DELETE FROM records WHERE id=?").run(row.id);
            db.prepare("INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)").run(s.user_id, `delete:${row.code}`, row.id);
            db.exec("DELETE FROM photos WHERE NOT EXISTS (SELECT 1 FROM records WHERE json_extract(data,'$.photo')='/api/photos/' || photos.id)");
            db.exec("COMMIT");
            return json(200, { records: listRecords(db) });
          } catch (e) { db.exec("ROLLBACK"); throw e; }
        }
        if ((path === "/api/archives" && req.method === "POST") || (match && req.method === "PUT")) {
          const input = await body(req, 9 * 1024 * 1024);
          let record, photo;
          try {
            record = validateRecord(input);
            if (input.photoData) photo = decodePhoto(input.photoData);
            if (input.photoData && record.category !== site.columns[2]) throw new Error("只有画廊档案可以上传照片。");
          } catch (e) { throw failure(400, e.message); }
          db.exec("BEGIN IMMEDIATE");
          try {
            let id, version = 1, previous;
            if (match) {
              const row = db.prepare("SELECT * FROM records WHERE code=?").get(match[1]);
              if (!row) throw failure(404, "档案不存在。");
              id = row.id;
              previous = JSON.parse(row.data);
              if (row.version !== input.version) throw failure(409, "此档案已在其他窗口更新。请关闭编辑器，刷新后重试。");
              if (previous.category !== record.category) throw failure(400, "编辑时保留原栏目；新建档案时可以选择栏目。");
              version = row.version + 1;
            } else {
              // AUTOINCREMENT never reuses internal keys, even after deleting the last row.
              id = Number(db.prepare("SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name='records'),0)+1 AS id").get().id);
            }
            let code;
            try {
              code = input.codeSuffix !== undefined && input.codeSuffix !== "" ? archiveCode(input.codeSuffix) : previous?.id;
            } catch (e) { throw failure(400, e.message); }
            if (!code) {
              let number = id;
              do { code = archiveCode(String(number++)); } while (db.prepare("SELECT 1 FROM records WHERE code=?").get(code));
            }
            const occupied = db.prepare("SELECT id FROM records WHERE code=? COLLATE NOCASE").get(code);
            if (occupied && occupied.id !== id) throw failure(409, `编号 ${code} 已被占用，请换一个编号。`);
            record.id = code;
            if (record.category === site.columns[2]) {
              if (photo) {
                db.prepare("INSERT OR IGNORE INTO photos(id,bytes) VALUES(?,?)").run(photo.id, photo.bytes);
                record.photo = `/api/photos/${photo.id}`;
              } else if (!input.removePhoto && previous?.photo) record.photo = previous.photo;
            }
            if (match) db.prepare("UPDATE records SET code=?,data=?,version=? WHERE id=?").run(code, JSON.stringify(record), version, id);
            else db.prepare("INSERT INTO records(id,code,data) VALUES(?,?,?)").run(id, code, JSON.stringify(record));
            db.prepare("INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)").run(s.user_id, match ? "edit" : "create", id);
            db.exec("DELETE FROM photos WHERE NOT EXISTS (SELECT 1 FROM records WHERE json_extract(data,'$.photo')='/api/photos/' || photos.id)");
            db.exec("COMMIT");
            return json(match ? 200 : 201, { record: { ...record, version } });
          } catch (e) { db.exec("ROLLBACK"); throw e; }
        }
        throw failure(404, "接口不存在。");
      }
      if (!["GET", "HEAD"].includes(req.method)) throw failure(405, "不支持此方法。");
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { throw failure(400, "无效路径。"); }
      const file = resolve(staticRoot, "." + (decoded === "/" ? "/index.html" : decoded));
      if (!file.startsWith(resolve(staticRoot) + sep) || decoded.split(/[\\/]/).some(x => x.startsWith("."))) throw failure(404, "文件不存在。");
      let info;
      try { info = await stat(file); } catch { throw failure(404, "文件不存在。"); }
      if (!info.isFile()) throw failure(404, "文件不存在。");
      res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Content-Length": info.size, "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=3600" });
      if (req.method === "HEAD") return res.end();
      createReadStream(file).on("error", () => res.destroy()).pipe(res);
    } catch (error) {
      if (!res.headersSent) json(error.status || 500, { error: error.status ? error.message : "服务暂时无法完成请求。" });
      else res.destroy();
      if (!error.status) console.error("Request failed:", error.message);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173), host = process.env.HOST || "127.0.0.1";
  if (!existsSync(resolve(projectRoot, "dist/index.html"))) throw new Error("Run npm run build first.");
  const db = openStore();
  const app = createApp({ db });
  app.on("close", () => db.close());
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    app.close();
    setTimeout(() => app.closeAllConnections(), 10000).unref();
  });
  app.listen(port, host, () => console.log(`Rhine blog: http://${host}:${port}`));
}
