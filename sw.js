/* LUMA Service Worker
   الصفحات والسكربتات: الشبكة أولاً — فأي تعديل يظهر فوراً بلا انتظار تحديث ثانٍ.
   الصور والخطوط والأيقونات: الكاش أولاً للسرعة.
   ارفع رقم الإصدار عند أي تغيير جوهري ليُمسح الكاش القديم لدى الجميع. */
const CACHE = 'luma-v2';
const CORE = [
  '/index.html', '/booking.html', '/salon.html',
  '/luma-store.js', '/luma-theme.js', '/luma-ui.js', '/luma-core.css',
  '/favicon.svg', '/icon-192.png', '/icon-512.png', '/manifest.json',
];
/* ما يُخدَم من الكاش أولاً — أصول لا تتغير محتوياتها عادةً */
const STATIC_RE = /\.(png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)$/i;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(CORE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  /* أصول ثابتة: الكاش أولاً، والتحديث بالخلفية */
  if (STATIC_RE.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  /* الصفحات والسكربتات والأنماط: الشبكة أولاً، والكاش شبكة أمان عند انقطاعها */
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
