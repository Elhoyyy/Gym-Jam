/* ============================================================
   Gym&Jam — Service Worker
   App shell cached for offline / instant loads. The API is always
   served from the network (never cached), so data stays fresh.
   Bump CACHE when you deploy changes to force an update.
   ============================================================ */
const CACHE = "gymjam-v39";
const SHELL = [
  "/", "/index.html", "/css/styles.css",
  "/js/theme.js", "/js/timer.js", "/js/storage.js", "/js/exercise-media.js",
  "/js/charts.js", "/js/auth.js", "/js/app.js",
  "/assets/favicon.svg", "/assets/auth-bg.svg",
  "/assets/icon-192.png", "/assets/icon-512.png", "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never intercept the API — always hit the network for auth/data.
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return;
  e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) {
    // refresh in the background
    fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (req.mode === "navigate") {
      const idx = await cache.match("/index.html");
      if (idx) return idx;
    }
    return new Response("", { status: 504, statusText: "Offline" });
  }
}
