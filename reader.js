import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

// V2.50.5: PDF.js kembali dimuat sebagai module/worker normal.
// Saat offline, Service Worker melayani dua URL CDN ini dari cache eksternal.
// Ini menghindari pembuatan Blob module + Blob worker setiap Reader dibuka.

async function loadCatalog(){
  const url=new URL('./books.json',location.href).href;
  if(!navigator.onLine && 'caches' in window){
    try{
      const hit=await caches.match(url,{ignoreSearch:true});
      if(hit)return hit.json();
    }catch{}
  }
  try{
    const response=await fetch('./books.json',{cache:navigator.onLine?'no-store':'force-cache'});
    if(!response.ok)throw new Error('books.json gagal dimuat');
    return response.json();
  }catch(error){
    if('caches' in window){
      const hit=await caches.match(url,{ignoreSearch:true});
      if(hit)return hit.json();
    }
    throw error;
  }
}

const catalog=await loadCatalog();
const items=catalog.items||[];

// =========================================================
// V2.24 — MIGRASI SEMUA PDF KE R2 PRIVATE
// Path R2 mengikuti books.json setelah "assets/pdf-v2/".
// Mode final: semua PDF wajib tersedia di R2 private.
// Reader tidak lagi fallback ke file GitHub publik.
// =========================================================
const PRIVATE_PDF_WORKER='https://amaliyah-pdf.elmahbub45.workers.dev';
const R2_MIGRATION_FALLBACK=false;

// Semua PDF sekarang mengikuti path final dari books.json.
function r2KeyForPart(part){
  const file=String(part.file||'').replace(/^\.?\//,'');
  return file.replace(/^assets\/pdf-v2\//,'');
}

function ensureLoadingOverlay(){
  let box=document.querySelector('#readerLoading');
  if(box)return box;

  box=document.createElement('div');
  box.id='readerLoading';
  box.className='reader-loading';
  box.innerHTML=`
    <div class="reader-loading-mark">ا</div>
    <b id="readerLoadingTitle">Menyiapkan bacaan…</b>
    <span id="readerLoadingText">Mohon tunggu sebentar</span>
    <i class="reader-loading-line"></i>
  `;
  stage.appendChild(box);
  return box;
}

function showReaderLoading(title='Menyiapkan bacaan…',text='Mohon tunggu sebentar'){
  const box=ensureLoadingOverlay();
  const t=box.querySelector('#readerLoadingTitle');
  const s=box.querySelector('#readerLoadingText');
  if(t)t.textContent=title;
  if(s)s.textContent=text;
  box.classList.remove('hidden','fade-out');
}

function hideReaderLoading(){
  const box=document.querySelector('#readerLoading');
  if(!box)return;
  box.classList.add('fade-out');
  setTimeout(()=>box.classList.add('hidden'),220);
}

const OFFLINE_PDF_CACHE='amaliyah-offline-pdf-v1';
function offlinePdfRequest(part){
  return new Request(new URL(`./offline-pdf/${encodeURIComponent(part.id)}.pdf`,location.href),{method:'GET'});
}
async function readOfflinePdf(part){
  if(!('caches' in window))return null;
  try{
    const cache=await caches.open(OFFLINE_PDF_CACHE);
    const hit=await cache.match(offlinePdfRequest(part));
    if(!hit)return null;

    // V2.50.4: jangan salin seluruh PDF menjadi ArrayBuffer/Uint8Array.
    // Ambil Blob langsung dari Cache Storage lalu berikan URL lokal ke PDF.js.
    // Validasi hanya 5 byte awal agar pembukaan PDF besar tetap cepat.
    const blob=await hit.blob();
    if(!blob || blob.size<8)return null;
    const headBytes=new Uint8Array(await blob.slice(0,5).arrayBuffer());
    if(String.fromCharCode(...headBytes)!=='%PDF-')return null;

    const localUrl=URL.createObjectURL(blob);
    offlinePdfBlobUrls.push(localUrl);
    return {offlineUrl:localUrl,size:blob.size};
  }catch{return null}
}
function validPdfBytes(bytes){
  if(!bytes || bytes.byteLength<8)return false;
  const head=String.fromCharCode(...bytes.slice(0,5));
  return head==='%PDF-';
}

async function saveOfflinePdf(part,bytes){
  if(!('caches' in window)||!validPdfBytes(bytes))return;
  try{
    const cache=await caches.open(OFFLINE_PDF_CACHE);
    const body=new Blob([bytes],{type:'application/pdf'});
    await cache.put(offlinePdfRequest(part),new Response(body,{headers:{'Content-Type':'application/pdf','X-Amaliyah-Offline':'1'}}));
    localStorage.setItem(`amaliyah:offline-pdf:${part.id}`,String(Date.now()));
  }catch(error){console.warn('PDF offline cache gagal',error)}
}
function showReaderOfflineBadge(text='Mode offline • bacaan tersimpan di perangkat'){
  let badge=document.querySelector('#readerOfflineBadge');
  if(!badge){
    badge=document.createElement('div');
    badge.id='readerOfflineBadge';
    badge.className='reader-offline-badge';
    document.body.appendChild(badge);
  }
  badge.textContent=text;
  badge.classList.remove('hidden');
}

async function requestPrivatePdf(part){
  const key=r2KeyForPart(part);
  if(!key)return null;

  // Offline: langsung ke salinan lokal, tanpa mencoba jaringan sama sekali.
  if(!navigator.onLine){
    const cached=await readOfflinePdf(part);
    if(cached){
      showReaderLoading('Membuka bacaan offline…','Menggunakan salinan yang tersimpan di perangkat');
      showReaderOfflineBadge();
      return cached;
    }
    throw new Error('OFFLINE_NOT_CACHED');
  }

  showReaderLoading('Mengambil bacaan aman…','Menyiapkan PDF dari penyimpanan privat');

  try{
    const tokenRes=await fetch(
      `${PRIVATE_PDF_WORKER}/token?key=${encodeURIComponent(key)}`,
      {method:'GET',cache:'no-store',credentials:'omit'}
    );

    if(tokenRes.status===404 && R2_MIGRATION_FALLBACK)return null;
    if(!tokenRes.ok)throw new Error(`Token PDF gagal (${tokenRes.status})`);

    const tokenData=await tokenRes.json();
    if(!tokenData?.url)throw new Error('URL PDF sementara tidak diterima.');

    const pdfRes=await fetch(tokenData.url,{method:'GET',cache:'no-store',credentials:'omit'});
    if(!pdfRes.ok)throw new Error(`PDF private gagal dimuat (${pdfRes.status})`);

    const bytes=new Uint8Array(await pdfRes.arrayBuffer());
    if(!validPdfBytes(bytes))throw new Error('PDF_DATA_INVALID');
    await saveOfflinePdf(part,bytes);
    return bytes;
  }catch(error){
    // Jangan membaca seluruh PDF cache di awal saat online. Hanya lakukan bila
    // jaringan benar-benar gagal, agar pembukaan normal juga lebih cepat.
    const cached=await readOfflinePdf(part);
    if(cached){
      showReaderLoading('Koneksi terganggu…','Membuka salinan yang tersimpan di perangkat');
      showReaderOfflineBadge('Salinan offline • koneksi sedang tidak stabil');
      return cached;
    }
    throw error;
  }
}

const params=new URLSearchParams(location.search);
const itemId=params.get('book')||items[0]?.id;
const item=items.find(x=>x.id===itemId)||items[0];
if(!item)throw new Error('Data bacaan tidak ditemukan.');

let part;
if(item.type==='single'){
  part=item;
}else{
  const requested=params.get('part');
  const saved=localStorage.getItem(`collection:${item.id}:lastPart`);
  part=item.parts.find(p=>p.id===requested) || item.parts.find(p=>p.id===saved) || item.parts[0];
}
if(!part)throw new Error('Bagian bacaan tidak ditemukan.');

const $=s=>document.querySelector(s);
const canvas=$('#pdf');
const ctx=canvas.getContext('2d');
const counter=$('#counter');
const stage=$('#stage');
const nextButton=$('#next');
const partsButton=$('#partsBtn');
const sheet=$('#readerSheet');
const sheetTitle=$('#sheetTitle');
const sheetContent=$('#sheetContent');

document.title=item.type==='single'?item.title:`${item.title} — ${part.title}`;
$('#readerTitle').textContent=item.type==='single'?item.title:part.title;

localStorage.setItem('amaliyah:lastItem',item.id);
localStorage.setItem('amaliyah:lastBook',part.id);
if(item.type!=='single')localStorage.setItem(`collection:${item.id}:lastPart`,part.id);
if(partsButton){
  const isCollection=item.type==='collection';

  // Bagian hanya untuk collection. Gunakan class + hidden attribute
  // supaya tombol benar-benar keluar dari layout footer pada group/single.
  partsButton.classList.toggle('hidden',!isCollection);
  partsButton.hidden=!isCollection;
  partsButton.setAttribute('aria-hidden',String(!isCollection));

  document.body.classList.toggle('has-parts-menu',isCollection);
}

const pageKey=`book:${part.id}:page`;
const bookmarkKey=`amaliyah_bookmark_${part.id}`;
const legacyBookmarkKey=`book:${part.id}:bookmark`;

let pdfDoc=null;
let page=Math.max(1,+(localStorage.getItem(pageKey)||1));
let scale=1,rendering=false,renderQueued=false;
let startX=0,startY=0,swiped=false,sheetOpen=false;

if(!localStorage.getItem(bookmarkKey)&&localStorage.getItem(legacyBookmarkKey)){
  localStorage.setItem(bookmarkKey,localStorage.getItem(legacyBookmarkKey));
}
localStorage.removeItem(legacyBookmarkKey);

function currentBookmark(){return Math.max(0,+(localStorage.getItem(bookmarkKey)||0))}
function syncBookmarkState(){
  const active=currentBookmark()===page;
  document.querySelectorAll('.bookmark-control').forEach(btn=>{
    btn.classList.toggle('saved',active);
    btn.setAttribute('aria-pressed',String(active));
  });
}
function toggleBookmark(){
  if(currentBookmark()===page){
    localStorage.removeItem(bookmarkKey);localStorage.removeItem(legacyBookmarkKey);
  }else{
    localStorage.setItem(bookmarkKey,String(page));localStorage.removeItem(legacyBookmarkKey);
  }
  syncBookmarkState();
}

function recordHistory(){
  let hist=[];try{hist=JSON.parse(localStorage.getItem('amaliyah_history')||'[]')}catch{}
  hist=hist.filter(x=>!(x.id===item.id&&x.partId===part.id));
  hist.unshift({id:item.id,partId:part.id,page,ts:Date.now()});
  localStorage.setItem('amaliyah_history',JSON.stringify(hist.slice(0,30)));
}

function collectionPosition(){
  if(item.type==='single')return {index:-1,prev:null,next:null,last:true};
  const index=item.parts.findIndex(p=>p.id===part.id);
  return {
    index,
    prev:item.parts[index-1]||null,
    next:item.parts[index+1]||null,
    last:index===item.parts.length-1
  };
}

function updateNavigationState(){
  if(!pdfDoc)return;

  const atFirstPage=page<=1;
  const atLastPage=page>=pdfDoc.numPages;
  const pos=collectionPosition();

  const prevButton=$('#prev');

  // PREVIOUS side
  if(prevButton){
    if(!atFirstPage){
      prevButton.classList.remove('hidden','previous-part-mode');
      prevButton.setAttribute('aria-label','Halaman sebelumnya');
      prevButton.onclick=e=>{e.stopPropagation();go(-1)};
    }else if(item.type==='collection' && pos.prev){
      prevButton.classList.remove('hidden');
      prevButton.classList.add('previous-part-mode');
      prevButton.setAttribute('aria-label',`Kembali ke ${pos.prev.title}`);
      prevButton.onclick=e=>{
        e.stopPropagation();
        openPreviousPart(pos.prev);
      };
    }else{
      prevButton.classList.remove('previous-part-mode');
      prevButton.classList.add('hidden');
    }
  }

  // NEXT side
  if(!nextButton)return;

  if(!atLastPage){
    nextButton.classList.remove('hidden','next-part-mode');
    nextButton.setAttribute('aria-label','Halaman berikutnya');
    nextButton.onclick=e=>{e.stopPropagation();go(1)};
    return;
  }

  if(item.type==='collection' && pos.next){
    nextButton.classList.remove('hidden');
    nextButton.classList.add('next-part-mode');
    nextButton.setAttribute('aria-label',`Lanjut ke ${pos.next.title}`);
    nextButton.onclick=e=>{
      e.stopPropagation();
      openNextPart(pos.next);
    };
    return;
  }

  nextButton.classList.remove('next-part-mode');
  nextButton.classList.add('hidden');
}

function openNextPart(next){
  localStorage.setItem(`collection:${item.id}:lastPart`,next.id);
  localStorage.setItem(`book:${next.id}:page`,'1');
  const url=`reader.html?book=${encodeURIComponent(item.id)}&part=${encodeURIComponent(next.id)}`;
  location.replace(url);
}

function openPreviousPart(prev){
  if(!prev)return;
  const targetPage=Math.max(1,Number(prev.pages||1));
  localStorage.setItem(`collection:${item.id}:lastPart`,prev.id);
  localStorage.setItem(`book:${prev.id}:page`,String(targetPage));
  const url=`reader.html?book=${encodeURIComponent(item.id)}&part=${encodeURIComponent(prev.id)}`;
  location.replace(url);
}

function leaveReader(){
  if(sheetOpen){closeSheet();return}
  if(history.length>1)history.back();
  else location.href='./index.html';
}

async function drawPage(){
  if(!pdfDoc)return;
  if(rendering){renderQueued=true;return}
  rendering=true;
  const pageToRender=page;
  try{
    const pdfPage=await pdfDoc.getPage(pageToRender);
    const base=pdfPage.getViewport({scale:1});
    const controlsOff=document.body.classList.contains('controls-off');
    const availableW=controlsOff?innerWidth:Math.max(240,innerWidth-18);
    const availableH=controlsOff?innerHeight:Math.max(280,innerHeight-150);
    const fit=Math.min(availableW/base.width,availableH/base.height);
    const viewport=pdfPage.getViewport({scale:fit*scale});
    const dpr=Math.min(devicePixelRatio||1,2);

    canvas.width=Math.floor(viewport.width*dpr);
    canvas.height=Math.floor(viewport.height*dpr);
    canvas.style.width=`${viewport.width}px`;
    canvas.style.height=`${viewport.height}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    await pdfPage.render({canvasContext:ctx,viewport}).promise;

    if(page===pageToRender){
      counter.textContent=`${page} / ${pdfDoc.numPages}`;
      localStorage.setItem(pageKey,String(page));
      localStorage.setItem('amaliyah:lastItem',item.id);
      if(item.type!=='single')localStorage.setItem(`collection:${item.id}:lastPart`,part.id);
      recordHistory();syncBookmarkState();updateNavigationState();
    }
  }finally{
    rendering=false;
    if(renderQueued){renderQueued=false;drawPage()}
  }
}

function go(delta){
  if(!pdfDoc)return;
  const target=page+delta;
  if(target<1||target>pdfDoc.numPages)return;
  page=target;scale=1;stage.scrollTop=0;syncBookmarkState();drawPage();
}
function goToPage(target){
  if(!pdfDoc)return;
  page=Math.max(1,Math.min(pdfDoc.numPages,Number(target)||1));
  scale=1;stage.scrollTop=0;syncBookmarkState();closeSheet();drawPage();
}

function showSheet(title,contentBuilder){
  sheetTitle.textContent=title;sheetContent.replaceChildren();contentBuilder(sheetContent);
  sheet.classList.remove('hidden');sheet.setAttribute('aria-hidden','false');sheetOpen=true;
  if(!history.state?.readerSheet)history.pushState({readerSheet:true},'',location.href);
}
function hideSheetOnly(){sheet.classList.add('hidden');sheet.setAttribute('aria-hidden','true');sheetOpen=false}
function closeSheet(){if(!sheetOpen)return;hideSheetOnly();if(history.state?.readerSheet)history.back()}

function openToc(){
  showSheet('Halaman',container=>{
    const grid=document.createElement('div');grid.className='toc-grid';
    for(let i=1;i<=pdfDoc.numPages;i++){
      const btn=document.createElement('button');btn.type='button';btn.textContent=String(i);
      btn.classList.toggle('current',i===page);btn.onclick=()=>goToPage(i);grid.appendChild(btn);
    }
    container.appendChild(grid);
  });
}
function toggleFullscreen(){
  hideSheetOnly();if(history.state?.readerSheet)history.back();
  document.body.classList.toggle('controls-off');scale=1;drawPage();
}
async function shareReading(){
  hideSheetOnly();if(history.state?.readerSheet)history.back();
  const url=new URL(location.href);
  const data={title:document.title,text:`Baca ${document.title} di aplikasi Amaliyah`,url:url.toString()};
  if(navigator.share){try{await navigator.share(data);return}catch(e){if(e?.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(data.url);alert('Tautan bacaan sudah disalin.')}
  catch{prompt('Salin tautan bacaan ini:',data.url)}
}
function openParts(){
  if(item.type!=='collection')return;

  const pos=collectionPosition();

  showSheet('Bagian',container=>{
    const head=document.createElement('div');
    head.className='parts-sheet-context';
    head.innerHTML=`<b>${item.title}</b><small>Bagian ${pos.index+1} dari ${item.parts.length}</small>`;
    container.appendChild(head);

    const list=document.createElement('div');
    list.className='parts-sheet-list';

    item.parts.forEach((p,index)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='parts-sheet-item';
      if(p.id===part.id)btn.classList.add('active');

      const savedPage=Math.max(1,+(localStorage.getItem(`book:${p.id}:page`)||1));
      btn.innerHTML=`
        <span class="parts-sheet-number">${String(index+1).padStart(2,'0')}</span>
        <span class="parts-sheet-copy">
          <b>${escapeHtml(p.title)}</b>
          <small>${p.id===part.id?'Sedang dibaca':savedPage>1?`Terakhir halaman ${savedPage}`:`Bagian ${index+1}`}</small>
        </span>
        <span class="parts-sheet-state">${p.id===part.id?'✓':'‹'}</span>
      `;

      btn.onclick=()=>{
        if(p.id===part.id){
          closeSheet();
          return;
        }
        localStorage.setItem(`collection:${item.id}:lastPart`,p.id);
        location.replace(
          `reader.html?book=${encodeURIComponent(item.id)}&part=${encodeURIComponent(p.id)}`
        );
      };
      list.appendChild(btn);
    });

    container.appendChild(list);
  });
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}

function openMore(){
  showSheet('Lainnya',container=>{
    if(item.type!=='single'){
      const info=document.createElement('div');info.className='reader-part-info';
      const pos=collectionPosition();
      info.innerHTML=`<b>${item.title}</b><small>Bagian ${pos.index+1} dari ${item.parts.length}</small>`;
      container.appendChild(info);
    }
    const full=document.createElement('button');full.type='button';full.className='sheet-action';
    full.textContent=document.body.classList.contains('controls-off')?'Tampilkan kontrol':'Layar penuh';
    full.onclick=toggleFullscreen;
    container.append(full);
  });
}

$('#readerBack').onclick=e=>{e.stopPropagation();leaveReader()};
$('#zoomIn').onclick=e=>{e.stopPropagation();scale=Math.min(2.2,scale+.2);drawPage()};
$('#zoomOut').onclick=e=>{e.stopPropagation();scale=Math.max(.8,scale-.2);drawPage()};
$('#bookmarkTop').onclick=e=>{e.stopPropagation();toggleBookmark()};
$('#bookmarkBottom').onclick=e=>{e.stopPropagation();toggleBookmark()};
$('#tocBtn').onclick=e=>{e.stopPropagation();openToc()};
if(partsButton)partsButton.onclick=e=>{e.stopPropagation();openParts()};
$('#moreBtn').onclick=e=>{e.stopPropagation();openMore()};
$('#sheetClose').onclick=closeSheet;
sheet.onclick=e=>{if(e.target===sheet)closeSheet()};
$('.sheet-card').onclick=e=>e.stopPropagation();

window.addEventListener('popstate',()=>{if(sheetOpen)hideSheetOnly()});
stage.addEventListener('click',e=>{
  if(e.target.closest('button')||swiped){swiped=false;return}
  document.body.classList.toggle('controls-off');scale=1;drawPage();
});
stage.addEventListener('touchstart',e=>{
  startX=e.touches[0].clientX;startY=e.touches[0].clientY;swiped=false;
},{passive:true});
stage.addEventListener('touchend',e=>{
  const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
  if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.4){
    swiped=true;if(dx>0){
      if(pdfDoc && page>=pdfDoc.numPages && item.type==='collection'){
        const pos=collectionPosition();
        if(pos.next)openNextPart(pos.next);
      }else{
        go(1);
      }
    }else{
      if(pdfDoc && page<=1 && item.type==='collection'){
        const pos=collectionPosition();
        if(pos.prev)openPreviousPart(pos.prev);
      }else{
        go(-1);
      }
    }
    setTimeout(()=>{swiped=false},300);
  }
},{passive:true});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&sheetOpen){closeSheet();return}
  if(e.key==='ArrowRight'){
    if(pdfDoc && page>=pdfDoc.numPages && item.type==='collection'){
      const pos=collectionPosition();
      if(pos.next)openNextPart(pos.next);
    }else go(1);
  }
  if(e.key==='ArrowLeft'){
    if(pdfDoc && page<=1 && item.type==='collection'){
      const pos=collectionPosition();
      if(pos.prev)openPreviousPart(pos.prev);
    }else go(-1);
  }
});
window.addEventListener('resize',()=>drawPage());
window.addEventListener('pagehide',()=>{recordHistory();offlinePdfBlobUrls.forEach(url=>URL.revokeObjectURL(url));});

try{
  showReaderLoading();
  // PDF.js sudah di-load oleh module import di atas. Saat offline, module dan
  // worker berasal dari cache Service Worker, jadi tidak perlu membuat Blob engine.
  const privateData=await requestPrivatePdf(part);

  pdfDoc=privateData?.offlineUrl
    ? await pdfjsLib.getDocument({url:privateData.offlineUrl}).promise
    : privateData
      ? await pdfjsLib.getDocument({data:privateData}).promise
      : await pdfjsLib.getDocument(part.file).promise;

  page=Math.min(page,pdfDoc.numPages);
  stage.scrollTop=0;
  syncBookmarkState();
  await drawPage();
  hideReaderLoading();
}catch(error){
  console.error(error);
  hideReaderLoading();
  counter.textContent='Gagal memuat';
  stage.classList.add('reader-error');

  const box=document.createElement('div');
  box.className='private-pdf-error';
  const offlineMissing=['OFFLINE_NOT_CACHED','OFFLINE_PDF_ENGINE_NOT_CACHED'].includes(error?.message)||!navigator.onLine;
  box.innerHTML=offlineMissing
    ? `<b>${error?.message==='OFFLINE_PDF_ENGINE_NOT_CACHED'?'Reader offline belum disiapkan':'Bacaan belum tersedia offline'}</b>
       <span>${error?.message==='OFFLINE_PDF_ENGINE_NOT_CACHED'?'Sambungkan internet sekali setelah pembaruan aplikasi agar mesin PDF tersimpan di perangkat.':'Sambungkan internet dan buka bacaan ini sekali. Setelah itu bacaan akan tersimpan di perangkat untuk dibaca tanpa internet.'}</span>
       <button type="button">Kembali</button>`
    : `<b>PDF belum dapat dibuka</b>
       <span>Koneksi atau penyimpanan sedang bermasalah. Coba kembali beberapa saat lagi.</span>
       <button type="button">Coba lagi</button>`;

  box.querySelector('button').onclick=()=>offlineMissing
    ? (history.length>1?history.back():location.assign('index.html'))
    : location.reload();
  stage.appendChild(box);
}
