import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const site = JSON.parse(readFileSync(new URL("../content/site.json", import.meta.url), "utf8"));
export const labels = JSON.parse(readFileSync(new URL("../content/column-labels.json", import.meta.url), "utf8"));
export const digest = value => createHash("sha256").update(value).digest("hex");
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
const dummyHash = hashPassword(randomBytes(32).toString("hex"));
export function verifyPassword(password, encoded = dummyHash) {
  const [salt, hash] = encoded.split(":");
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export function openStore(path = resolve(process.env.DATA_DIR || resolve(projectRoot, ".local-data"), "blog.sqlite")) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','reader')));
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL, record_id INTEGER, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  // Separate the immutable database key from the user-facing archive code.
  if (!db.prepare("PRAGMA table_info(records)").all().some(c => c.name === "code")) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("ALTER TABLE records ADD COLUMN code TEXT; UPDATE records SET code=json_extract(data,'$.id'); CREATE UNIQUE INDEX records_code ON records(code COLLATE NOCASE);");
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  db.exec("CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, bytes BLOB NOT NULL)");
  db.exec(`CREATE TABLE IF NOT EXISTS bookmarks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, record_id)
  )`);
  return db;
}
export function createUser(db, username, password, role = "reader") {
  if (typeof username !== "string" || !/^[A-Za-z0-9_-]{3,32}$/.test(username)) throw new Error("账户名须为 3–32 位字母、数字、下划线或短横线。");
  if (typeof password !== "string" || password.length < 8 || password.length > 128) throw new Error("密码须为 8–128 位。");
  if (!["admin", "reader"].includes(role)) throw new Error("无效账户角色。");
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) throw new Error("账户名已存在。");
  db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)").run(username, hashPassword(password), role);
  return { username, role };
}
export function listRecords(db) {
  return db.prepare("SELECT * FROM records ORDER BY id").all().map(row => ({ ...JSON.parse(row.data), version: row.version }));
}
export function validateRecord(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("无效档案。");
  const result = {};
  const limits = { title: 100, en: 150, department: 100, category: 50, date: 100, lead: 100, clearance: 50, abstract: 20000, source: 2000 };
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof input[field] !== "string" || !input[field].trim() || input[field].length > limit) throw new Error(`${field} 为必填文本，长度不能超过 ${limit} 字符。`);
    result[field] = input[field].trim();
  }
  if (!site.columns.includes(result.category)) throw new Error("请选择有效栏目。");
  if (!Array.isArray(input.findings) || input.findings.length < 1 || input.findings.length > 100 || input.findings.some(x => typeof x !== "string" || !x.trim() || x.length > 5000)) throw new Error("正文须包含 1–100 段，每段不超过 5000 字符。");
  result.findings = input.findings.map(x => x.trim());
  if (input.bodyMarkdown !== undefined) {
    if (typeof input.bodyMarkdown !== "string" || input.bodyMarkdown.length > 100000)
      throw new Error("Markdown 正文不能超过 100000 字符。");
    result.bodyMarkdown = input.bodyMarkdown;
  }
  let url;
  try { url = new URL(result.source); } catch { throw new Error("参考链接必须是 HTTP 或 HTTPS 地址。"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("参考链接必须是 HTTP 或 HTTPS 地址。");
  return result;
}

export function archiveCode(suffix) {
  if (typeof suffix !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(suffix.trim()))
    throw new Error("编号须为 1–24 位字母、数字、下划线或短横线，且以字母或数字开头。");
  let value = suffix.trim().toUpperCase();
  if (/^\d+$/.test(value)) value = value.replace(/^0+(?=\d)/, "").padStart(3, "0");
  return `X-${value}`;
}

// Uploads are normalized by the editor to JPEG. Check the actual JPEG framing
// and dimensions server-side as well, rather than trusting a browser MIME type.
export function decodePhoto(data) {
  if (typeof data !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("照片必须为 JPEG 图片。");
  const bytes = Buffer.from(data.slice(23), "base64");
  if (bytes.length > 6 * 1024 * 1024) throw new Error("照片不能超过 6 MB。");
  if (bytes.length < 20 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw new Error("照片格式损坏。");
  let offset = 2, dimensions = false, scan = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("照片格式损坏。");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error("照片格式损坏。");
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) throw new Error("照片格式损坏。");
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5);
      if (!width || !height || width > 4096 || height > 4096) throw new Error("照片尺寸须在 4096 × 4096 以内。");
      dimensions = true;
    }
    if (marker === 0xda) { scan = true; break; }
    offset += length;
  }
  if (!dimensions || !scan) throw new Error("照片格式损坏。");
  return { id: digest(bytes), bytes };
}
