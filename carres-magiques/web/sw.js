const CACHE = "carres-magiques-v8";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "techniques/khatim-5x5.html", "techniques/khatim-compatibilite.html", "techniques/khatim-marabi3.html",
  "techniques/khatim-mukhammas.html", "techniques/khatim-zodiaque.html"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
