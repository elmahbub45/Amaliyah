import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const books=window.AMALIYAH_BOOKS||[];
const params=new URLSearchParams(location.search);
const bookId=params.get('book')||books[0]?.id;
const book=books.find(b=>b.id===bookId)||books[0];
if(!book) throw new Error('Data bacaan tidak ditemukan.');

document.title=book.title;
document.querySelector('#readerTitle').textContent=book.title;
localStorage.setItem('amaliyah:lastBook',book.id);

const pageKey=`book:${book.id}:page`, bookmarkKey=`book:${book.id}:bookmark`;
let doc,page=+(localStorage.getItem(pageKey)||1),scale=1,rendering=false,startX=0,startY=0;
const canvas=document.querySelector('#pdf'),ctx=canvas.getContext('2d'),counter=document.querySelector('#counter');

function leaveReader(){
  if(history.length>1) history.back();
  else location.href='./index.html';
}
document.querySelector('#readerBack')?.addEventListener('click',e=>{e.stopPropagation();leaveReader();});

doc=await pdfjsLib.getDocument(book.pdf).promise;
page=Math.min(page,doc.numPages);

if(params.get('bookmark')==='1'){
  const b=+localStorage.getItem(bookmarkKey); if(b)page=Math.min(b,doc.numPages);
}
render();

async function render(){
  if(rendering)return; rendering=true;
  const p=await doc.getPage(page),base=p.getViewport({scale:1}),controlsOff=document.body.classList.contains('controls-off');
  const availableW=controlsOff?innerWidth:(innerWidth-18),availableH=controlsOff?innerHeight:(innerHeight-150);
  const fit=Math.min(availableW/base.width,availableH/base.height),vp=p.getViewport({scale:fit*scale}),dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.floor(vp.width*dpr);canvas.height=Math.floor(vp.height*dpr);canvas.style.width=vp.width+'px';canvas.style.height=vp.height+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);await p.render({canvasContext:ctx,viewport:vp}).promise;
  counter.textContent=`${page} / ${doc.numPages}`;localStorage.setItem(pageKey,page);rendering=false;
}
function go(n){const x=page+n;if(x<1||x>doc.numPages)return;page=x;scale=1;render();}
document.querySelector('#next').onclick=e=>{e.stopPropagation();go(1)};
document.querySelector('#prev').onclick=e=>{e.stopPropagation();go(-1)};
document.querySelector('#zoomIn').onclick=e=>{e.stopPropagation();scale=Math.min(2.2,scale+.2);render()};
document.querySelector('#zoomOut').onclick=e=>{e.stopPropagation();scale=Math.max(.8,scale-.2);render()};
document.querySelector('#mark').onclick=e=>{e.stopPropagation();localStorage.setItem(bookmarkKey,page);e.currentTarget.firstChild.textContent='♥'};
document.querySelector('#bookmark').onclick=e=>{e.stopPropagation();const b=+localStorage.getItem(bookmarkKey);if(b){page=b;scale=1;render()}};
document.querySelector('#stage').addEventListener('click',()=>{document.body.classList.toggle('controls-off');scale=1;render()});
document.querySelector('#stage').addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY},{passive:true});
document.querySelector('#stage').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.4){if(dx>0)go(1);else go(-1)}},{passive:true});
addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1)});addEventListener('resize',()=>render());


// ===== V2.8 Reader functional fixes =====
let renderBusyV28=false;
function closeReaderSheet(){ document.getElementById('readerSheet')?.classList.add('hidden'); }
function openReaderSheet(title,html){
  const s=document.getElementById('readerSheet');
  if(!s) return;
  document.getElementById('sheetTitle').textContent=title;
  document.getElementById('sheetContent').innerHTML=html;
  s.classList.remove('hidden');
}
document.getElementById('tocBtn')?.addEventListener('click', ()=>{
  const total=window.pdfDoc?.numPages || window.totalPages || 1;
  openReaderSheet('Daftar Isi', `<div class="toc-grid">${Array.from({length:total},(_,i)=>`<button onclick="goToPageV28(${i+1})">${i+1}</button>`).join('')}</div>`);
});
document.getElementById('moreBtn')?.addEventListener('click', ()=>{
  openReaderSheet('Lainnya', `<button class="sheet-action" onclick="toggleFullscreenV28()">Layar penuh</button><button class="sheet-action" onclick="shareReaderV28()">Bagikan bacaan</button>`);
});
function goToPageV28(p){
  closeReaderSheet();
  if(typeof queueRenderPage==='function'){ pageNum=p; queueRenderPage(p); }
  else if(typeof renderPage==='function'){ pageNum=p; renderPage(p); }
}
async function toggleFullscreenV28(){
  closeReaderSheet();
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch(e){}
}
async function shareReaderV28(){
  closeReaderSheet();
  const data={title:document.title,text:'Bacaan di aplikasi Amaliyah',url:location.href};
  if(navigator.share){ try{ await navigator.share(data); }catch(e){} }
  else { try{ await navigator.clipboard.writeText(location.href); alert('Tautan disalin.'); }catch(e){} }
}
// Bookmark feedback + per-book persistence
const oldBookmarkV28 = typeof toggleBookmark==='function' ? toggleBookmark : null;
if(oldBookmarkV28){
  toggleBookmark = function(){
    oldBookmarkV28();
    try{
      const id=new URLSearchParams(location.search).get('id')||localStorage.getItem('amaliyah_open_book')||'wirdul-latif';
      const p=window.pageNum||1;
      localStorage.setItem(`amaliyah_bookmark_${id}`, String(p));
      document.querySelectorAll('[data-bookmark],#bookmarkBtn').forEach(b=>b.classList.add('saved'));
    }catch(e){}
  };
}
// Record reading history
window.addEventListener('beforeunload', ()=>{
  try{
    const id=new URLSearchParams(location.search).get('id')||localStorage.getItem('amaliyah_open_book')||'wirdul-latif';
    const p=window.pageNum||1;
    let hist=[]; try{hist=JSON.parse(localStorage.getItem('amaliyah_history')||'[]')}catch(e){}
    hist=hist.filter(x=>x.id!==id); hist.unshift({id,page:p,ts:Date.now()}); hist=hist.slice(0,20);
    localStorage.setItem('amaliyah_history', JSON.stringify(hist));
  }catch(e){}
});
