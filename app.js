const $ = s => document.querySelector(s);
const store = localStorage;
const books = window.AMALIYAH_BOOKS || [];
const categories = window.AMALIYAH_CATEGORIES || ['Semua'];
let prayerCountdownTimer = null;

function show(id){
  ['#app','#library','#settings','#monthly'].forEach(x=>$(x)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  scrollTo(0,0);
}
function showHome(){show('#app');updateHome();}
function showLibrary(category='Semua'){show('#library');renderLibrary(category);}
function showSettings(){show('#settings');syncSettingsLocation();}
function showMonthly(){show('#monthly');renderMonthlyHeader();loadMonthlyPrayerTimes();}
function getBook(id){return books.find(b=>b.id===id) || books[0];}
function pageKey(id){return `book:${id}:page`;}
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
$('#monthlyBtn')?.addEventListener('click',showMonthly);

function dateKey(d=new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function cachePrayerKey(){return `prayer:${dateKey()}`;}
function getSavedLocation(){
  try{return JSON.parse(store.getItem('amaliyah:location')||'null');}catch{return null;}
}
function saveLocation(loc){store.setItem('amaliyah:location',JSON.stringify(loc));}
function syncSettingsLocation(){
  const loc=getSavedLocation();
  if(!loc)return;
  $('#settingsLocation').textContent=`Lokasi aktif: ${loc.label}`;
}
function setLocationLabel(label){
  $('#location').textContent=`📍 ${label}`;
  $('#settingsLocation').textContent=`Lokasi aktif: ${label}`;
}

async function reverseGeocode(latitude,longitude){
  try{
    const r=await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=id`);
    if(!r.ok) throw new Error('reverse geocode');
    const j=await r.json();
    const city=j.city||j.locality||j.principalSubdivision||'Lokasi Anda';
    const region=j.principalSubdivision && j.principalSubdivision!==city ? `, ${j.principalSubdivision}` : '';
    return `${city}${region}`;
  }catch{return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;}
}

async function fetchPrayerTimes(latitude,longitude){
  const d=new Date(),date=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const r=await fetch(`https://api.aladhan.com/v1/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=20&school=0`);
  const j=await r.json();
  if(!j?.data?.timings) throw new Error('Jadwal tidak tersedia');
  return j.data;
}

function getPrayerTimes(){
  if(!navigator.geolocation){$('#location').textContent='Lokasi tidak didukung perangkat';return;}
  $('#location').textContent='📍 Mencari lokasi…';
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude,longitude}=pos.coords;
    const label=await reverseGeocode(latitude,longitude);
    const loc={latitude,longitude,label,updatedAt:Date.now()};
    saveLocation(loc); setLocationLabel(label);
    try{
      const data=await fetchPrayerTimes(latitude,longitude);
      store.setItem(cachePrayerKey(),JSON.stringify(data));
      renderPrayerData(data);
    }catch(e){
      $('#prayerTimes').innerHTML='<span>Jadwal gagal dimuat. Periksa internet.</span>';
    }
  },()=>{$('#location').textContent='📍 Izin lokasi belum diberikan';},{enableHighAccuracy:false,timeout:12000,maximumAge:3600000});
}

function cleanTime(v=''){return String(v).split(' ')[0].slice(0,5);}
function renderPrayerData(data){
  renderPrayers(data.timings);
  const hijri=data.date?.hijri;
  if(hijri){
    const h=`${hijri.day} ${hijri.month?.en||''} ${hijri.year} H`;
    $('#hijriDate').textContent=h;
  }
}
function renderPrayers(t){
  if(!t)return;
  const names=[['Subuh','Fajr'],['Dzuhur','Dhuhr'],['Ashar','Asr'],['Maghrib','Maghrib'],['Isya','Isha']];
  const parsed=names.map(([n,k])=>{const tm=cleanTime(t[k]),a=tm.split(':').map(Number);return {n,k,tm,mins:a[0]*60+a[1]};});
  const update=()=>{
    const now=new Date(),cur=now.getHours()*60+now.getMinutes();
    let next=parsed.find(x=>x.mins>cur);
    if(!next){const f=parsed[0];next={...f,mins:f.mins+1440};}
    $('#prayerTimes').innerHTML=parsed.map(x=>`<div class="time ${x.n===next.n?'active':''}">${x.n}<b>${x.tm}</b></div>`).join('');
    const diff=Math.max(0,next.mins-cur),h=Math.floor(diff/60),m=diff%60;
    $('#nextPrayer').innerHTML=`<b>Sholat berikutnya: ${next.n} — ${next.tm}</b><br>${h?h+' jam ':''}${m} menit lagi`;
  };
  update(); clearInterval(prayerCountdownTimer); prayerCountdownTimer=setInterval(update,30000);
}

let monthlyOffset=0;
function renderMonthlyHeader(){
  const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+monthlyOffset);
  $('#monthlyTitle').textContent=new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(d);
}
async function loadMonthlyPrayerTimes(){
  const loc=getSavedLocation();
  if(!loc){$('#monthlyTable').innerHTML='<div class="empty-state">Aktifkan lokasi terlebih dahulu dari Beranda atau Pengaturan.</div>';return;}
  const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+monthlyOffset);
  const month=d.getMonth()+1,year=d.getFullYear();
  $('#monthlyTable').innerHTML='<div class="empty-state">Memuat jadwal bulanan…</div>';
  try{
    const r=await fetch(`https://api.aladhan.com/v1/calendar/${year}/${month}?latitude=${loc.latitude}&longitude=${loc.longitude}&method=20&school=0`);
    const j=await r.json(); const rows=j?.data||[];
    const today=dateKey();
    $('#monthlyTable').innerHTML=`<div class="monthly-grid monthly-head"><b>Tgl</b><b>Subuh</b><b>Dzuhur</b><b>Ashar</b><b>Maghrib</b><b>Isya</b></div>`+rows.map(item=>{
      const g=item.date.gregorian; const key=`${g.year}-${String(g.month.number).padStart(2,'0')}-${String(g.day).padStart(2,'0')}`;
      const t=item.timings;
      return `<div class="monthly-grid ${key===today?'today':''}"><span>${Number(g.day)}</span><span>${cleanTime(t.Fajr)}</span><span>${cleanTime(t.Dhuhr)}</span><span>${cleanTime(t.Asr)}</span><span>${cleanTime(t.Maghrib)}</span><span>${cleanTime(t.Isha)}</span></div>`;
    }).join('');
  }catch{$('#monthlyTable').innerHTML='<div class="empty-state">Jadwal bulanan gagal dimuat.</div>';}
}
function changeMonth(step){monthlyOffset+=step;renderMonthlyHeader();loadMonthlyPrayerTimes();}

async function requestNotifications(){
  if(!('Notification'in window))return alert('Browser ini tidak mendukung notifikasi web.');
  const p=await Notification.requestPermission();
  if(p==='granted')new Notification('Amaliyah',{body:'Izin notifikasi berhasil diaktifkan.'});
  else alert('Izin notifikasi belum diberikan.');
}

async function bootPrayer(){
  const loc=getSavedLocation();
  if(loc)setLocationLabel(loc.label);
  const cached=store.getItem(cachePrayerKey());
  if(cached){try{renderPrayerData(JSON.parse(cached));return;}catch{}}
  if(loc){
    try{const data=await fetchPrayerTimes(loc.latitude,loc.longitude);store.setItem(cachePrayerKey(),JSON.stringify(data));renderPrayerData(data);return;}catch{}
  }
  $('#prayerTimes').innerHTML='<span>Izinkan lokasi untuk menampilkan jadwal sholat.</span>';
}

window.showHome=showHome; window.showLibrary=showLibrary; window.showSettings=showSettings; window.showMonthly=showMonthly; window.changeMonth=changeMonth; window.openReader=openReader; window.getPrayerTimes=getPrayerTimes; window.requestNotifications=requestNotifications;
window.addEventListener('load',()=>{updateHome();renderLibrary('Semua');syncSettingsLocation();bootPrayer();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
