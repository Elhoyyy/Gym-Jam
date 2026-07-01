/* ============================================================
   Gym&Jam — Self-hosted server
   Static files + JSON API + local SQLite database + auth.
   Zero external dependencies (uses node:sqlite + node:crypto).
   Run:  npm start   →  http://localhost:5173
   ============================================================ */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;
const DATA_DIR = join(__dirname, "data");
const DB_PATH = join(DATA_DIR, "gymandjam.db");
const SECRET_PATH = join(DATA_DIR, "secret.key");
const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days (seconds)

/* ---------- bootstrap data dir + secret ---------- */
if (!existsSync(DATA_DIR)) { await mkdir(DATA_DIR, { recursive: true }); }
let SECRET;
if (existsSync(SECRET_PATH)) {
  SECRET = readFileSync(SECRET_PATH, "utf8").trim();
} else {
  SECRET = randomBytes(48).toString("hex");
  writeFileSync(SECRET_PATH, SECRET, { mode: 0o600 });
}

/* ---------- database ---------- */
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL,
    salt       TEXT NOT NULL,
    hash       TEXT NOT NULL,
    state      TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
const q = {
  byEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  byId:    db.prepare("SELECT * FROM users WHERE id = ?"),
  insert:  db.prepare("INSERT INTO users (email, salt, hash, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"),
  saveState: db.prepare("UPDATE users SET state = ?, updated_at = ? WHERE id = ?"),
};

/* ---------- password hashing (scrypt) ---------- */
function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- signed tokens (HMAC, JWT-like) ---------- */
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString("base64url"); }
function sign(payload) {
  const body = b64url(payload);
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig || "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { return null; }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return sign({ uid: user.id, email: user.email, iat: now, exp: now + TOKEN_TTL });
}

/* ---------- helpers ---------- */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) { reject(new Error("payload demasiado grande")); req.destroy(); return; }
      data += c;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
async function readJSON(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}
function authUser(req) {
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload) return null;
  return q.byId.get(payload.uid) || null;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  const path = url.pathname;

  if (path === "/api/health" && req.method === "GET") {
    return sendJSON(res, 200, { ok: true, service: "gymandjam", auth: true });
  }

  if (path === "/api/register" && req.method === "POST") {
    const { email, password } = await readJSON(req);
    const mail = String(email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) return sendJSON(res, 400, { error: "Email no válido" });
    if (String(password || "").length < 6) return sendJSON(res, 400, { error: "La contraseña debe tener al menos 6 caracteres" });
    if (q.byEmail.get(mail)) return sendJSON(res, 409, { error: "Ese email ya está registrado" });
    const { salt, hash } = hashPassword(String(password));
    const now = Date.now();
    const info = q.insert.run(mail, salt, hash, "{}", now, now);
    const user = q.byId.get(info.lastInsertRowid);
    return sendJSON(res, 201, { token: issueToken(user), email: user.email });
  }

  if (path === "/api/login" && req.method === "POST") {
    const { email, password } = await readJSON(req);
    const mail = String(email || "").trim().toLowerCase();
    const user = q.byEmail.get(mail);
    if (!user || !verifyPassword(String(password || ""), user.salt, user.hash)) {
      return sendJSON(res, 401, { error: "Email o contraseña incorrectos" });
    }
    return sendJSON(res, 200, { token: issueToken(user), email: user.email });
  }

  if (path === "/api/state") {
    const user = authUser(req);
    if (!user) return sendJSON(res, 401, { error: "No autorizado" });

    if (req.method === "GET") {
      let state = {};
      try { state = JSON.parse(user.state || "{}"); } catch { state = {}; }
      return sendJSON(res, 200, { state, updatedAt: user.updated_at });
    }
    if (req.method === "PUT") {
      const { state } = await readJSON(req);
      if (typeof state !== "object" || state === null) return sendJSON(res, 400, { error: "Estado no válido" });
      q.saveState.run(JSON.stringify(state), Date.now(), user.id);
      return sendJSON(res, 200, { ok: true, updatedAt: Date.now() });
    }
  }

  return sendJSON(res, 404, { error: "No encontrado" });
}

/* ---------- static files ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
async function handleStatic(req, res, url) {
  let urlPath = decodeURIComponent(url.pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = normalize(join(__dirname, urlPath));
  // Never serve the data directory (db + secret) or files outside the project.
  if (!filePath.startsWith(__dirname) || filePath.startsWith(DATA_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 · No encontrado");
  }
}

/* ---------- server ---------- */
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await handleStatic(req, res, url);
  } catch (err) {
    sendJSON(res, 400, { error: err.message || "Error en la petición" });
  }
});

server.listen(PORT, () => {
  console.log(`\n  🏋️  Gym&Jam corriendo en  http://localhost:${PORT}`);
  console.log(`  📦  Base de datos local:   ${DB_PATH}\n`);
});
