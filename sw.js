/* ARISE service worker — cache-first app shell so the tracker works offline */
const CACHE = "arise-v4";
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
  "icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
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
        // cache same-origin files and Google Fonts as they arrive
        const url = e.request.url;
        if (res.ok && (url.startsWith(self.location.origin) || url.includes("fonts.g"))){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match("index.html"))
    )
  );
});
