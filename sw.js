/* Sureo service worker: caches only the app shell. Never touches Supabase or Paystack requests. */
const C='sureo-shell-v2'; /* SECURITY FIX: bumped so old cached error pages are purged */
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','icon-192.png'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res;}) /* SECURITY FIX: cache successful responses only */.catch(()=>caches.match(r).then(m=>m||caches.match('./'))));
});
/* push: always show a notification (iPhone cancels push permission if a push shows nothing) */
self.addEventListener('push',e=>{
  let d={};try{d=e.data.json();}catch(x){}
  e.waitUntil(self.registration.showNotification(d.title||'Sureo',{body:d.body||'You have a new message',icon:'icon-192.png',badge:'icon-192.png',tag:d.tag||'sureo',data:{url:d.url||'./'}}));
});
/* SECURITY FIX: a push payload can only open pages on this site, never an outside link */
function safeUrl(u){try{const x=new URL(u||'./',self.location.origin);return x.origin===self.location.origin?x.href:'./';}catch(e){return './';}}
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    for(const c of cs){if('focus' in c)return c.focus();}
    return self.clients.openWindow(safeUrl(e.notification.data&&e.notification.data.url));
  }));
});
