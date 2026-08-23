const C='amaliyah-v2-26';
const A=['./','./index.html','./style.css','./app.js','./reader.html','./reader.css','./reader.js','./books.json','./manifest.webmanifest','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];

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
