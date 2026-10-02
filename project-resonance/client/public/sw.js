// Service Worker：讓遊戲可以被安裝，並快取畫面檔案加快開啟
// 遊戲資料 (/api) 永遠走網路，不快取
const CACHE = 'resonance-v2'; // 改了快取規則 → 換名字讓舊快取清掉
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return;

  // 打包後的檔案名稱帶 hash，內容不會變 → 快取優先
  // 3D 模型（/models/）也快取：原本每次打開都重新下載 2~3 MB，手機透過通道連線時要等很久
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/models/')) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })),
    );
    return;
  }

  // 頁面本身 → 網路優先（拿到最新版）；網路 3 秒沒回應就先用快取的開起來，背景繼續更新
  if (e.request.mode === 'navigate') {
    const net = fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('/', copy));
      return res;
    });
    e.respondWith(
      Promise.race([net, new Promise((r) => setTimeout(r, 3000))])
        .then((res) => res || caches.match('/').then((hit) => hit || net))
        .catch(() => caches.match('/')),
    );
  }
});
