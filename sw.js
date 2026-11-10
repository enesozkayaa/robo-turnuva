// =============================================================
// Robo Turnuva - servis çalışanı (service worker)
// Telefonda "ana ekrana ekle" için. İnternet varken her zaman en yeni dosyalar gelir,
// yoksa kaydedilmiş kopya açılır. Oyunu güncelleyip yüklerken ONBELLEK numarasını 1 artır.
// =============================================================

const ONBELLEK = 'robo-turnuva-v30';
const DOSYALAR = [
  './', 'index.html', 'style.css', 'ses.js', 'cekirdek.js', 'kontrol.js', 'ag.js', 'salon.js',
  'oyunlar/lazer-motor.js', 'oyunlar/lazer.js', 'oyunlar/kursun-motor.js', 'oyunlar/kursun.js', 'oyunlar/zaman.js', 'oyunlar/bezelye.js', 'oyunlar/karo-motor.js', 'oyunlar/karo.js', 'oyunlar/kapi-motor.js', 'oyunlar/kapi.js', 'oyunlar/ev-motor.js', 'oyunlar/ev.js', 'oyunlar/forklift-motor.js', 'oyunlar/forklift.js',
  'manifest.webmanifest', 'ikonlar/ikon-192.png', 'ikonlar/ikon-512.png',
];

self.addEventListener('install', olay => {
  olay.waitUntil(caches.open(ONBELLEK).then(o => o.addAll(DOSYALAR.map(d => new Request(d, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', olay => {
  olay.waitUntil(caches.keys().then(adlar => Promise.all(adlar.filter(a => a !== ONBELLEK).map(a => caches.delete(a)))));
  self.clients.claim();
});
self.addEventListener('fetch', olay => {
  if (olay.request.method !== 'GET') return;
  const ayniSite = new URL(olay.request.url).origin === self.location.origin;
  olay.respondWith(
    (ayniSite ? fetch(olay.request.url, { cache: 'no-cache' }) : fetch(olay.request))
      .then(cevap => {
        if (cevap.ok) { const kopya = cevap.clone(); caches.open(ONBELLEK).then(o => o.put(olay.request, kopya)); }
        return cevap;
      })
      .catch(() => caches.match(olay.request)),
  );
});
