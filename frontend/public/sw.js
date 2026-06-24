// FloodGuard AI — Service Worker
// Cache-first for static assets; network-first with stale fallback for API data.

const CACHE_NAME = "floodguard-v2";
const API_CACHE  = "floodguard-api-v2";

const PRECACHE = [
  "/",
  "/district",
  "/logo/floodguard-icon-64.png",
  "/logo/floodguard-icon-256.png",
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first, fall back to cached response (stale is better
  // than nothing during a flood when connectivity is patchy)
  const isApiCall =
    url.pathname.startsWith("/live-risks") ||
    url.pathname.startsWith("/alerts") ||
    url.pathname.startsWith("/reports") ||
    url.pathname.startsWith("/emergency-priority");

  if (isApiCall) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  if (request.method === "GET") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok && !url.pathname.startsWith("/api/")) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
  }
});
