/**
 * Minimal offline service worker for the static export.
 *
 * Scope is intentionally narrow: it caches the app shell (build assets + any
 * page the user has opened) so a network drop doesn't blank the stage. Sheet
 * images and list JSON live in the Cache API via lib/offlineCache.ts.
 *
 * Bump CACHE_VERSION to force a refresh after a deploy.
 */
const CACHE_VERSION = 'worship-shell-v1';
const SHELL_ASSETS = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((c) => c.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('worship-shell') && k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept Supabase, signed storage URLs, tessdata or workers.
  if (url.origin !== self.location.origin) return;
  if (/\/(tessdata|tesseract|tesseract-core)\//.test(url.pathname)) return;
  if (/\.(wasm|mjs|gz)$/.test(url.pathname)) return;

  const isNavigate = req.mode === 'navigate';
  const isAsset = /\/_next\/static\//.test(url.pathname);

  if (!isNavigate && !isAsset) return;

  if (isAsset) {
    // Content-hashed: cache-first is safe.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first with a 4s guard, falling back to cache.
  event.respondWith(
    (async () => {
      try {
        const res = await Promise.race([
          fetch(req),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
        ]);
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
        return res;
      } catch {
        const hit = await caches.match(req);
        return hit || (await caches.match('/')) || Response.error();
      }
    })(),
  );
});
