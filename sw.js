/* ARISE service worker — cache-first app shell so the tracker works offline */
const CACHE = "arise-v8";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "core.js",
  "engine.js",
  "ui.js",
  "boot.js",
  "sync.js",
  "manifest.json",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  // without these the app loses its typefaces offline, which is the first thing
  // you notice and the whole reason they stopped being loaded from a CDN
  "fonts/orbitron-var-latin.woff2",
  "fonts/rajdhani-500-latin.woff2",
  "fonts/rajdhani-600-latin.woff2",
  "fonts/rajdhani-700-latin.woff2"
];

self.addEventListener("install", e => {
  // cache:"reload" on every shell request: Pages serves these with max-age=600,
  // and a plain addAll() is allowed to satisfy itself from that HTTP cache — which
  // means a fresh install can bake ten-minute-old files into a brand new cache.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        // cache same-origin files as they arrive; the fonts are local now, so
        // there is no third-party host left to special-case
        if (res.ok && e.request.url.startsWith(self.location.origin)){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match("index.html"))
    )
  );
});
