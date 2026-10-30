// Joystick service worker: app shell offline, fonts cached, everything else network-first.
const CACHE = "joystick-v24";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Account data, WebSocket upgrades, and private files must never enter the shared app cache.
  if (url.origin === location.origin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/files/") || url.pathname === "/chat.html")) return;
  const isFont = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  const isAsset = url.origin === location.origin && url.pathname.startsWith("/assets/");
  if (isFont || isAsset) {
    // Hashed build assets and fonts never change: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Pages and everything else: network first, fall back to cache when offline
  e.respondWith(fetch(req).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match("/"))));
});

const roomId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
self.addEventListener('push', event => {
  let data={};
  try { data=event.data?.json() || {}; } catch { /* A visible generic alert still appears. */ }
  const target=roomId(data.roomId) ? `/?room=${encodeURIComponent(data.roomId)}` : '/';
  event.waitUntil(self.registration.showNotification('New Joystick message',{
    body:'Open Joystick to read it.',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
    tag:roomId(data.messageId)?`message-${data.messageId}`:'joystick-message',data:{target}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.target;
  const url=new URL(typeof target==='string'?target:'/',self.location.origin);
  if(url.origin!==self.location.origin || (url.pathname!=='/' && url.pathname!=='/index.html'))return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===url.origin);
    if(existing){await existing.navigate(url.href);await existing.focus();}
    else await self.clients.openWindow(url.href);
  })());
});
