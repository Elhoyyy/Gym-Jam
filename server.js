/* ============================================================
   Gym&Jam — Self-hosted server
   Static files + JSON API + local SQLite database + auth.
   Zero external dependencies (uses node:sqlite + node:crypto).
   Run:  npm start   →  http://localhost:5173
   ============================================================ */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join, normalize, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;
const DATA_DIR = join(__dirname, "data");
const DB_PATH = join(DATA_DIR, "gymandjam.db");
const SECRET_PATH = join(DATA_DIR, "secret.key");
const TOKEN_TTL = 60 * 60 * 24 * 365; // 1 year (seconds)

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
    username   TEXT UNIQUE NOT NULL,
    salt       TEXT NOT NULL,
    hash       TEXT NOT NULL,
    state      TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shares (
    code       TEXT PRIMARY KEY,
    template   TEXT NOT NULL,
    owner      TEXT,
    created_at INTEGER NOT NULL,
    uses       INTEGER NOT NULL DEFAULT 0
  );
`);

// Migrate older databases that used an "email" column.
{
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (cols.includes("email") && !cols.includes("username")) {
    db.exec("ALTER TABLE users RENAME COLUMN email TO username");
  }
}

const q = {
  byUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  byId:    db.prepare("SELECT * FROM users WHERE id = ?"),
  insert:  db.prepare("INSERT INTO users (username, salt, hash, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"),
  saveState: db.prepare("UPDATE users SET state = ?, updated_at = ? WHERE id = ?"),
  setPassword: db.prepare("UPDATE users SET salt = ?, hash = ?, updated_at = ? WHERE id = ?"),
  deleteUser:  db.prepare("DELETE FROM users WHERE id = ?"),
  deleteSharesOf: db.prepare("DELETE FROM shares WHERE owner = ?"),
  insertShare: db.prepare("INSERT INTO shares (code, template, owner, created_at) VALUES (?, ?, ?, ?)"),
  getShare:    db.prepare("SELECT * FROM shares WHERE code = ?"),
  bumpShare:   db.prepare("UPDATE shares SET uses = uses + 1 WHERE code = ?"),
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
  return sign({ uid: user.id, username: user.username, iat: now, exp: now + TOKEN_TTL });
}

/* ---------- helpers ---------- */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) { reject(new Error("payload demasiado grande")); req.destroy(); return; }
      chunks.push(c);
    });
    // Concat as Buffers, decode once: a multibyte char (á, ñ…) split across
    // two TCP chunks would corrupt if we appended chunks as strings.
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function readJSON(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
function authUser(req) {
  const h = req.headers["authorization"] || "";
  let token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) token = parseCookies(req).gj_token || "";
  const payload = verifyToken(token);
  if (!payload) return null;
  return q.byId.get(payload.uid) || null;
}
// Persistent session cookie (survives iOS standalone PWA relaunches far
// better than localStorage). Secure only when served over HTTPS.
function setSessionCookie(req, res, token) {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `gj_token=${token}; Path=/; Max-Age=${TOKEN_TTL}; HttpOnly; SameSite=Lax${secure}`);
}
const USERNAME_RE = /^[a-z0-9._-]{3,20}$/;
// Normalize a username: lowercase + strip diacritics so "ñ" → "n", "josé" → "jose".
// Must match the client so register and login always agree on the stored name.
function normUsername(v) {
  return String(v || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/* ---------- brute-force throttle (in-memory, per IP) ---------- */
const RL_WINDOW = 15 * 60 * 1000;   // 15 min window
const RL_MAX = 10;                  // failed logins per window before lockout
const rlHits = new Map();           // ip -> { count, resetAt }
function clientIp(req) {
  const xf = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || "?";
}
function rlBlocked(ip) {
  const e = rlHits.get(ip);
  if (!e) return false;
  if (Date.now() > e.resetAt) { rlHits.delete(ip); return false; }
  return e.count >= RL_MAX;
}
function rlFail(ip) {
  const now = Date.now();
  const e = rlHits.get(ip);
  if (!e || now > e.resetAt) rlHits.set(ip, { count: 1, resetAt: now + RL_WINDOW });
  else e.count++;
}
function rlReset(ip) { rlHits.delete(ip); }
// Drop expired entries so the map can't grow unbounded. Unref'd so it never
// keeps the process alive on its own.
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of rlHits) if (now > e.resetAt) rlHits.delete(ip);
}, RL_WINDOW).unref();

function round1(v) { v = Number(v); return isFinite(v) ? Math.round(v * 10) / 10 : 0; }

const OFF_UA = "GymAndJam/1.0 (open source; self-hosted)";
async function offFetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": OFF_UA }, signal: AbortSignal.timeout(8000) });
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("json")) throw new Error("OFF non-JSON (" + r.status + ")");
  return r.json();
}
// Normalize a product from either OFF search API into our shape.
function offItem(x) {
  const n = x.nutriments || {};
  const kcal = n["energy-kcal_100g"];
  let name = x.product_name;
  if (name && typeof name === "object") name = name.es || name.en || Object.values(name)[0] || "";
  name = String(name || "").trim();
  if (kcal == null || !name) return null;
  let brand = Array.isArray(x.brands) ? (x.brands[0] || "") : (x.brands || "");
  brand = String(brand).split(",")[0].trim();
  return {
    name: name.slice(0, 120), brand: brand.slice(0, 60), code: String(x.code || ""),
    kcal: Math.round(Number(kcal)), protein: round1(n.proteins_100g), carbs: round1(n.carbohydrates_100g), fat: round1(n.fat_100g),
  };
}

// Short, unguessable share code (no ambiguous chars).
function shareCode() {
  const A = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = randomBytes(8);
  let s = ""; for (let i = 0; i < 8; i++) s += A[b[i] % A.length];
  return s;
}
// Validate + sanitize a routine so we only store clean, bounded data.
function sanitizeTemplate(t) {
  if (!t || typeof t !== "object") return null;
  const name = String(t.name || "").slice(0, 80).trim();
  if (!name) return null;
  const groups = Array.isArray(t.groups) ? t.groups.filter((g) => typeof g === "string").slice(0, 12) : [];
  const entries = (Array.isArray(t.entries) ? t.entries : []).slice(0, 40).map((en) => {
    if (!en || typeof en.name !== "string" || typeof en.group !== "string") return null;
    const sets = (Array.isArray(en.sets) ? en.sets : []).slice(0, 30).map((s) => {
      const o = {};
      ["weight", "reps", "min", "km"].forEach((k) => {
        if (s && s[k] !== undefined && s[k] !== "" && isFinite(Number(s[k]))) o[k] = Number(s[k]);
      });
      if (s && (s.side === "I" || s.side === "D")) o.side = s.side;
      // Preserve dropset segments (bounded), else shared routines lose them.
      if (s && Array.isArray(s.drops) && s.drops.length) {
        const drops = s.drops.slice(0, 8).map((d) => {
          const dd = {};
          ["weight", "reps"].forEach((k) => {
            if (d && d[k] !== undefined && d[k] !== "" && isFinite(Number(d[k]))) dd[k] = Number(d[k]);
          });
          return dd;
        }).filter((d) => Number(d.reps) > 0);
        if (drops.length) o.drops = drops;
      }
      return o;
    });
    return { name: en.name.slice(0, 80), group: en.group.slice(0, 20), sets };
  }).filter(Boolean);
  if (!entries.length) return null;
  return { name, groups, entries };
}

// A share is either a single routine or a folder bundle of routines.
function sanitizeShare(body) {
  if (body && Array.isArray(body.templates)) {
    const folder = String(body.folder || "").slice(0, 60).trim();
    const templates = body.templates.map(sanitizeTemplate).filter(Boolean).slice(0, 40);
    if (!templates.length) return null;
    return { type: "folder", folder, templates };
  }
  const t = sanitizeTemplate(body && body.template);
  return t ? { type: "routine", template: t } : null;
}

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  const path = url.pathname;

  // SECURITY: API responses are per-user and MUST NEVER be stored by any
  // shared/intermediate cache (Nginx proxy_cache, a corporate/ISP proxy, the
  // browser, …). Without this, a cached GET /api/me or /api/state could be
  // served to a different visitor — i.e. "logged in as someone else".
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("Vary", "Cookie, Authorization");

  if (path === "/api/health" && req.method === "GET") {
    return sendJSON(res, 200, { ok: true, service: "gymandjam", auth: true });
  }

  if (path === "/api/register" && req.method === "POST") {
    if (rlBlocked(clientIp(req))) return sendJSON(res, 429, { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." });
    const { username, password } = await readJSON(req);
    const uname = normUsername(username);
    if (!USERNAME_RE.test(uname)) return sendJSON(res, 400, { error: "Usuario no válido (3-20 caracteres: letras, números, . _ -)" });
    if (String(password || "").length < 6) return sendJSON(res, 400, { error: "La contraseña debe tener al menos 6 caracteres" });
    if (q.byUsername.get(uname)) return sendJSON(res, 409, { error: "Ese nombre de usuario ya está en uso" });
    const { salt, hash } = hashPassword(String(password));
    const now = Date.now();
    const info = q.insert.run(uname, salt, hash, "{}", now, now);
    const user = q.byId.get(info.lastInsertRowid);
    rlReset(clientIp(req));
    const token = issueToken(user);
    setSessionCookie(req, res, token);
    return sendJSON(res, 201, { token, username: user.username, uid: user.id, createdAt: user.created_at });
  }

  if (path === "/api/login" && req.method === "POST") {
    const ip = clientIp(req);
    if (rlBlocked(ip)) return sendJSON(res, 429, { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." });
    const { username, password } = await readJSON(req);
    const uname = normUsername(username);
    const user = q.byUsername.get(uname);
    if (!user || !verifyPassword(String(password || ""), user.salt, user.hash)) {
      rlFail(ip);
      return sendJSON(res, 401, { error: "Usuario o contraseña incorrectos" });
    }
    rlReset(ip);
    const token = issueToken(user);
    setSessionCookie(req, res, token);
    return sendJSON(res, 200, { token, username: user.username, uid: user.id, createdAt: user.created_at });
  }

  // Who am I? (Bearer or session cookie). Lets the client restore the session
  // even if localStorage was wiped (common on iOS home-screen PWAs).
  if (path === "/api/me" && req.method === "GET") {
    const user = authUser(req);
    if (!user) return sendJSON(res, 401, { error: "No autorizado" });
    return sendJSON(res, 200, { username: user.username, uid: user.id, createdAt: user.created_at });
  }

  if (path === "/api/logout" && req.method === "POST") {
    res.setHeader("Set-Cookie", "gj_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return sendJSON(res, 200, { ok: true });
  }

  // Change password: requires the current password. Rate-limited so the
  // "current password" field can't be brute-forced with a stolen session.
  if (path === "/api/password" && req.method === "POST") {
    const ip = clientIp(req);
    if (rlBlocked(ip)) return sendJSON(res, 429, { error: "Demasiados intentos. Espera unos minutos." });
    const user = authUser(req);
    if (!user) return sendJSON(res, 401, { error: "No autorizado" });
    const { current, password } = await readJSON(req);
    if (!verifyPassword(String(current || ""), user.salt, user.hash)) {
      rlFail(ip);
      return sendJSON(res, 403, { error: "La contraseña actual no es correcta" });
    }
    if (String(password || "").length < 6) return sendJSON(res, 400, { error: "La nueva contraseña debe tener al menos 6 caracteres" });
    const { salt, hash } = hashPassword(String(password));
    q.setPassword.run(salt, hash, Date.now(), user.id);
    rlReset(ip);
    return sendJSON(res, 200, { ok: true });
  }

  // Delete account: requires the password. Removes the user and the routines
  // they had shared, and clears the session cookie.
  if (path === "/api/account/delete" && req.method === "POST") {
    const ip = clientIp(req);
    if (rlBlocked(ip)) return sendJSON(res, 429, { error: "Demasiados intentos. Espera unos minutos." });
    const user = authUser(req);
    if (!user) return sendJSON(res, 401, { error: "No autorizado" });
    const { password } = await readJSON(req);
    if (!verifyPassword(String(password || ""), user.salt, user.hash)) {
      rlFail(ip);
      return sendJSON(res, 403, { error: "Contraseña incorrecta" });
    }
    q.deleteSharesOf.run(user.username);
    q.deleteUser.run(user.id);
    res.setHeader("Set-Cookie", "gj_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    rlReset(ip);
    return sendJSON(res, 200, { ok: true });
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

  // Create a share link for a routine (must be logged in)
  if (path === "/api/share" && req.method === "POST") {
    const user = authUser(req);
    if (!user) return sendJSON(res, 401, { error: "No autorizado" });
    const clean = sanitizeShare(await readJSON(req));
    if (!clean) return sendJSON(res, 400, { error: "Rutina no válida" });
    let code = shareCode();
    for (let i = 0; i < 5 && q.getShare.get(code); i++) code = shareCode();
    q.insertShare.run(code, JSON.stringify(clean), user.username, Date.now());
    return sendJSON(res, 201, { code });
  }

  // Fetch a shared routine/folder by code (public)
  if (path.startsWith("/api/share/") && req.method === "GET") {
    const code = path.slice("/api/share/".length);
    const row = q.getShare.get(code);
    if (!row) return sendJSON(res, 404, { error: "Esa rutina no existe o ha caducado" });
    q.bumpShare.run(code);
    let parsed = null;
    try { parsed = JSON.parse(row.template); } catch { parsed = null; }
    if (!parsed) return sendJSON(res, 404, { error: "Rutina no válida" });
    // Legacy shares were stored as a bare template (no `type`).
    const share = parsed.type ? parsed : { type: "routine", template: parsed };
    return sendJSON(res, 200, { share, template: share.template, owner: row.owner || null });
  }

  // Food search proxy (Open Food Facts) — keeps it CORS-free and private.
  if (path === "/api/food/search" && req.method === "GET") {
    const user = authUser(req);
    if (!user) return sendJSON(res, 401, { error: "No autorizado" });
    const term = (url.searchParams.get("q") || "").trim();
    if (term.length < 2) return sendJSON(res, 200, { items: [] });
    const enc = encodeURIComponent(term);
    const salicious = "https://search.openfoodfacts.org/search?q=" + enc + "&page_size=25&lang=es&fields=code,product_name,brands,nutriments";
    const legacy = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=" + enc +
      "&search_simple=1&action=process&json=1&page_size=25&fields=product_name,brands,nutriments,code";
    let raw = null;
    try { raw = await offFetchJson(salicious); }
    catch (_) { try { raw = await offFetchJson(legacy); } catch (e2) { return sendJSON(res, 502, { error: "No se pudo buscar (Open Food Facts no responde)" }); } }
    const list = raw.hits || raw.products || [];
    const items = list.map(offItem).filter(Boolean).slice(0, 25);
    return sendJSON(res, 200, { items });
  }

  // Barcode lookup (Open Food Facts product)
  if (path.startsWith("/api/food/barcode/") && req.method === "GET") {
    const user = authUser(req);
    if (!user) return sendJSON(res, 401, { error: "No autorizado" });
    const code = path.slice("/api/food/barcode/".length).replace(/[^0-9]/g, "").slice(0, 20);
    if (code.length < 6) return sendJSON(res, 400, { error: "Código no válido" });
    const off = "https://world.openfoodfacts.org/api/v2/product/" + code + ".json?fields=product_name,brands,nutriments,code";
    try {
      const r = await fetch(off, { headers: { "User-Agent": "GymAndJam/1.0 (open source; self-hosted)" }, signal: AbortSignal.timeout(9000) });
      const data = await r.json();
      if (!data || data.status !== 1 || !data.product) return sendJSON(res, 404, { error: "Producto no encontrado" });
      const p = data.product, n = p.nutriments || {};
      const kcal = n["energy-kcal_100g"];
      let name = p.product_name;
      if (name && typeof name === "object") name = name.es || name.en || Object.values(name)[0] || "";
      name = String(name || "").trim();
      if (kcal == null || !name) return sendJSON(res, 404, { error: "Ese producto no tiene datos nutricionales" });
      let brand = Array.isArray(p.brands) ? (p.brands[0] || "") : (p.brands || "");
      brand = String(brand).split(",")[0].trim();
      return sendJSON(res, 200, { item: { name: name.slice(0, 120), brand: brand.slice(0, 60), code, kcal: Math.round(Number(kcal)), protein: round1(n.proteins_100g), carbs: round1(n.carbohydrates_100g), fat: round1(n.fat_100g) } });
    } catch (e) {
      return sendJSON(res, 502, { error: "Open Food Facts no responde" });
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
  // Compare on directory boundaries (sep) so a sibling dir sharing the project
  // name prefix (e.g. "GymAndJam-backup") can't be reached via encoded "..".
  const root = __dirname + sep;
  const dataDir = DATA_DIR + sep;
  if (!filePath.startsWith(root) || filePath.startsWith(dataDir)) {
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
