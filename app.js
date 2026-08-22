const $ = s => document.querySelector(s);
const store = localStorage;
const books = window.AMALIYAH_BOOKS || [];
const categories = window.AMALIYAH_CATEGORIES || ['Semua'];

function show(id){
  ['#app','#library','#settings'].forEach(x=>$(x)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  scrollTo(0,0);
}
function showHome(){show('#app');updateHome();}
function showLibrary(category='Semua'){show('#library');renderLibrary(category);}
function showSettings(){show('#settings');}
function getBook(id){return books.find(b=>b.id===id) || books[0];}
function pageKey(id){return `book:${id}:page`;}
function bookmarkKey(id){return `book:${id}:bookmark`;}
function lastBookId(){return store.getItem('amaliyah:lastBook') || books[0]?.id;}
function openReader(id=lastBookId(), bookmark=false){
  const book=getBook(id); if(!book)return;
  location.href=`reader.html?book=${encodeURIComponent(book.id)}${bookmark?'&bookmark=1':''}`;
}

function bookProgress(book){
  const p=Math.max(1, +(store.getItem(pageKey(book.id))||1));
  const total=book.pages||1;
  return {page:Math.min(p,total),total,percent:Math.min(100,(p/total)*100)};
}

function updateHome(){
  const book=getBook(lastBookId()); if(!book)return;
  const pr=bookProgress(book);
  $('#continueTitle').textContent=book.title;
  $('#continueCover').innerHTML=(book.coverText||book.arabicTitle||book.title).replace(/\n/g,'<br>');
  $('#lastPage').textContent=pr.page>1?`Halaman terakhir: ${pr.page} / ${pr.total}`:'Belum dibaca';
  $('#progressBar').style.width=pr.percent+'%';
  $('#continueBtn').onclick=()=>openReader(book.id);
  $('#recentTitle').textContent=book.title;
  $('#recentPage').textContent=pr.page>1?`Halaman ${pr.page} dari ${pr.total}`:'Ketuk untuk membaca';
  $('#recentBook').onclick=()=>openReader(book.id);
  updateCategoryCounts();
}

function updateCategoryCounts(){
  document.querySelectorAll('[data-category-card]').forEach(el=>{
    const cat=el.dataset.categoryCard;
    const count=books.filter(b=>b.category===cat).length;
    const label=el.querySelector('small');
    if(label) label.textContent=count?`${count} Bacaan`:'Segera';
    el.onclick=()=>showLibrary(cat);
  });
}

function renderChips(active='Semua'){
  const wrap=$('#categoryChips'); if(!wrap)return;
  wrap.innerHTML=categories.map(cat=>`<button class="chip ${cat===active?'active':''}" data-cat="${cat}">${cat}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach(btn=>btn.onclick=()=>renderLibrary(btn.dataset.cat));
}

function renderLibrary(category='Semua'){
  renderChips(category);
  const list=$('#bookList'); if(!list)return;
  const filtered=category==='Semua'?books:books.filter(b=>b.category===category);
  if(!filtered.length){list.innerHTML='<div class="empty-state">Belum ada bacaan pada kategori ini.</div>';return;}
  list.innerHTML=filtered.map(book=>{
    const pr=bookProgress(book);
    const progress=pr.page>1?`Terakhir hal. ${pr.page}`:`${pr.total} halaman`;
    return `<button class="book-row" data-book="${book.id}"><div class="book-icon">${book.icon||'▣'}</div><div class="book-copy"><b>${book.title}</b><small>${book.arabicTitle||''}</small></div><em>${progress}</em><span>›</span></button>`;
  }).join('');
  list.querySelectorAll('[data-book]').forEach(row=>row.onclick=()=>openReader(row.dataset.book));
}

const fmtDate=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
$('#dateText').textContent=fmtDate.format(new Date());
$('#locBtn').onclick=getPrayerTimes;

function getPrayerTimes(){
  if(!navigator.geolocation){$('#location').textContent='Lokasi tidak didukung perangkat';return;}
  $('#location').textContent='📍 Mencari lokasi…';
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude,longitude}=pos.coords;
    $('#location').textContent=`📍 ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
    $('#settingsLocation').textContent=`Koordinat: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    try{
      const d=new Date(),date=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      const r=await fetch(`https://api.aladhan.com/v1/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=20&school=0`);
      const j=await r.json(); renderPrayers(j.data.timings);
    }catch(e){$('#prayerTimes').innerHTML='<span>Jadwal gagal dimuat. Periksa internet.</span>';}
  },()=>{$('#location').textContent='📍 Izin lokasi belum diberikan';});
}

function renderPrayers(t){
  const names=[['Subuh','Fajr'],['Dzuhur','Dhuhr'],['Ashar','Asr'],['Maghrib','Maghrib'],['Isya','Isha']];
  const now=new Date(),cur=now.getHours()*60+now.getMinutes(); let next=null;
  const parsed=names.map(([n,k])=>{const tm=t[k].split(' ')[0],a=tm.split(':').map(Number);return {n,k,tm,mins:a[0]*60+a[1]};});
  next=parsed.find(x=>x.mins>cur);
  if(!next){const f=parsed[0];next={...f,mins:f.mins+1440};}
  $('#prayerTimes').innerHTML=parsed.map(x=>`<div class="time ${x.n===next.n?'active':''}">${x.n}<b>${x.tm}</b></div>`).join('');
  const diff=next.mins-cur,h=Math.floor(diff/60),m=diff%60;
  $('#nextPrayer').innerHTML=`<b>Sholat berikutnya: ${next.n} — ${next.tm}</b><br>${h?h+' jam ':''}${m} menit lagi`;
  store.setItem('prayerTimes',JSON.stringify(t));
}

async function requestNotifications(){
  if(!('Notification'in window))return alert('Browser ini tidak mendukung notifikasi web.');
  const p=await Notification.requestPermission();
  if(p==='granted')new Notification('Amaliyah',{body:'Notifikasi telah diaktifkan.'});
  else alert('Izin notifikasi belum diberikan.');
}

window.showHome=showHome; window.showLibrary=showLibrary; window.showSettings=showSettings; window.openReader=openReader; window.getPrayerTimes=getPrayerTimes; window.requestNotifications=requestNotifications;
window.addEventListener('load',()=>{updateHome();renderLibrary('Semua');if(store.getItem('prayerTimes'))renderPrayers(JSON.parse(store.getItem('prayerTimes')));});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
