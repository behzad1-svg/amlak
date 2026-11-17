// SAJ CRM service worker — installability only.
// Never caches pages or API responses: navigations and /api/* always go to
// the network, so login (JWT in an HttpOnly cookie) and fresh CRM data are
// never served stale. Only versioned static assets (/_next/static/*) and
// same-origin images/fonts are cached, cache-first.
const CACHE_NAME = "saj-static-v1";

self.addEventListener("install", () => {
  // Activate immediately; there is no cached app shell to protect.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isVersionedStatic = url.pathname.startsWith("/_next/static/");
  const isAsset = /\.(?:png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf)$/i.test(url.pathname);
  // Everything else — pages, /api/*, /manifest.webmanifest, /sw.js itself —
  // is intentionally left to the network.
  if (!isVersionedStatic && !isAsset) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
