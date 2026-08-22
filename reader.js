import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const books=window.AMALIYAH_BOOKS||[];
const params=new URLSearchParams(location.search);
const bookId=params.get('book')||books[0]?.id;
const book=books.find(b=>b.id===bookId)||books[0];
if(!book)throw new Error('Data bacaan tidak ditemukan.');

const $=s=>document.querySelector(s);
const canvas=$('#pdf');
const ctx=canvas.getContext('2d');
const counter=$('#counter');
const stage=$('#stage');
const sheet=$('#readerSheet');
const sheetTitle=$('#sheetTitle');
const sheetContent=$('#sheetContent');

document.title=book.title;
$('#readerTitle').textContent=book.title;
localStorage.setItem('amaliyah:lastBook',book.id);

const pageKey=`book:${book.id}:page`;
const bookmarkKey=`amaliyah_bookmark_${book.id}`;
const legacyBookmarkKey=`book:${book.id}:bookmark`;

let pdfDoc=null;
let page=Math.max(1,+(localStorage.getItem(pageKey)||1));
let scale=1;
let rendering=false;
let renderQueued=false;
let startX=0,startY=0;
let swiped=false;
let sheetOpen=false;

// Migrate old single-bookmark key if the older version was used.
if(!localStorage.getItem(bookmarkKey) && localStorage.getItem(legacyBookmarkKey)){
  localStorage.setItem(bookmarkKey,localStorage.getItem(legacyBookmarkKey));
}

function currentBookmark(){
  return Math.max(0,+(localStorage.getItem(bookmarkKey)||0));
}

function syncBookmarkState(){
  const active=currentBookmark()===page;
  document.querySelectorAll('.bookmark-control').forEach(btn=>{
    btn.classList.toggle('saved',active);
    btn.setAttribute('aria-pressed',String(active));
    btn.setAttribute('title',active?'Hapus bookmark halaman ini':'Bookmark halaman ini');
  });
}

function toggleBookmark(){
  if(currentBookmark()===page){
    localStorage.removeItem(bookmarkKey);
  }else{
    localStorage.setItem(bookmarkKey,String(page));
  }
  syncBookmarkState();
}

function recordHistory(){
  let hist=[];
  try{hist=JSON.parse(localStorage.getItem('amaliyah_history')||'[]')}catch{}
  hist=hist.filter(x=>x.id!==book.id);
  hist.unshift({id:book.id,page,ts:Date.now()});
  localStorage.setItem('amaliyah_history',JSON.stringify(hist.slice(0,20)));
}

function leaveReader(){
  if(sheetOpen){
    closeSheet();
    return;
  }
  if(history.length>1)history.back();
  else location.href='./index.html';
}

async function drawPage(){
  if(!pdfDoc)return;
  if(rendering){
    renderQueued=true;
    return;
  }
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
      recordHistory();
      syncBookmarkState();
    }
  }finally{
    rendering=false;
    if(renderQueued){
      renderQueued=false;
      drawPage();
    }
  }
}

function go(delta){
  if(!pdfDoc)return;
  const target=page+delta;
  if(target<1||target>pdfDoc.numPages)return;
  page=target;
  scale=1;
  syncBookmarkState();
  drawPage();
}

function goToPage(target){
  if(!pdfDoc)return;
  const n=Math.max(1,Math.min(pdfDoc.numPages,Number(target)||1));
  page=n;
  scale=1;
  syncBookmarkState();
  closeSheet();
  drawPage();
}

function showSheet(title,contentBuilder){
  sheetTitle.textContent=title;
  sheetContent.replaceChildren();
  contentBuilder(sheetContent);
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden','false');
  sheetOpen=true;

  // One extra history entry makes the Android Back button close the sheet first.
  if(!history.state?.readerSheet){
    history.pushState({readerSheet:true},'',location.href);
  }
}

function hideSheetOnly(){
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden','true');
  sheetOpen=false;
}

function closeSheet(){
  if(!sheetOpen)return;
  hideSheetOnly();
  if(history.state?.readerSheet)history.back();
}

function openToc(){
  showSheet('Daftar Isi',container=>{
    const grid=document.createElement('div');
    grid.className='toc-grid';
    for(let i=1;i<=pdfDoc.numPages;i++){
      const btn=document.createElement('button');
      btn.type='button';
      btn.textContent=String(i);
      btn.classList.toggle('current',i===page);
      btn.addEventListener('click',()=>goToPage(i));
      grid.appendChild(btn);
    }
    container.appendChild(grid);
  });
}

async function toggleFullscreen(){
  hideSheetOnly();
  if(history.state?.readerSheet)history.back();

  try{
    if(document.fullscreenElement){
      await document.exitFullscreen();
    }else if(document.documentElement.requestFullscreen){
      await document.documentElement.requestFullscreen();
    }else{
      // Safe fallback for installed PWA/browser variants without Fullscreen API.
      document.body.classList.toggle('controls-off');
      scale=1;
      drawPage();
    }
  }catch{
    document.body.classList.toggle('controls-off');
    scale=1;
    drawPage();
  }
}

async function shareReading(){
  hideSheetOnly();
  if(history.state?.readerSheet)history.back();

  const url=new URL(location.href);
  url.searchParams.set('book',book.id);
  const data={
    title:book.title,
    text:`Baca ${book.title} di aplikasi Amaliyah`,
    url:url.toString()
  };

  if(navigator.share){
    try{
      await navigator.share(data);
      return;
    }catch(err){
      if(err?.name==='AbortError')return;
    }
  }

  try{
    await navigator.clipboard.writeText(data.url);
    alert('Tautan bacaan sudah disalin.');
  }catch{
    prompt('Salin tautan bacaan ini:',data.url);
  }
}

function openMore(){
  showSheet('Lainnya',container=>{
    const full=document.createElement('button');
    full.type='button';
    full.className='sheet-action';
    full.textContent=document.fullscreenElement?'Keluar layar penuh':'Layar penuh';
    full.addEventListener('click',toggleFullscreen);

    const share=document.createElement('button');
    share.type='button';
    share.className='sheet-action';
    share.textContent='Bagikan bacaan';
    share.addEventListener('click',shareReading);

    container.append(full,share);
  });
}

// Controls
$('#readerBack').addEventListener('click',e=>{e.stopPropagation();leaveReader();});
$('#prev').addEventListener('click',e=>{e.stopPropagation();go(-1);});
$('#next').addEventListener('click',e=>{e.stopPropagation();go(1);});
$('#zoomIn').addEventListener('click',e=>{e.stopPropagation();scale=Math.min(2.2,scale+.2);drawPage();});
$('#zoomOut').addEventListener('click',e=>{e.stopPropagation();scale=Math.max(.8,scale-.2);drawPage();});
$('#bookmarkTop').addEventListener('click',e=>{e.stopPropagation();toggleBookmark();});
$('#bookmarkBottom').addEventListener('click',e=>{e.stopPropagation();toggleBookmark();});
$('#tocBtn').addEventListener('click',e=>{e.stopPropagation();openToc();});
$('#moreBtn').addEventListener('click',e=>{e.stopPropagation();openMore();});
$('#sheetClose').addEventListener('click',closeSheet);

// Tap outside the bottom sheet closes it.
sheet.addEventListener('click',e=>{
  if(e.target===sheet)closeSheet();
});
$('.sheet-card').addEventListener('click',e=>e.stopPropagation());

// Android/browser Back closes an open sheet before leaving the Reader.
window.addEventListener('popstate',()=>{
  if(sheetOpen){
    hideSheetOnly();
  }
});

// Reader tap: hide/show controls. Do not toggle after a swipe.
stage.addEventListener('click',e=>{
  if(e.target.closest('button')||swiped){
    swiped=false;
    return;
  }
  document.body.classList.toggle('controls-off');
  scale=1;
  drawPage();
});

stage.addEventListener('touchstart',e=>{
  startX=e.touches[0].clientX;
  startY=e.touches[0].clientY;
  swiped=false;
},{passive:true});

stage.addEventListener('touchend',e=>{
  const dx=e.changedTouches[0].clientX-startX;
  const dy=e.changedTouches[0].clientY-startY;
  if(Math.abs(dx)>70 && Math.abs(dx)>Math.abs(dy)*1.4){
    swiped=true;
    // RTL reading: left -> right = next page.
    if(dx>0)go(1);
    else go(-1);
    setTimeout(()=>{swiped=false},300);
  }
},{passive:true});

window.addEventListener('keydown',e=>{
  if(e.key==='Escape' && sheetOpen){closeSheet();return;}
  if(e.key==='ArrowRight')go(1);
  if(e.key==='ArrowLeft')go(-1);
});

window.addEventListener('resize',()=>drawPage());
document.addEventListener('fullscreenchange',()=>{scale=1;drawPage();});
window.addEventListener('pagehide',recordHistory);

// Load PDF
pdfDoc=await pdfjsLib.getDocument(book.pdf).promise;
page=Math.min(page,pdfDoc.numPages);
syncBookmarkState();
drawPage();
