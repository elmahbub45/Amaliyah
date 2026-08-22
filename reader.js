import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const catalog=await fetch('./books.json',{cache:'no-store'}).then(r=>r.json());
const items=catalog.items||[];
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
const sheet=$('#readerSheet');
const sheetTitle=$('#sheetTitle');
const sheetContent=$('#sheetContent');
const nextPartBar=$('#nextPartBar');
const nextPartText=$('#nextPartText');
const nextPartBtn=$('#nextPartBtn');

document.title=item.type==='single'?item.title:`${item.title} — ${part.title}`;
$('#readerTitle').textContent=item.type==='single'?item.title:part.title;

localStorage.setItem('amaliyah:lastItem',item.id);
localStorage.setItem('amaliyah:lastBook',part.id);
if(item.type!=='single')localStorage.setItem(`collection:${item.id}:lastPart`,part.id);

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
  if(item.type==='single')return {index:-1,next:null,last:true};
  const index=item.parts.findIndex(p=>p.id===part.id);
  return {index,next:item.parts[index+1]||null,last:index===item.parts.length-1};
}

function updateNextPart(){
  if(!nextPartBar)return;
  if(item.type!=='collection' || !pdfDoc || page!==pdfDoc.numPages){
    nextPartBar.classList.add('hidden');return;
  }
  const pos=collectionPosition();
  nextPartBar.classList.remove('hidden');
  if(pos.next){
    nextPartText.textContent=`Bagian berikutnya: ${pos.next.title}`;
    nextPartBtn.classList.remove('hidden');
    nextPartBtn.textContent='Lanjut →';
    nextPartBtn.onclick=()=>openNextPart(pos.next);
  }else{
    nextPartText.textContent='Ini adalah bagian terakhir';
    nextPartBtn.classList.add('hidden');
  }
}

function openNextPart(next){
  localStorage.setItem(`collection:${item.id}:lastPart`,next.id);
  localStorage.setItem(`book:${next.id}:page`,'1');
  const url=`reader.html?book=${encodeURIComponent(item.id)}&part=${encodeURIComponent(next.id)}`;
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
      recordHistory();syncBookmarkState();updateNextPart();
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
  page=target;scale=1;syncBookmarkState();drawPage();
}
function goToPage(target){
  if(!pdfDoc)return;
  page=Math.max(1,Math.min(pdfDoc.numPages,Number(target)||1));
  scale=1;syncBookmarkState();closeSheet();drawPage();
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
    const share=document.createElement('button');share.type='button';share.className='sheet-action';
    share.textContent='Bagikan bacaan';share.onclick=shareReading;
    container.append(full,share);
  });
}

$('#readerBack').onclick=e=>{e.stopPropagation();leaveReader()};
$('#prev').onclick=e=>{e.stopPropagation();go(-1)};
$('#next').onclick=e=>{e.stopPropagation();go(1)};
$('#zoomIn').onclick=e=>{e.stopPropagation();scale=Math.min(2.2,scale+.2);drawPage()};
$('#zoomOut').onclick=e=>{e.stopPropagation();scale=Math.max(.8,scale-.2);drawPage()};
$('#bookmarkTop').onclick=e=>{e.stopPropagation();toggleBookmark()};
$('#bookmarkBottom').onclick=e=>{e.stopPropagation();toggleBookmark()};
$('#tocBtn').onclick=e=>{e.stopPropagation();openToc()};
$('#moreBtn').onclick=e=>{e.stopPropagation();openMore()};
$('#sheetClose').onclick=closeSheet;
sheet.onclick=e=>{if(e.target===sheet)closeSheet()};
$('.sheet-card').onclick=e=>e.stopPropagation();

window.addEventListener('popstate',()=>{if(sheetOpen)hideSheetOnly()});
stage.addEventListener('click',e=>{
  if(e.target.closest('button')||e.target.closest('#nextPartBar')||swiped){swiped=false;return}
  document.body.classList.toggle('controls-off');scale=1;drawPage();
});
stage.addEventListener('touchstart',e=>{
  startX=e.touches[0].clientX;startY=e.touches[0].clientY;swiped=false;
},{passive:true});
stage.addEventListener('touchend',e=>{
  const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
  if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.4){
    swiped=true;if(dx>0)go(1);else go(-1);setTimeout(()=>{swiped=false},300);
  }
},{passive:true});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&sheetOpen){closeSheet();return}
  if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1);
});
window.addEventListener('resize',()=>drawPage());
window.addEventListener('pagehide',recordHistory);

pdfDoc=await pdfjsLib.getDocument(part.file).promise;
page=Math.min(page,pdfDoc.numPages);
syncBookmarkState();
drawPage();
