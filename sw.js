// Naikkan angka versi ini setiap kali file aplikasi di-update.
const CACHE = "prospek-v28";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png"];
const FONT_CACHE = "prospek-fonts";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return; // request ke API (POST) tidak disentuh
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // tampilkan dari cache (instan & offline), perbarui cache di belakang layar
    e.respondWith(caches.open(CACHE).then(async c => {
      const key = req.mode === "navigate" ? "./index.html" : req;
      const cached = await c.match(key, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r && r.ok) c.put(key, r.clone()); return r; }).catch(() => null);
      e.waitUntil(net);
      return cached || (await net) || Response.error();
    }));
    return;
  }

  // font & pustaka PDF disimpan supaya tetap bisa dipakai offline
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com" || url.host === "cdn.jsdelivr.net") {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const cached = await c.match(req);
      if (cached) return cached;
      try { const r = await fetch(req); c.put(req, r.clone()); return r; } catch (err) { return Response.error(); }
    }));
  }
});
