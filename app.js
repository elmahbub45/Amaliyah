const $ = s => document.querySelector(s);
const store = localStorage;

const catalog = await fetch('./books.json', {cache:'no-store'}).then(r=>{
  if(!r.ok) throw new Error('books.json gagal dimuat');
  return r.json();
});
const items = catalog.items || [];
const categories = catalog.categories || ['Semua'];
let prayerCountdownTimer = null;
let prayerNotificationTimer = null;
let latestPrayerTimes = null;
let activeLibraryCategory='Semua';
let librarySearchQuery='';
let activeCollectionId=null;

const SCREEN_TO_ID={
  home:'#app', library:'#library', collection:'#collection',
  settings:'#settings', monthly:'#monthly', bookmarks:'#bookmarks', history:'#history'
};
let currentScreen='home';

function allParts(){
  const arr=[];
  items.forEach(item=>{
    if(item.type==='single') arr.push({parent:item,part:item});
    else (item.parts||[]).forEach(part=>arr.push({parent:item,part}));
  });
  return arr;
}
const partIndex=new Map(allParts().map(x=>[x.part.id,x]));

function getItem(id){ return items.find(x=>x.id===id) || null; }
function resolvePart(id){ return partIndex.get(id) || null; }
function pageKey(partId){ return `book:${partId}:page`; }
function lastPartKey(itemId){ return `collection:${itemId}:lastPart`; }

function migrateLegacyState(){
  // Last-read migration from the old flat catalog.
  const oldLast=store.getItem('amaliyah:lastBook');
  if(!store.getItem('amaliyah:lastItem') && oldLast){
    const match=resolvePart(oldLast);
    if(match){
      store.setItem('amaliyah:lastItem',match.parent.id);
      store.setItem(lastPartKey(match.parent.id),match.part.id);
    }
  }

  // Favorite migration: any favorited old sub-part becomes its parent collection/group.
  try{
    const fav=JSON.parse(store.getItem('amaliyah:favorites')||'[]');
    if(Array.isArray(fav)){
      const converted=fav.map(id=>{
        if(getItem(id)) return id;
        return resolvePart(id)?.parent.id;
      }).filter(Boolean);
      store.setItem('amaliyah:favorites',JSON.stringify([...new Set(converted)]));
    }
  }catch{}
}
migrateLegacyState();

function paintScreen(screen='home'){
  const id=SCREEN_TO_ID[screen]||SCREEN_TO_ID.home;
  Object.values(SCREEN_TO_ID).forEach(x=>$(x)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  currentScreen=screen;
  scrollTo(0,0);
}
function navigateScreen(screen='home',opts={}){
  const {push=true,category='Semua',focusNotifications=false,itemId=null}=opts;
  if(push && currentScreen!==screen){
    history.pushState({amaliyah:true,screen,category,focusNotifications,itemId},'',location.href);
  }else if(!history.state?.amaliyah){
    history.replaceState({amaliyah:true,screen,category,focusNotifications,itemId},'',location.href);
  }
  paintScreen(screen);
  if(screen==='home')updateHome();
  if(screen==='library')renderLibrary(category);
  if(screen==='collection')renderCollection(itemId||activeCollectionId);
  if(screen==='settings'){
    syncSettingsLocation();
    syncNotificationUI();
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
function showCollection(id){activeCollectionId=id;navigateScreen('collection',{itemId:id})}
function showSettings(focusNotifications=false){navigateScreen('settings',{focusNotifications})}
function showMonthly(){navigateScreen('monthly')}
function showBookmarks(){navigateScreen('bookmarks')}
function showHistory(){navigateScreen('history')}
function goBackInApp(){
  if(currentScreen==='home')return;
  history.back();
}
window.addEventListener('popstate',e=>{
  const st=e.state;
  if(st?.amaliyah){
    navigateScreen(st.screen||'home',{
      push:false,category:st.category||'Semua',
      focusNotifications:!!st.focusNotifications,itemId:st.itemId||null
    });
  }else{
    paintScreen('home');updateHome();
  }
});

function getLastState(){
  let itemId=store.getItem('amaliyah:lastItem');
  let item=getItem(itemId);
  if(!item) item=items[0];
  if(!item) return null;

  let part=item;
  if(item.type!=='single'){
    const pid=store.getItem(lastPartKey(item.id));
    part=(item.parts||[]).find(p=>p.id===pid) || item.parts?.[0];
  }
  return part ? {item,part} : null;
}

function partProgress(part){
  const p=Math.max(1,+(store.getItem(pageKey(part.id))||1));
  const total=part.pages||1;
  return {page:Math.min(p,total),total,percent:Math.min(100,(p/total)*100)};
}

function itemProgress(item){
  if(item.type==='single') return {...partProgress(item),part:item};
  const pid=store.getItem(lastPartKey(item.id));
  const part=(item.parts||[]).find(p=>p.id===pid) || item.parts?.[0];
  const pr=part ? partProgress(part) : {page:1,total:1,percent:0};
  return {...pr,part};
}

function openPart(itemId,partId,page=null){
  const item=getItem(itemId);
  if(!item)return;
  const part=item.type==='single' ? item : (item.parts||[]).find(p=>p.id===partId);
  if(!part)return;

  if(page) store.setItem(pageKey(part.id),String(page));
  store.setItem('amaliyah:lastItem',item.id);
  store.setItem('amaliyah:lastBook',part.id); // kompatibilitas lama
  if(item.type!=='single') store.setItem(lastPartKey(item.id),part.id);

  recordHistoryEntry(item.id,part.id,Math.max(1,+(store.getItem(pageKey(part.id))||1)));
  location.href=`reader.html?book=${encodeURIComponent(item.id)}${item.type!=='single'?`&part=${encodeURIComponent(part.id)}`:''}`;
}

function openItem(id){
  const item=getItem(id);
  if(!item)return;
  if(item.type==='single') return openPart(item.id,item.id);
  showCollection(item.id);
}

function continueItem(id){
  const item=getItem(id);
  if(!item)return;
  if(item.type==='single') return openPart(item.id,item.id);
  const partId=store.getItem(lastPartKey(item.id)) || item.parts?.[0]?.id;
  openPart(item.id,partId);
}

function itemSearchText(item){
  const parts=(item.parts||[]).flatMap(p=>[p.title,p.arabicTitle]).filter(Boolean);
  return [item.title,item.arabicTitle,item.category,item.coverText,...parts]
    .filter(Boolean).join(' ').toLocaleLowerCase('id-ID');
}

function updateHome(){
  const state=getLastState();
  if(!state)return;
  const {item,part}=state;
  const pr=partProgress(part);

  $('#continueTitle').textContent=item.title;
  $('#continueIcon').textContent=item.icon||'◈';
  if(item.type==='single'){
    $('#lastPage').textContent=pr.page>1?`Halaman terakhir: ${pr.page} / ${pr.total}`:'Belum dibaca';
  }else{
    $('#lastPage').textContent=`${part.title} • Hal. ${pr.page}/${pr.total}`;
  }
  $('#progressBar').style.width=pr.percent+'%';
  $('#continueBtn').onclick=()=>continueItem(item.id);

  updateCategoryCounts();
  renderHomeFavorites();
}

function updateCategoryCounts(){
  document.querySelectorAll('[data-category-card]').forEach(el=>{
    const cat=el.dataset.categoryCard;
    const count=cat==='Semua' ? items.length : items.filter(b=>b.category===cat).length;
    const label=el.querySelector('small');
    if(label){
      label.textContent=cat==='Semua'
        ? (count?`${count} Bacaan`:'Semua Bacaan')
        : (count?`${count} Bacaan`:'Segera');
    }
    el.onclick=()=>showLibrary(cat==='Semua'?'Semua':cat);
  });
}

function renderChips(active='Semua'){
  activeLibraryCategory=active;
  const wrap=$('#categoryChips');if(!wrap)return;
  wrap.innerHTML=categories.map(cat=>`<button class="chip ${cat===active?'active':''}" data-cat="${cat}">${cat}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach(btn=>btn.onclick=()=>renderLibrary(btn.dataset.cat));
}

function renderLibrary(category=activeLibraryCategory||'Semua'){
  activeLibraryCategory=category;
  renderChips(category);
  const list=$('#bookList');if(!list)return;
  const q=(librarySearchQuery||'').trim().toLocaleLowerCase('id-ID');
  let filtered=category==='Semua'?items:items.filter(x=>x.category===category);
  if(q) filtered=filtered.filter(item=>itemSearchText(item).includes(q));

  if(!filtered.length){
    list.innerHTML=`<div class="empty-state"><b>${q?'Bacaan tidak ditemukan':'Belum ada bacaan'}</b><p>${q?'Coba kata kunci lain atau pilih kategori Semua.':'Belum ada bacaan pada kategori ini.'}</p></div>`;
    return;
  }

  list.innerHTML=filtered.map(item=>{
    const fav=isFavorite(item.id);
    const pr=itemProgress(item);
    const meta=item.type==='single'
      ? (pr.page>1?`Terakhir hal. ${pr.page}`:`${pr.total} halaman`)
      : `${item.parts?.length||0} bagian`;
    const typeLabel=item.type==='collection'?'Koleksi':item.type==='group'?'Kelompok':item.category;

    return `<div class="book-row library-book-row">
      <button class="book-main" type="button" data-open-item="${item.id}">
        <div class="book-icon">${item.icon||'▣'}</div>
        <div class="book-copy"><b>${item.title}</b><small>${typeLabel}</small></div>
        <em>${meta}</em><span class="chevron">›</span>
      </button>
      <button class="favorite-btn ${fav?'active':''}" type="button" data-favorite="${item.id}" aria-label="${fav?'Hapus dari favorit':'Tambahkan ke favorit'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>
      </button>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-open-item]').forEach(btn=>btn.onclick=()=>openItem(btn.dataset.openItem));
  list.querySelectorAll('[data-favorite]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();toggleFavorite(btn.dataset.favorite);
  });
}

function renderCollection(id){
  const item=getItem(id);
  if(!item || item.type==='single')return;
  activeCollectionId=item.id;
  $('#collectionTitle').textContent=item.title;
  $('#collectionMeta').innerHTML=`<b>${item.type==='collection'?'Koleksi berurutan':'Kelompok bacaan'}</b><span>${item.parts.length} bagian</span>`;
  const wrap=$('#collectionList');

  wrap.innerHTML=item.parts.map((part,i)=>{
    const pr=partProgress(part);
    const label=pr.page>1?`Terakhir hal. ${pr.page}/${pr.total}`:`${pr.total} halaman`;
    return `<button class="collection-part" type="button" data-part="${part.id}">
      <span class="part-number">${String(i+1).padStart(2,'0')}</span>
      <span class="part-copy"><b>${part.title}</b><small>${label}</small></span>
      <span class="chevron">›</span>
    </button>`;
  }).join('');

  wrap.querySelectorAll('[data-part]').forEach(btn=>btn.onclick=()=>openPart(item.id,btn.dataset.part));
}

const FAVORITES_KEY='amaliyah:favorites';
function getFavorites(){
  try{
    const v=JSON.parse(store.getItem(FAVORITES_KEY)||'[]');
    return Array.isArray(v)?v.filter(id=>getItem(id)):[];
  }catch{return []}
}
function saveFavorites(ids){store.setItem(FAVORITES_KEY,JSON.stringify([...new Set(ids)]))}
function isFavorite(id){return getFavorites().includes(id)}
function toggleFavorite(id){
  let ids=getFavorites();
  ids=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
  saveFavorites(ids);
  renderLibrary(activeLibraryCategory);
  renderHomeFavorites();
}
function renderHomeFavorites(){
  const section=$('#favoritesSection'),wrap=$('#favoriteBooks');
  if(!section||!wrap)return;
  const fav=getFavorites().map(getItem).filter(Boolean);
  section.classList.toggle('hidden',!fav.length);
  if(!fav.length){wrap.innerHTML='';return}

  wrap.innerHTML=fav.map(item=>`<button class="favorite-card" type="button" data-fav="${item.id}">
    <span class="favorite-icon">${item.icon||'◈'}</span>
    <span class="favorite-copy"><b>${item.title}</b><small>${item.type==='collection'?'Koleksi':item.type==='group'?'Kelompok':item.category}</small></span>
    <span class="favorite-star">★</span>
  </button>`).join('');
  wrap.querySelectorAll('[data-fav]').forEach(btn=>btn.onclick=()=>openItem(btn.dataset.fav));
}

function recordHistoryEntry(itemId,partId,page=1){
  let hist=[];
  try{hist=JSON.parse(store.getItem('amaliyah_history')||'[]')}catch{}
  hist=hist.filter(x=>!(x.id===itemId && x.partId===partId));
  hist.unshift({id:itemId,partId,page,ts:Date.now()});
  store.setItem('amaliyah_history',JSON.stringify(hist.slice(0,30)));
}

function openBookAt(partId,page){
  const found=resolvePart(partId);
  if(!found)return;
  openPart(found.parent.id,found.part.id,page);
}

function renderBookmarks(){
  const wrap=$('#bookmarkList');if(!wrap)return;
  const entries=[];
  Object.keys(localStorage).forEach(k=>{
    if(!k.startsWith('amaliyah_bookmark_'))return;
    const partId=k.replace('amaliyah_bookmark_','');
    const page=+(localStorage.getItem(k)||0);
    const found=resolvePart(partId);
    if(found && page>0) entries.push({...found,page});
  });
  if(!entries.length){
    wrap.innerHTML='<div class="empty-state"><b>Belum ada bookmark</b><p>Simpan halaman penting dari Reader agar muncul di sini.</p></div>';
    return;
  }
  wrap.innerHTML=entries.map(x=>`<button class="book-row action-row" data-bookmark="${x.part.id}">
    <div class="book-icon">🔖</div>
    <div><b>${x.parent.title}</b><small>${x.parent.type==='single'?'':x.part.title+' • '}Halaman ${x.page}</small></div>
    <span>›</span>
  </button>`).join('');
  wrap.querySelectorAll('[data-bookmark]').forEach(btn=>{
    const id=btn.dataset.bookmark;
    const x=entries.find(e=>e.part.id===id);
    btn.onclick=()=>openPart(x.parent.id,x.part.id,x.page);
  });
}

function getHistoryEntries(){
  let hist=[];
  try{hist=JSON.parse(store.getItem('amaliyah_history')||'[]')}catch{}
  return hist.map((h,rawIndex)=>{
    if(h.partId){
      const parent=getItem(h.id);
      const part=parent?.type==='single'?parent:parent?.parts?.find(p=>p.id===h.partId);
      return parent&&part?{parent,part,page:h.page||1,rawIndex,raw:h}:null;
    }
    const old=resolvePart(h.id);
    return old?{parent:old.parent,part:old.part,page:h.page||1,rawIndex,raw:h}:null;
  }).filter(Boolean);
}

function renderHistory(){
  const wrap=$('#historyList');if(!wrap)return;
  const normalized=getHistoryEntries();
  $('#clearHistoryBtn')?.classList.toggle('hidden',!normalized.length);

  if(!normalized.length){
    wrap.innerHTML='<div class="empty-state"><b>Belum ada riwayat</b><p>Bacaan yang dibuka akan tercatat otomatis di sini.</p></div>';return;
  }

  wrap.innerHTML=normalized.map((x,i)=>`<div class="history-row">
    <button class="history-main" type="button" data-history="${i}">
      <div class="book-icon">${x.parent.icon||'◷'}</div>
      <div class="history-copy"><b>${x.parent.title}</b>
        <small>${x.parent.type==='single'?'':x.part.title+' • '}Halaman ${x.page}</small>
      </div>
      <span class="chevron">›</span>
    </button>
    <button class="history-delete" type="button" data-history-delete="${i}" aria-label="Hapus dari riwayat" title="Hapus dari riwayat">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
    </button>
  </div>`).join('');

  wrap.querySelectorAll('[data-history]').forEach(btn=>{
    const x=normalized[+btn.dataset.history];
    btn.onclick=()=>openPart(x.parent.id,x.part.id,x.page);
  });
  wrap.querySelectorAll('[data-history-delete]').forEach(btn=>{
    btn.onclick=e=>{
      e.stopPropagation();
      const x=normalized[+btn.dataset.historyDelete];
      deleteHistoryEntry(x.raw);
    };
  });
}

function deleteHistoryEntry(entry){
  let hist=[];
  try{hist=JSON.parse(store.getItem('amaliyah_history')||'[]')}catch{}
  hist=hist.filter(h=>!(h.id===entry.id && (h.partId||null)===(entry.partId||null)));
  store.setItem('amaliyah_history',JSON.stringify(hist));
  renderHistory();
}

function clearAllHistory(){
  if(!getHistoryEntries().length)return;
  if(!confirm('Hapus semua riwayat bacaan?\\n\\nProgres, bookmark, dan favorit tidak akan terhapus.'))return;
  store.removeItem('amaliyah_history');
  renderHistory();
}

function toggleSearch(){
  const box=$('#searchBox'),input=$('#searchInput');if(!box)return;
  const opening=box.classList.contains('hidden');
  box.classList.toggle('hidden');
  $('#searchToggleBtn')?.classList.toggle('active',opening);
  if(opening)setTimeout(()=>input?.focus(),60);
  else{librarySearchQuery='';if(input)input.value='';renderLibrary(activeLibraryCategory)}
}
function filterBooks(){
  librarySearchQuery=($('#searchInput')?.value||'').trim();
  $('#clearSearchBtn')?.classList.toggle('visible',!!librarySearchQuery);
  renderLibrary(activeLibraryCategory);
}
function clearSearch(){
  const input=$('#searchInput');if(input)input.value='';
  librarySearchQuery='';$('#clearSearchBtn')?.classList.remove('visible');
  renderLibrary(activeLibraryCategory);input?.focus();
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
  latestPrayerTimes=data.timings||null;
  renderPrayers(data.timings);
  startPrayerNotificationScheduler();
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

const NOTIF_SETTINGS_KEY='amaliyah:prayerNotifications';
const DEFAULT_NOTIF_SETTINGS={
  enabled:false,
  lead:0,
  prayers:{Subuh:true,Dzuhur:true,Ashar:true,Maghrib:true,Isya:true}
};

function getNotificationSettings(){
  try{
    const saved=JSON.parse(store.getItem(NOTIF_SETTINGS_KEY)||'null');
    return {
      ...DEFAULT_NOTIF_SETTINGS,
      ...(saved||{}),
      prayers:{...DEFAULT_NOTIF_SETTINGS.prayers,...(saved?.prayers||{})}
    };
  }catch{return {...DEFAULT_NOTIF_SETTINGS,prayers:{...DEFAULT_NOTIF_SETTINGS.prayers}}}
}
function setNotificationSettings(settings){
  store.setItem(NOTIF_SETTINGS_KEY,JSON.stringify(settings));
}
function notificationPermission(){
  return 'Notification' in window ? Notification.permission : 'unsupported';
}
function syncNotificationUI(){
  const s=getNotificationSettings();
  const permission=notificationPermission();
  const master=$('#notificationMaster');
  if(master)master.checked=!!s.enabled && permission==='granted';

  document.querySelectorAll('[data-prayer-notif]').forEach(box=>{
    box.checked=!!s.prayers[box.dataset.prayerNotif];
    box.onchange=saveNotificationSettings;
  });
  if($('#notificationLead'))$('#notificationLead').value=String(s.lead||0);

  const controls=$('#notificationControls');
  controls?.classList.toggle('disabled',!s.enabled || permission!=='granted');

  const status=$('#notificationStatusText');
  const btn=$('#notificationPermissionBtn');
  if(permission==='unsupported'){
    if(status)status.textContent='Browser ini tidak mendukung notifikasi web.';
    if(btn)btn.classList.add('hidden');
  }else if(permission==='denied'){
    if(status)status.textContent='Izin notifikasi diblokir di pengaturan browser.';
    if(btn){btn.textContent='Izin Diblokir';btn.disabled=true;}
  }else if(permission==='granted'){
    if(status)status.textContent=s.enabled?'Notifikasi Aktif':'Izin tersedia • notifikasi sedang OFF';
    if(btn){btn.textContent='Izin Notifikasi Aktif';btn.disabled=true;}
  }else{
    if(status)status.textContent='Notifikasi belum diizinkan.';
    if(btn){btn.textContent='Aktifkan Izin Notifikasi';btn.disabled=false;btn.classList.remove('hidden');}
  }
  $('#notifBtn')?.classList.toggle('notification-active',permission==='granted'&&s.enabled);
}
async function requestNotifications(){
  if(!('Notification'in window))return alert('Browser ini tidak mendukung notifikasi web.');
  if(Notification.permission==='denied'){
    syncNotificationUI();
    return alert('Izin notifikasi diblokir. Aktifkan kembali melalui pengaturan situs/browser.');
  }
  const p=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(p==='granted'){
    const s=getNotificationSettings();
    s.enabled=true;
    setNotificationSettings(s);
    syncNotificationUI();
    startPrayerNotificationScheduler();
    await showAppNotification('Amaliyah','Notifikasi sholat berhasil diaktifkan.');
  }else{
    syncNotificationUI();
  }
}
function setNotificationMaster(enabled){
  const s=getNotificationSettings();
  if(enabled && notificationPermission()!=='granted'){
    $('#notificationMaster').checked=false;
    requestNotifications();
    return;
  }
  s.enabled=!!enabled;
  setNotificationSettings(s);
  syncNotificationUI();
  startPrayerNotificationScheduler();
}
function saveNotificationSettings(){
  const s=getNotificationSettings();
  s.lead=+($('#notificationLead')?.value||0);
  document.querySelectorAll('[data-prayer-notif]').forEach(box=>{
    s.prayers[box.dataset.prayerNotif]=box.checked;
  });
  setNotificationSettings(s);
  syncNotificationUI();
  startPrayerNotificationScheduler();
}
async function showAppNotification(title,body){
  if(notificationPermission()!=='granted')return;
  try{
    const reg=await navigator.serviceWorker?.ready;
    if(reg?.showNotification){
      await reg.showNotification(title,{
        body,
        icon:'./assets/icons/icon-192.png',
        badge:'./assets/icons/icon-192.png',
        tag:'amaliyah-prayer',
        renotify:true
      });
      return;
    }
  }catch{}
  try{new Notification(title,{body,icon:'./assets/icons/icon-192.png'});}catch{}
}
function startPrayerNotificationScheduler(){
  clearInterval(prayerNotificationTimer);
  const check=()=>checkPrayerNotifications();
  check();
  prayerNotificationTimer=setInterval(check,30000);
}
function checkPrayerNotifications(){
  const s=getNotificationSettings();
  if(!s.enabled || notificationPermission()!=='granted' || !latestPrayerTimes)return;

  const map=[
    ['Subuh','Fajr'],['Dzuhur','Dhuhr'],['Ashar','Asr'],['Maghrib','Maghrib'],['Isya','Isha']
  ];
  const now=new Date();
  const cur=now.getHours()*60+now.getMinutes();
  const lead=Number(s.lead||0);

  for(const [name,key] of map){
    if(!s.prayers[name])continue;
    const tm=cleanTime(latestPrayerTimes[key]);
    const [h,m]=tm.split(':').map(Number);
    if(!Number.isFinite(h)||!Number.isFinite(m))continue;
    const target=h*60+m-lead;
    if(cur!==target)continue;

    const notifyKey=`amaliyah:notified:${dateKey()}:${name}:${lead}`;
    if(store.getItem(notifyKey))continue;
    store.setItem(notifyKey,'1');
    const body=lead>0
      ? `${lead} menit lagi masuk waktu ${name} (${tm}).`
      : `Telah masuk waktu ${name} (${tm}).`;
    showAppNotification(`Waktu ${name}`,body);
  }
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



function refreshActiveScreen(){
  if(currentScreen==='bookmarks')renderBookmarks();
  if(currentScreen==='history')renderHistory();
  if(currentScreen==='home')updateHome();
  if(currentScreen==='settings')syncNotificationUI();
}
window.addEventListener('pageshow',refreshActiveScreen);
window.addEventListener('focus',refreshActiveScreen);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')refreshActiveScreen();
});

window.showHome=showHome;
window.showLibrary=showLibrary;
window.showCollection=showCollection;
window.showSettings=showSettings;
window.showMonthly=showMonthly;
window.showBookmarks=showBookmarks;
window.showHistory=showHistory;
window.goBackInApp=goBackInApp;
window.goBackScreen=goBackInApp;
window.changeMonth=changeMonth;
window.openItem=openItem;
window.openPart=openPart;
window.toggleSearch=toggleSearch;
window.filterBooks=filterBooks;
window.clearSearch=clearSearch;
window.toggleFavorite=toggleFavorite;
window.getPrayerTimes=getPrayerTimes;
window.requestNotifications=requestNotifications;
window.setNotificationMaster=setNotificationMaster;
window.saveNotificationSettings=saveNotificationSettings;
window.clearAllHistory=clearAllHistory;

history.replaceState({amaliyah:true,screen:'home'},'',location.href);
paintScreen('home');
updateHome();
renderLibrary('Semua');
syncSettingsLocation();
syncNotificationUI();
bootPrayer();
if('serviceWorker'in navigator){
  navigator.serviceWorker.register('./sw.js').then(()=>startPrayerNotificationScheduler()).catch(()=>{});
}else{
  startPrayerNotificationScheduler();
}
