const C='amaliyah-v2-41-1-mushaf-reader-colors';
const A=['./','./index.html','./style.css','./app.js','./icon-library.js','./reader.html','./reader.css','./reader.js','./quran.html','./quran.css','./quran.js','./quran-config.js','./books.json','./manifest.webmanifest','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c=>c.addAll(A)));
});

self.addEventListener('activate',e=>{
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k))))
  ]));
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  const u=new URL(req.url);
  if(u.origin!==location.origin || req.method!=='GET')return;

  // V2.12: network-first so updates from GitHub Pages are preferred.
  e.respondWith(
    fetch(req).then(resp=>{
      const copy=resp.clone();
      caches.open(C).then(c=>c.put(req,copy));
      return resp;
    }).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html')))
  );
});


self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if('focus' in client)return client.focus();
      }
      if(clients.openWindow)return clients.openWindow('./');
    })
  );
});


/* =========================================================
   V2.28 — Web Push Receiver
   ========================================================= */
self.addEventListener('push',event=>{
  let payload={};
  try{
    payload=event.data ? event.data.json() : {};
  }catch{
    payload={body:event.data?.text?.()||'Pengingat dari Amaliyah'};
  }

  const title=payload.title||'Amaliyah';
  const options={
    body:payload.body||'Pengingat Amaliyah',
    icon:'./assets/icons/icon-192.png',
    badge:'./assets/icons/icon-192.png',
    tag:payload.tag||'amaliyah-push',
    renotify:true,
    data:{
      url:payload.url||'./'
    }
  };

  event.waitUntil(self.registration.showNotification(title,options));
});

/* Override/augment click behavior with URL from push payload. */
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'./';

  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{
      for(const client of list){
        if('navigate' in client){
          try{await client.navigate(target);}catch{}
        }
        if('focus' in client)return client.focus();
      }
      if(clients.openWindow)return clients.openWindow(target);
    })
  );
});
