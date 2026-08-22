const $ = s => document.querySelector(s);
const store = localStorage;
const books = window.AMALIYAH_BOOKS || [];
const categories = window.AMALIYAH_CATEGORIES || ['Semua'];
let prayerCountdownTimer = null;
let activeLibraryCategory='Semua';
let librarySearchQuery='';

const SCREEN_TO_ID={home:'#app',library:'#library',settings:'#settings',monthly:'#monthly',bookmarks:'#bookmarks',history:'#history'};
let currentScreen='home';

function paintScreen(screen='home'){
  const id=SCREEN_TO_ID[screen]||SCREEN_TO_ID.home;
  Object.values(SCREEN_TO_ID).forEach(x=>$(x)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  currentScreen=screen;
  scrollTo(0,0);
}
function navigateScreen(screen='home',opts={}){
  const {push=true,category='Semua',focusNotifications=false}=opts;
  if(push && currentScreen!==screen){
    history.pushState({amaliyah:true,screen,category,focusNotifications},'',location.href);
  }else if(!history.state?.amaliyah){
    history.replaceState({amaliyah:true,screen,category,focusNotifications},'',location.href);
  }
  paintScreen(screen);
  if(screen==='home')updateHome();
  if(screen==='library')renderLibrary(category);
  if(screen==='settings'){
    syncSettingsLocation();
    if(focusNotifications){
      requestAnimationFrame(()=>$('#notificationSettings')?.scrollIntoView({behavior:'smooth',block:'start'}));
    }
  }
  if(screen==='monthly'){renderMonthlyHeader();loadMonthlyPrayerTimes();}
  if(screen==='bookmarks')renderBookmarks();
  if(screen==='history')renderHistory();
}
function showHome(){navigateScreen('home')}
function showLibrary(category='Semua'){navigateScreen('library',{category})}
function showSettings(focusNotifications=false){navigateScreen('settings',{focusNotifications})}
function showMonthly(){navigateScreen('monthly')}
function goBackInApp(){
  if(currentScreen==='home')return;
  history.back();
}
window.addEventListener('popstate',e=>{
  const st=e.state;
  if(st?.amaliyah){
    navigateScreen(st.screen||'home',{push:false,category:st.category||'Semua',focusNotifications:!!st.focusNotifications});
  }else{
    paintScreen('home');updateHome();
  }
});
function getBook(id){return books.find(b=>b.id===id) || books[0];}
function pageKey(id){return `book:${id}:page`;}
function lastBookId(){return store.getItem('amaliyah:lastBook') || books[0]?.id;}
function openReader(id=lastBookId(), bookmark=false){
  const book=getBook(id); if(!book)return;
  store.setItem('amaliyah:lastBook', book.id);
  recordHistoryEntry(book.id, Math.max(1, +(store.getItem(pageKey(book.id))||1)));
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
  renderHomeFavorites();
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
  activeLibraryCategory=active;
  const wrap=$('#categoryChips'); if(!wrap)return;
  wrap.innerHTML=categories.map(cat=>`<button class="chip ${cat===active?'active':''}" data-cat="${cat}">${cat}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach(btn=>btn.onclick=()=>{
    activeLibraryCategory=btn.dataset.cat;
    renderLibrary(activeLibraryCategory);
  });
}
function normalizedSearchText(book){
  return [book.title,book.arabicTitle,book.category,book.coverText].filter(Boolean).join(' ').toLocaleLowerCase('id-ID');
}
function renderLibrary(category=activeLibraryCategory||'Semua'){
  activeLibraryCategory=category;
  renderChips(category);
  const list=$('#bookList'); if(!list)return;
  const q=(librarySearchQuery||'').trim().toLocaleLowerCase('id-ID');
  let filtered=category==='Semua'?books:books.filter(b=>b.category===category);
  if(q) filtered=filtered.filter(book=>normalizedSearchText(book).includes(q));

  if(!filtered.length){
    list.innerHTML=`<div class="empty-state"><b>${q?'Bacaan tidak ditemukan':'Belum ada bacaan'}</b><p>${q?'Coba kata kunci lain atau pilih kategori Semua.':'Belum ada bacaan pada kategori ini.'}</p></div>`;
    return;
  }

  list.innerHTML=filtered.map(book=>{
    const pr=bookProgress(book);
    const progress=pr.page>1?`Terakhir hal. ${pr.page}`:`${pr.total} halaman`;
    const favorite=isFavorite(book.id);
    return `<div class="book-row library-book-row" data-book-row="${book.id}">
      <button class="book-main" type="button" data-open-book="${book.id}" aria-label="Buka ${book.title}">
        <div class="book-icon">${book.icon||'▣'}</div>
        <div class="book-copy"><b>${book.title}</b><small>${book.arabicTitle||''}</small></div>
        <em>${progress}</em>
        <span class="chevron">›</span>
      </button>
      <button class="favorite-btn ${favorite?'active':''}" type="button" data-favorite="${book.id}" aria-label="${favorite?'Hapus dari favorit':'Tambahkan ke favorit'}" title="${favorite?'Hapus dari favorit':'Tambahkan ke favorit'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>
      </button>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-open-book]').forEach(btn=>btn.onclick=()=>openReader(btn.dataset.openBook));
  list.querySelectorAll('[data-favorite]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    toggleFavorite(btn.dataset.favorite);
  });
}

const fmtDate=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
$('#dateText').textContent=fmtDate.format(new Date());
$('#locBtn').onclick=getPrayerTimes;
$('#monthlyBtn')?.addEventListener('click',showMonthly);
$('#notifBtn')?.addEventListener('click',()=>showSettings(true));

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



/* ===== V2.12 Fixed: unified auxiliary screens ===== */
function showBookmarks(){ navigateScreen('bookmarks'); }
function showHistory(){ navigateScreen('history'); }
function goBackScreen(){ goBackInApp(); }

function bookTitleById(id){
  const b=getBook(id);
  return b?.title || id;
}
function openBookAt(id,page){
  const book=getBook(id);
  if(!book)return;
  if(page) store.setItem(pageKey(book.id), String(page));
  store.setItem('amaliyah:lastBook', book.id);
  location.href=`reader.html?book=${encodeURIComponent(book.id)}`;
}
function renderBookmarks(){
  const wrap=$('#bookmarkList');
  if(!wrap)return;
  const entries=[];
  Object.keys(localStorage).forEach(k=>{
    if(k.startsWith('amaliyah_bookmark_')){
      const id=k.replace('amaliyah_bookmark_','');
      const page=parseInt(localStorage.getItem(k)||'0',10);
      if(page>0)entries.push({id,page});
    }
  });
  if(!entries.length){
    wrap.innerHTML='<div class="empty-state"><b>Belum ada bookmark</b><p>Simpan halaman penting dari Reader agar muncul di sini.</p></div>';
    return;
  }
  wrap.innerHTML=entries.map(x=>`<button class="book-row action-row" onclick="openBookAt('${x.id}',${x.page})"><div class="book-icon">🔖</div><div><b>${bookTitleById(x.id)}</b><small>Halaman ${x.page}</small></div><span>›</span></button>`).join('');
}
function renderHistory(){
  const wrap=$('#historyList');
  if(!wrap)return;
  let hist=[];
  try{hist=JSON.parse(store.getItem('amaliyah_history')||'[]')}catch{}
  if(!hist.length){
    wrap.innerHTML='<div class="empty-state"><b>Belum ada riwayat</b><p>Bacaan yang dibuka akan tercatat otomatis di sini.</p></div>';
    return;
  }
  wrap.innerHTML=hist.map(x=>`<button class="book-row action-row" onclick="openBookAt('${x.id}',${x.page||1})"><div class="book-icon">◷</div><div><b>${bookTitleById(x.id)}</b><small>Terakhir halaman ${x.page||1}</small></div><span>›</span></button>`).join('');
}
function toggleSearch(){
  const box=$('#searchBox');
  const input=$('#searchInput');
  if(!box)return;
  const opening=box.classList.contains('hidden');
  box.classList.toggle('hidden');
  $('#searchToggleBtn')?.classList.toggle('active', opening);
  if(opening){
    setTimeout(()=>input?.focus(),60);
  }else{
    librarySearchQuery='';
    if(input)input.value='';
    renderLibrary(activeLibraryCategory);
  }
}
function filterBooks(){
  librarySearchQuery=($('#searchInput')?.value||'').trim();
  $('#clearSearchBtn')?.classList.toggle('visible', !!librarySearchQuery);
  renderLibrary(activeLibraryCategory);
}
function clearSearch(){
  const input=$('#searchInput');
  if(input)input.value='';
  librarySearchQuery='';
  $('#clearSearchBtn')?.classList.remove('visible');
  renderLibrary(activeLibraryCategory);
  input?.focus();
}

const FAVORITES_KEY='amaliyah:favorites';
function getFavorites(){
  try{
    const value=JSON.parse(store.getItem(FAVORITES_KEY)||'[]');
    return Array.isArray(value)?value.filter(id=>books.some(b=>b.id===id)):[];
  }catch{return []}
}
function saveFavorites(ids){
  store.setItem(FAVORITES_KEY,JSON.stringify([...new Set(ids)]));
}
function isFavorite(id){return getFavorites().includes(id);}
function toggleFavorite(id){
  let ids=getFavorites();
  if(ids.includes(id))ids=ids.filter(x=>x!==id);
  else ids.push(id);
  saveFavorites(ids);
  renderLibrary(activeLibraryCategory);
  renderHomeFavorites();
}
function renderHomeFavorites(){
  const section=$('#favoritesSection');
  const wrap=$('#favoriteBooks');
  if(!section||!wrap)return;
  const ids=getFavorites();
  const favBooks=ids.map(id=>getBook(id)).filter(Boolean);
  section.classList.toggle('hidden',favBooks.length===0);
  if(!favBooks.length){wrap.innerHTML='';return;}
  wrap.innerHTML=favBooks.map(book=>`<button class="favorite-card" type="button" data-fav-open="${book.id}">
    <span class="favorite-cover">${(book.coverText||book.arabicTitle||book.icon||'◈').replace(/\n/g,'<br>')}</span>
    <span class="favorite-copy"><b>${book.title}</b><small>${book.category}</small></span>
    <span class="favorite-star" aria-hidden="true">★</span>
  </button>`).join('');
  wrap.querySelectorAll('[data-fav-open]').forEach(btn=>btn.onclick=()=>openReader(btn.dataset.favOpen));
}
function recordHistoryEntry(id,page=1){
  let hist=[];
  try{hist=JSON.parse(store.getItem('amaliyah_history')||'[]')}catch{}
  hist=hist.filter(x=>x.id!==id);
  hist.unshift({id,page,ts:Date.now()});
  store.setItem('amaliyah_history',JSON.stringify(hist.slice(0,20)));
}

window.showBookmarks=showBookmarks;
window.showHistory=showHistory;
window.goBackScreen=goBackScreen;
window.openBookAt=openBookAt;
window.toggleSearch=toggleSearch;
window.filterBooks=filterBooks;
window.clearSearch=clearSearch;
window.toggleFavorite=toggleFavorite;

window.showHome=showHome; window.showLibrary=showLibrary; window.showSettings=showSettings; window.showMonthly=showMonthly; window.showBookmarks=showBookmarks; window.showHistory=showHistory; window.goBackInApp=goBackInApp; window.changeMonth=changeMonth; window.openReader=openReader; window.getPrayerTimes=getPrayerTimes; window.requestNotifications=requestNotifications;
window.addEventListener('load',()=>{history.replaceState({amaliyah:true,screen:'home'},'',location.href);paintScreen('home');updateHome();renderLibrary('Semua');syncSettingsLocation();bootPrayer();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
