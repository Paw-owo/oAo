/* ============================================================
   service-worker.js — PWA 离线缓存
   缓存策略：stale-while-revalidate
   ============================================================ */
const CACHE_VERSION = "phone-v20260704";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/theme.css",
  "./css/common.css",
  "./css/lockscreen.css",
  "./css/desktop.css",
  "./css/chat.css",
  "./css/settings.css",
  "./css/apps.css",
  "./js/core/utils.js",
  "./js/core/icon-library.js",
  "./js/core/storage.js",
  "./js/core/event-center.js",
  "./js/core/app-registry.js",
  "./js/core/ai-client.js",
  "./js/core/state.js",
  "./js/core/notify.js",
  "./js/core/router.js",
  "./js/desktop/boot.js",
  "./js/desktop/lockscreen.js",
  "./js/desktop/status-bar.js",
  "./js/desktop/widgets.js",
  "./js/desktop/app-grid.js",
  "./js/desktop/dock.js",
  "./js/desktop/desktop.js",
  "./js/main.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // 只缓存同源请求
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // 跨域请求（如 AI 接口）直接放行，不缓存
    return;
  }

  // stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((resp) => {
        if (resp && resp.status === 200) {
          cache.put(req, resp.clone()).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
