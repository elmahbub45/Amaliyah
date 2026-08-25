const C='amaliyah-v2-51-6-navigation-reader-fix';
const QURAN_CACHE='amaliyah-quran-pages-v1';
const EXTERNAL_CACHE='amaliyah-external-v1';
const A=['./','./index.html','./style.css','./app.js','./icon-library.js','./reader.html','./reader.css','./reader.js','./quran.html','./quran.css','./quran.js','./quran-config.js','./quran-offline.js','./books.json','./manifest.webmanifest','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];
const PDFJS=[
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const core=await caches.open(C);
    await core.addAll(A);
    const external=await caches.open(EXTERNAL_CACHE);
    await Promise.allSettled(PDFJS.map(async url=>{
      const response=await fetch(url,{mode:'cors'});
      if(response.ok)await external.put(url,response.clone());
    }));
  })());
});

self.addEventListener('activate',event=>{
  const keep=new Set([C,QURAN_CACHE,EXTERNAL_CACHE]);
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys=>Promise.all(keys.filter(key=>!keep.has(key)).map(key=>caches.delete(key))))
  ]));
});

async function sameOriginNetworkFirst(request){
  const cache=await caches.open(C);
  try{
    const response=await fetch(request);
    if(response && response.ok)cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch{
    // Navigasi Reader/Qur'an membawa query (?book=... / ?page=...).
    // ignoreSearch memastikan HTML shell yang sudah dicache tetap ditemukan.
    const cached=await cache.match(request,{ignoreSearch:request.mode==='navigate'});
    if(cached)return cached;

    if(request.mode==='navigate'){
      const u=new URL(request.url);
      const path=u.pathname;
      if(path.endsWith('/reader.html'))return cache.match('./reader.html');
      if(path.endsWith('/quran.html'))return cache.match('./quran.html');
      if(path.endsWith('/admin.html'))return cache.match('./admin.html')||cache.match('./index.html');
      return cache.match('./index.html')||cache.match('./');
    }
    return Response.error();
  }
}

async function externalCacheFirst(request,cacheName){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);
  if(cached)return cached;
  try{
    const response=await fetch(request);
    // Cache juga response opaque gambar lintas-domain.
    if(response && (response.ok||response.type==='opaque'))cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch{return Response.error()}
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  if(url.origin===location.origin){
    event.respondWith(sameOriginNetworkFirst(request));
    return;
  }

  if(url.hostname==='cdnjs.cloudflare.com' && url.pathname.includes('/pdf.js/4.10.38/')){
    event.respondWith(externalCacheFirst(request,EXTERNAL_CACHE));
    return;
  }

  if(url.hostname==='quran.islam-db.com' && url.pathname.includes('/quranpages_1024/images/')){
    event.respondWith(externalCacheFirst(request,QURAN_CACHE));
  }
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

/* Satu handler klik notifikasi: buka URL payload atau kembali ke aplikasi. */
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
