/* V2.53.2 — Theme Unification + Settings UI only; functional logic preserved. */
const $ = s => document.querySelector(s);
const store = localStorage;

function ensureAppDialogStyles(){
  if(document.getElementById('amaliyah-dialog-style'))return;

  const style=document.createElement('style');
  style.id='amaliyah-dialog-style';
  style.textContent=`
    .amaliyah-dialog-backdrop{
      position:fixed;
      inset:0;
      z-index:99999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:22px;
      background:rgba(8,29,24,.58);
      backdrop-filter:blur(4px);
      -webkit-backdrop-filter:blur(4px);
    }
    .amaliyah-dialog-card{
      width:min(100%,390px);
      border-radius:26px;
      padding:24px 22px 18px;
      background:#fffdf8;
      color:#24352f;
      box-shadow:0 24px 70px rgba(0,0,0,.25);
      border:1px solid rgba(175,139,65,.22);
      animation:amaliyahDialogIn .18s ease-out;
    }
    .amaliyah-dialog-brand{
      display:flex;
      align-items:center;
      gap:11px;
      margin-bottom:14px;
      font-size:19px;
      font-weight:800;
      color:#0d5b49;
    }
    .amaliyah-dialog-mark{
      width:38px;
      height:38px;
      border-radius:13px;
      display:grid;
      place-items:center;
      background:#0d5b49;
      color:#e5bd63;
      font-family:Georgia,serif;
      font-size:21px;
      font-weight:800;
    }
    .amaliyah-dialog-message{
      white-space:pre-line;
      font-size:15.5px;
      line-height:1.58;
      color:#46534e;
    }
    .amaliyah-dialog-actions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:22px;
    }
    .amaliyah-dialog-btn{
      border:0;
      min-height:44px;
      padding:0 20px;
      border-radius:15px;
      font:inherit;
      font-weight:750;
      cursor:pointer;
    }
    .amaliyah-dialog-btn.primary{
      background:#0d5b49;
      color:#fff;
    }
    .amaliyah-dialog-btn.secondary{
      background:#f1ece2;
      color:#43504b;
    }
    @keyframes amaliyahDialogIn{
      from{opacity:0;transform:translateY(8px) scale(.98)}
      to{opacity:1;transform:none}
    }
  `;
  document.head.appendChild(style);
}

function showAppDialog(message,{
  confirmText='Oke',
  cancelText='',
  title='Amaliyah'
}={}){
  ensureAppDialogStyles();

  return new Promise(resolve=>{
    document.querySelector('.amaliyah-dialog-backdrop')?.remove();

    const backdrop=document.createElement('div');
    backdrop.className='amaliyah-dialog-backdrop';
    backdrop.setAttribute('role','presentation');

    const card=document.createElement('div');
    card.className='amaliyah-dialog-card';
    card.setAttribute('role','dialog');
    card.setAttribute('aria-modal','true');
    card.setAttribute('aria-label',title);

    card.innerHTML=`
      <div class="amaliyah-dialog-brand">
        <span class="amaliyah-dialog-mark">ا</span>
        <span>${title}</span>
      </div>
      <div class="amaliyah-dialog-message"></div>
      <div class="amaliyah-dialog-actions">
        ${cancelText?`<button class="amaliyah-dialog-btn secondary" data-dialog-cancel>${cancelText}</button>`:''}
        <button class="amaliyah-dialog-btn primary" data-dialog-confirm>${confirmText}</button>
      </div>
    `;

    card.querySelector('.amaliyah-dialog-message').textContent=String(message||'');
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const close=value=>{
      backdrop.remove();
      resolve(value);
    };

    card.querySelector('[data-dialog-confirm]').onclick=()=>close(true);
    card.querySelector('[data-dialog-cancel]')?.addEventListener('click',()=>close(false));

    backdrop.addEventListener('click',e=>{
      if(e.target===backdrop && cancelText)close(false);
    });

    const onKey=e=>{
      if(e.key==='Escape' && cancelText){
        document.removeEventListener('keydown',onKey);
        close(false);
      }
    };
    document.addEventListener('keydown',onKey);

    card.querySelector('[data-dialog-confirm]')?.focus();
  });
}

function appNotice(message,options={}){
  return showAppDialog(message,options);
}

function appConfirm(message,options={}){
  return showAppDialog(message,{
    confirmText:'Hapus',
    cancelText:'Batal',
    ...options
  });
}


const catalog = await fetch('./books.json', {cache:'no-store'}).then(r=>{
  if(!r.ok) throw new Error('books.json gagal dimuat');
  return r.json();
});
const items = catalog.items || [];
const categories = catalog.categories || ['Semua'];
const categoryIcons = catalog.categoryIcons && typeof catalog.categoryIcons==='object'
  ? catalog.categoryIcons
  : {};
const categoryAliases = catalog.categoryAliases && typeof catalog.categoryAliases==='object'
  ? catalog.categoryAliases
  : {};
let prayerCountdownTimer = null;
let prayerNotificationTimer = null;
let latestPrayerTimes = null;
let prayerRefreshInFlight = false;
let activeLibraryCategory='Semua';
let librarySearchQuery='';
let activeCollectionId=null;

// =========================================================
// V2.50.0 — OFFLINE COMFORT
// Aplikasi shell + data lokal tetap nyaman saat jaringan putus.
// =========================================================
function ensureOfflineBanner(){
  let banner=document.querySelector('#appOfflineBanner');
  if(banner)return banner;
  banner=document.createElement('div');
  banner.id='appOfflineBanner';
  banner.className='app-offline-banner hidden';
  banner.setAttribute('role','status');
  banner.innerHTML='<b>Tanpa Internet</b><span>Data yang sudah tersimpan tetap dapat digunakan</span>';
  document.body.appendChild(banner);
  return banner;
}
function syncOfflineBanner(){
  const banner=ensureOfflineBanner();
  banner.classList.toggle('hidden',navigator.onLine);
  document.documentElement.classList.toggle('is-offline',!navigator.onLine);
}
window.addEventListener('online',()=>{
  syncOfflineBanner();
  refreshActiveScreen();
  if(currentScreen==='home')bootPrayer();
});
window.addEventListener('offline',syncOfflineBanner);
syncOfflineBanner();
if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});

// V2.51.0 — kebijakan final PDF: online-only.
// Bersihkan salinan lokal yang mungkin sempat dibuat oleh eksperimen V2.50.x.
function cleanupLegacyOfflinePdfStorage(){
  if('caches' in window)caches.delete('amaliyah-offline-pdf-v1').catch(()=>{});
  if('indexedDB' in window){
    try{indexedDB.deleteDatabase('amaliyah-offline-reader-v1')}catch{}
  }
  try{
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i);
      if(key?.startsWith('amaliyah:offline-pdf:'))localStorage.removeItem(key);
    }
  }catch{}
}
cleanupLegacyOfflinePdfStorage();

const SCREEN_TO_ID={
  home:'#app', categories:'#categoryIndex', library:'#library', favorites:'#favoritesManager', collection:'#collection',
  settings:'#settings', monthly:'#monthly', bookmarks:'#bookmarks', history:'#history'
};
let currentScreen='home';
let bookmarkKind='pdf';
const SCREEN_STATE_KEY='amaliyah:screenState';

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

}
migrateLegacyState();

function saveScreenState(screen,opts={}){
  try{
    sessionStorage.setItem(SCREEN_STATE_KEY,JSON.stringify({
      screen,
      category:opts.category||activeLibraryCategory||'Semua',
      focusNotifications:!!opts.focusNotifications,
      itemId:opts.itemId||activeCollectionId||null
    }));
  }catch{}
}
function getSavedScreenState(){
  try{
    const state=JSON.parse(sessionStorage.getItem(SCREEN_STATE_KEY)||'null');
    if(!state || !SCREEN_TO_ID[state.screen])return null;
    return state;
  }catch{return null}
}

function globalNavKeyForScreen(screen='home'){
  if(screen==='categories' || screen==='library' || screen==='collection')return 'categories';
  if(screen==='bookmarks')return 'bookmarks';
  if(screen==='history')return 'history';
  if(screen==='settings')return 'settings';
  // Jadwal bulanan dan Kelola Favorit berasal dari Beranda.
  if(screen==='monthly' || screen==='favorites')return 'home';
  return 'home';
}
function updateGlobalBottomNav(screen='home'){
  const nav=$('#globalBottomNav');
  if(!nav)return;
  const activeKey=globalNavKeyForScreen(screen);
  nav.querySelectorAll('[data-nav-key]').forEach(btn=>{
    const isActive=btn.dataset.navKey===activeKey;
    btn.classList.toggle('active',isActive);
    if(isActive)btn.setAttribute('aria-current','page');
    else btn.removeAttribute('aria-current');
  });
}
function paintScreen(screen='home'){
  const id=SCREEN_TO_ID[screen]||SCREEN_TO_ID.home;
  Object.values(SCREEN_TO_ID).forEach(x=>$(x)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  currentScreen=screen;
  updateGlobalBottomNav(screen);
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
  saveScreenState(screen,{category,focusNotifications,itemId});
  if(screen==='home')updateHome();
  if(screen==='categories')renderCategoryIndex();
  if(screen==='library')renderLibrary(category);
  if(screen==='favorites')renderFavoritesManager();
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
function showCategories(){navigateScreen('categories')}
function showLibrary(category='Semua'){navigateScreen('library',{category})}
function showFavoritesManager(){navigateScreen('favorites')}
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
    paintScreen('home');
    saveScreenState('home');
    updateHome();
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

function openPart(itemId,partId,options={}){
  const item=getItem(itemId);
  if(!item)return;
  const part=item.type==='single' ? item : (item.parts||[]).find(p=>p.id===partId);
  if(!part)return;

  if(!navigator.onLine){
    appNotice(
      'Khazanah ini membutuhkan koneksi internet. Untuk menjaga konten tetap aman, khazanah tidak disimpan di perangkat.',
      {title:'Koneksi Internet Diperlukan',confirmText:'Mengerti'}
    );
    return;
  }

  const resume=!!options?.resume;
  const explicitPage=Number(options?.page)>0?Math.max(1,Number(options.page)):null;
  const savedPage=Math.max(1,+(store.getItem(pageKey(part.id))||1));
  const openingPage=explicitPage || (resume?savedPage:1);

  store.setItem('amaliyah:lastItem',item.id);
  store.setItem('amaliyah:lastBook',part.id); // kompatibilitas lama
  if(item.type!=='single') store.setItem(lastPartKey(item.id),part.id);

  recordHistoryEntry(item.id,part.id,openingPage);

  const query=new URLSearchParams({book:item.id});
  if(item.type!=='single')query.set('part',part.id);
  if(resume)query.set('resume','1');
  if(explicitPage)query.set('page',String(explicitPage));
  location.href=`reader.html?${query.toString()}`;
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
  if(item.type==='single') return openPart(item.id,item.id,{resume:true});
  const partId=store.getItem(lastPartKey(item.id)) || item.parts?.[0]?.id;
  openPart(item.id,partId,{resume:true});
}

function itemSearchText(item){
  const parts=(item.parts||[]).flatMap(p=>[p.title,p.arabicTitle]).filter(Boolean);
  return [item.title,item.arabicTitle,item.category,...parts]
    .filter(Boolean).join(' ').toLocaleLowerCase('id-ID');
}

function updateHome(){
  const state=getLastState();
  updateCategoryCounts();
  renderHomeFavorites();
  updateQuranHomeCard();
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

}

function quranBookmarks(){
  try{
    const value=JSON.parse(store.getItem('amaliyah:quran:bookmarks')||'[]');
    return Array.isArray(value)?value.map(Number).filter(page=>page>=1&&page<=604):[];
  }catch{return []}
}

function quranPageMeta(){
  try{return JSON.parse(store.getItem('amaliyah:quran:last-meta')||'{}')||{}}
  catch{return {}}
}

function updateQuranHomeCard(){
  const page=Math.min(604,Math.max(1,+(store.getItem('amaliyah:quran:last-page')||1)));
  const meta=quranPageMeta();
  const hasProgress=store.getItem('amaliyah:quran:last-page')!==null;
  const detail=[meta.surah?`Surah ${meta.surah}`:'',meta.juz?`Juz ${meta.juz}`:''].filter(Boolean).join(' • ');
  const percent=Math.round((page/604)*100);
  const text=hasProgress
    ? `Halaman ${page} dari 604 • ${percent}%${detail?' • '+detail:''}`
    : 'Baca Al-Qur\'an dengan susunan halaman seperti mushaf.';
  const metaEl=$('#quranHomeMeta');
  const progressEl=$('#quranHomeProgress');
  const button=$('#quranHomeButton');
  const directoryButton=$('#quranDirectoryButton');
  if(metaEl)metaEl.textContent=text;
  if(progressEl)progressEl.style.width=(hasProgress?(page/604)*100:0)+'%';
  if(directoryButton){
    directoryButton.onclick=()=>location.href='quran.html';
  }
  if(button){
    button.firstChild.textContent=hasProgress?'Lanjutkan ':'Mulai Membaca ';
    button.onclick=()=>location.href=`quran.html${hasProgress?`?page=${page}`:'?page=1'}`;
  }
}

function normalizedCategoryName(value=''){
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}

function catalogCategoryNames(){
  const used=[...new Set(items
    .map(item=>item.category)
    .filter(category=>category&&normalizedCategoryName(category)!=='semua'))];
  if(used.length)return used;
  return [...new Set(categories
    .filter(category=>category&&normalizedCategoryName(category)!=='semua'))];
}

function resolveHomeCategory(preferred,used=new Set()){
  const available=catalogCategoryNames().filter(category=>!used.has(category));
  const preferredName=normalizedCategoryName(preferred);
  const aliased=categoryAliases[preferred];

  const exact=available.find(category=>normalizedCategoryName(category)===preferredName);
  if(exact)return exact;

  if(aliased){
    const aliasMatch=available.find(category=>normalizedCategoryName(category)===normalizedCategoryName(aliased));
    if(aliasMatch)return aliasMatch;
  }

  const related=available.find(category=>{
    const name=normalizedCategoryName(category);
    return name.includes(preferredName)||preferredName.includes(name);
  });
  if(related)return related;

  const visualKey=categoryVisualKey(preferred);
  if(visualKey!=='other'){
    const visualMatch=available.find(category=>categoryVisualKey(category)===visualKey);
    if(visualMatch)return visualMatch;
  }

  return available[0]||null;
}

function updateCategoryCounts(){
  const used=new Set();
  document.querySelectorAll('[data-category-card]').forEach(el=>{
    const preferred=el.dataset.categoryCard;
    const isAll=preferred==='Semua';
    const cat=isAll?'Semua':resolveHomeCategory(preferred,used);
    if(cat&&!isAll)used.add(cat);
    el.classList.toggle('hidden',!cat);
    if(!cat)return;

    el.dataset.activeCategory=cat;
    const count=isAll ? items.length : items.filter(b=>b.category===cat).length;
    const title=el.querySelector('b');
    if(title){
      const customTitle=String(el.dataset.displayTitle||'').trim();
      title.textContent=isAll?'Lihat Semua':(customTitle||categoryDisplayName(cat));
    }
    const label=el.querySelector('small');
    if(label){
      label.textContent=isAll
        ? (count?`${count} Khazanah`:'Semua Khazanah')
        : (count?`${count} Khazanah`:'Segera');
    }
    const icon=el.querySelector('.category-icon');
    if(icon)icon.innerHTML=categoryVisualSvg(cat);
    el.onclick=()=>isAll?showCategories():showLibrary(cat);
  });
}

function categoryVisualKey(value){
  const text=String(value||'').toLocaleLowerCase('id-ID');
  if(text.includes('qur')||text.includes('surah'))return 'quran';
  if(text.includes('sholat')||text.includes('salat'))return 'mosque';
  if(text.includes('wirid'))return 'wirid';
  if(text.includes('doa'))return 'doa';
  if(text.includes('maulid'))return 'maulid';
  if(text.includes('dalail'))return 'dalail';
  if(text.includes('syair'))return 'syair';
  if(text.includes('khutbah'))return 'khutbah';
  return 'other';
}

function configuredCategoryIcon(value){
  const configured=String(categoryIcons[value]||'').toLocaleLowerCase('id-ID');
  const options=window.AMALIYAH_CATEGORY_ICON_OPTIONS||[];
  return options.some(icon=>icon.key===configured)
    ? configured
    : categoryVisualKey(value);
}

function categoryVisualSvg(category){
  const options=window.AMALIYAH_CATEGORY_ICON_OPTIONS||[];
  const key=configuredCategoryIcon(category);
  const icon=options.find(option=>option.key===key)||options.find(option=>option.key==='other');
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icon?.svg||''}</svg>`;
}

function categoryDisplayName(category){
  return String(category||'').toLocaleLowerCase('id-ID')==='doa'?'Doa Harian':category;
}

function renderCategoryIndex(){
  const directory=$('#categoryDirectory');
  if(!directory)return;
  const available=[...new Set([
    ...categories.filter(category=>String(category).toLocaleLowerCase('id-ID')!=='semua'),
    ...items.map(item=>item.category).filter(Boolean)
  ])].sort((a,b)=>String(a).localeCompare(String(b),'id',{sensitivity:'base',numeric:true}));
  directory.replaceChildren();
  available.forEach(category=>{
    const count=items.filter(item=>item.category===category).length;
    const button=document.createElement('button');
    button.type='button';
    button.className='category-directory-card';
    button.setAttribute('aria-label',`Buka kategori ${categoryDisplayName(category)}`);
    button.innerHTML=`<span class="category-directory-icon">${categoryVisualSvg(category)}</span><span class="category-directory-copy"><b></b><small></small></span><span class="category-directory-arrow" aria-hidden="true">›</span>`;
    button.querySelector('b').textContent=categoryDisplayName(category);
    button.querySelector('small').textContent=count?`${count} khazanah`:'Belum tersedia';
    button.onclick=()=>showLibrary(category);
    directory.appendChild(button);
  });
  const countLabel=$('#allBooksCollectionCount');
  if(countLabel)countLabel.textContent=`${items.length} khazanah dari semua kategori`;
}

function libraryCategoriesOrdered(){
  return [
    'Semua',
    ...[...new Set(categories.filter(cat=>String(cat).toLocaleLowerCase('id-ID')!=='semua'))]
      .sort((a,b)=>String(a).localeCompare(String(b),'id',{sensitivity:'base',numeric:true}))
  ];
}

function renderChips(active='Semua'){
  activeLibraryCategory=active;
  const wrap=$('#categoryChips');if(!wrap)return;
  const orderedCategories=libraryCategoriesOrdered();
  wrap.innerHTML=orderedCategories.map(cat=>`<button class="chip ${cat===active?'active':''}" data-cat="${cat}">${cat}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach(btn=>btn.onclick=()=>renderLibrary(btn.dataset.cat));
  requestAnimationFrame(()=>{
    const activeChip=wrap.querySelector('.chip.active');
    if(activeChip)activeChip.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  });
}

function moveLibraryCategory(direction){
  if(librarySearchQuery)return;
  const ordered=libraryCategoriesOrdered();
  const current=Math.max(0,ordered.indexOf(activeLibraryCategory));
  const next=Math.max(0,Math.min(ordered.length-1,current+direction));
  if(next===current)return;
  const list=$('#bookList');
  if(list){
    list.classList.remove('swipe-category-next','swipe-category-prev');
    void list.offsetWidth;
    list.classList.add(direction>0?'swipe-category-next':'swipe-category-prev');
  }
  renderLibrary(ordered[next]);
  setTimeout(()=>list?.classList.remove('swipe-category-next','swipe-category-prev'),220);
}

function initLibrarySwipe(){
  const list=$('#bookList');
  if(!list||list.dataset.swipeReady==='1')return;
  list.dataset.swipeReady='1';
  let startX=0,startY=0,lastX=0,lastY=0,tracking=false,horizontal=false;
  list.addEventListener('touchstart',event=>{
    if(event.touches.length!==1)return;
    const t=event.touches[0];
    startX=lastX=t.clientX;startY=lastY=t.clientY;tracking=true;horizontal=false;
  },{passive:true});
  list.addEventListener('touchmove',event=>{
    if(!tracking||event.touches.length!==1)return;
    const t=event.touches[0];lastX=t.clientX;lastY=t.clientY;
    const dx=lastX-startX,dy=lastY-startY;
    if(!horizontal&&Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.25)horizontal=true;
    if(horizontal&&Math.abs(dx)>18)event.preventDefault();
  },{passive:false});
  list.addEventListener('touchend',()=>{
    if(!tracking)return;
    const dx=lastX-startX,dy=lastY-startY;
    tracking=false;
    if(!horizontal||Math.abs(dx)<58||Math.abs(dx)<Math.abs(dy)*1.35)return;
    // Arah natural tab mobile: geser ke kiri = kategori berikutnya, geser ke kanan = sebelumnya.
    moveLibraryCategory(dx<0?1:-1);
  },{passive:true});
  list.addEventListener('touchcancel',()=>{tracking=false;horizontal=false},{passive:true});
}

function syncLibraryCategoryState(category){
  if(currentScreen!=='library')return;
  const state=history.state;
  if(state?.amaliyah && state.screen==='library'){
    history.replaceState({...state,category},'',location.href);
  }
  saveScreenState('library',{category});
}

function renderLibrary(category=activeLibraryCategory||'Semua'){
  activeLibraryCategory=category;
  syncLibraryCategoryState(category);
  renderChips(category);
  const list=$('#bookList');if(!list)return;
  initLibrarySwipe();
  const q=(librarySearchQuery||'').trim().toLocaleLowerCase('id-ID');
  let filtered=category==='Semua'?items:items.filter(x=>x.category===category);
  if(q) filtered=filtered.filter(item=>itemSearchText(item).includes(q));

  if(!filtered.length){
    list.innerHTML=`<div class="empty-state"><b>${q?'Khazanah tidak ditemukan':'Belum ada khazanah'}</b><p>${q?'Coba kata kunci lain atau pilih kategori Semua.':'Belum ada khazanah pada kategori ini.'}</p></div>`;
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
  $('#collectionMeta').innerHTML=`<b>${item.type==='collection'?'Koleksi berurutan':'Kelompok khazanah'}</b><span>${item.parts.length} bagian</span>`;
  const wrap=$('#collectionList');

  wrap.innerHTML=item.parts.map((part,i)=>{
    const pr=partProgress(part);
    const label=pr.page>1?`Terakhir hal. ${pr.page}/${pr.total}`:`${pr.total} halaman`;
    const fav=isPartFavorite(item.id,part.id);
    return `<div class="collection-part-row">
      <button class="collection-part" type="button" data-part="${part.id}">
        <span class="part-number">${String(i+1).padStart(2,'0')}</span>
        <span class="part-copy"><b>${part.title}</b><small>${label}</small></span>
        <span class="chevron">›</span>
      </button>
      <button class="favorite-btn part-favorite-btn ${fav?'active':''}" type="button" data-part-favorite="${part.id}" aria-label="${fav?'Hapus dari favorit':'Tambahkan bagian ke favorit'}" title="${fav?'Hapus dari favorit':'Favoritkan bagian ini'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>
      </button>
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-part]').forEach(btn=>btn.onclick=()=>openPart(item.id,btn.dataset.part));
  wrap.querySelectorAll('[data-part-favorite]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    togglePartFavorite(item.id,btn.dataset.partFavorite);
    renderCollection(item.id);
  });
}

const FAVORITES_KEY='amaliyah:favorites';
function favoriteItemKey(itemId){return `item:${itemId}`}
function favoritePartKey(itemId,partId){return `part:${itemId}:${partId}`}

function normalizeFavoriteKey(value){
  const key=String(value||'');

  if(key.startsWith('item:')){
    const itemId=key.slice(5);
    return getItem(itemId)?favoriteItemKey(itemId):null;
  }

  if(key.startsWith('part:')){
    const rest=key.slice(5);
    const split=rest.indexOf(':');
    if(split<1)return null;
    const itemId=rest.slice(0,split);
    const partId=rest.slice(split+1);
    const item=getItem(itemId);
    const part=item?.type==='single'?null:item?.parts?.find(p=>p.id===partId);
    return item&&part?favoritePartKey(itemId,partId):null;
  }

  // Kompatibilitas favorit versi lama: ID bacaan tetap menjadi favorit utama,
  // sedangkan ID sub-bacaan dipertahankan sebagai favorit bagian (tidak lagi
  // dipaksa menjadi favorit induk).
  const item=getItem(key);
  if(item)return favoriteItemKey(item.id);

  const found=resolvePart(key);
  if(found){
    return found.parent.type==='single'
      ? favoriteItemKey(found.parent.id)
      : favoritePartKey(found.parent.id,found.part.id);
  }

  return null;
}

function getFavorites(){
  try{
    const raw=JSON.parse(store.getItem(FAVORITES_KEY)||'[]');
    if(!Array.isArray(raw))return [];
    const normalized=[...new Set(raw.map(normalizeFavoriteKey).filter(Boolean))];
    if(JSON.stringify(raw)!==JSON.stringify(normalized)){
      store.setItem(FAVORITES_KEY,JSON.stringify(normalized));
    }
    return normalized;
  }catch{return []}
}
function saveFavorites(keys){
  const normalized=[...new Set(keys.map(normalizeFavoriteKey).filter(Boolean))];
  store.setItem(FAVORITES_KEY,JSON.stringify(normalized));
}
function isFavorite(id){return getFavorites().includes(favoriteItemKey(id))}
function isPartFavorite(itemId,partId){return getFavorites().includes(favoritePartKey(itemId,partId))}
function toggleFavoriteKey(key){
  let keys=getFavorites();
  keys=keys.includes(key)?keys.filter(x=>x!==key):[...keys,key];
  saveFavorites(keys);
  renderLibrary(activeLibraryCategory);
  renderHomeFavorites();
  if(currentScreen==='favorites')renderFavoritesManager();
}
function toggleFavorite(id){toggleFavoriteKey(favoriteItemKey(id))}
function togglePartFavorite(itemId,partId){toggleFavoriteKey(favoritePartKey(itemId,partId))}

function resolveFavoriteEntry(key){
  if(key.startsWith('item:')){
    const item=getItem(key.slice(5));
    return item?{key,kind:'item',item,part:null}:null;
  }
  if(key.startsWith('part:')){
    const rest=key.slice(5);
    const split=rest.indexOf(':');
    if(split<1)return null;
    const item=getItem(rest.slice(0,split));
    const part=item?.parts?.find(p=>p.id===rest.slice(split+1));
    return item&&part?{key,kind:'part',item,part}:null;
  }
  return null;
}

function favoriteDisplayMeta(entry){
  if(entry.kind==='part')return `${entry.item.title} • Bagian`;
  return entry.item.type==='collection'?'Koleksi':entry.item.type==='group'?'Kelompok':entry.item.category;
}

function renderFavoritesManager(){
  const wrap=$('#favoritesManagerList');
  if(!wrap)return;
  const entries=getFavorites().map(resolveFavoriteEntry).filter(Boolean);
  if(!entries.length){
    wrap.innerHTML=`<div class="favorites-manager-empty"><span>☆</span><b>Belum ada favorit</b><p>Tambahkan khazanah ke Favorit terlebih dahulu. Setelah itu urutannya bisa diatur di sini.</p></div>`;
    return;
  }
  wrap.innerHTML=entries.map((entry,index)=>{
    const title=entry.kind==='part'?entry.part.title:entry.item.title;
    return `<article class="favorite-manage-row" draggable="true" data-manage-fav="${entry.key}">
      <span class="favorite-drag-handle" aria-hidden="true">≡</span>
      <span class="favorite-manage-icon">${entry.item.icon||'◈'}</span>
      <span class="favorite-manage-copy"><b>${title}</b><small>${favoriteDisplayMeta(entry)}</small></span>
      <span class="favorite-order-actions">
        <button type="button" data-fav-up="${entry.key}" ${index===0?'disabled':''} aria-label="Naikkan urutan">↑</button>
        <button type="button" data-fav-down="${entry.key}" ${index===entries.length-1?'disabled':''} aria-label="Turunkan urutan">↓</button>
      </span>
      <button class="favorite-remove-button" type="button" data-fav-remove="${entry.key}" aria-label="Hapus dari favorit">×</button>
    </article>`;
  }).join('');

  wrap.querySelectorAll('[data-fav-up]').forEach(btn=>btn.onclick=()=>moveFavoriteKey(btn.dataset.favUp,-1));
  wrap.querySelectorAll('[data-fav-down]').forEach(btn=>btn.onclick=()=>moveFavoriteKey(btn.dataset.favDown,1));
  wrap.querySelectorAll('[data-fav-remove]').forEach(btn=>btn.onclick=()=>removeFavoriteKey(btn.dataset.favRemove));
  setupFavoriteDrag(wrap);
}

function moveFavoriteKey(key,delta){
  const keys=getFavorites();
  const from=keys.indexOf(key);
  if(from<0)return;
  const to=Math.max(0,Math.min(keys.length-1,from+delta));
  if(to===from)return;
  const [picked]=keys.splice(from,1);
  keys.splice(to,0,picked);
  saveFavorites(keys);
  renderFavoritesManager();
  renderHomeFavorites();
}

function removeFavoriteKey(key){
  saveFavorites(getFavorites().filter(x=>x!==key));
  renderFavoritesManager();
  renderHomeFavorites();
  renderLibrary(activeLibraryCategory);
}

function setupFavoriteDrag(wrap){
  let draggingKey=null;
  wrap.querySelectorAll('[data-manage-fav]').forEach(row=>{
    row.addEventListener('dragstart',event=>{
      draggingKey=row.dataset.manageFav;
      row.classList.add('is-dragging');
      try{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggingKey)}catch{}
    });
    row.addEventListener('dragend',()=>{
      draggingKey=null;
      wrap.querySelectorAll('.favorite-manage-row').forEach(x=>x.classList.remove('is-dragging','drag-over'));
    });
    row.addEventListener('dragover',event=>{
      event.preventDefault();
      if(!draggingKey||draggingKey===row.dataset.manageFav)return;
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
    row.addEventListener('drop',event=>{
      event.preventDefault();
      row.classList.remove('drag-over');
      const source=draggingKey||event.dataTransfer?.getData('text/plain');
      const target=row.dataset.manageFav;
      if(!source||!target||source===target)return;
      const keys=getFavorites();
      const from=keys.indexOf(source),to=keys.indexOf(target);
      if(from<0||to<0)return;
      const [picked]=keys.splice(from,1);
      keys.splice(to,0,picked);
      saveFavorites(keys);
      renderFavoritesManager();
      renderHomeFavorites();
    });
  });
}

function renderHomeFavorites(){
  const section=$('#favoritesSection'),wrap=$('#favoriteBooks');
  if(!section||!wrap)return;
  const fav=getFavorites().map(resolveFavoriteEntry).filter(Boolean);
  section.classList.toggle('hidden',!fav.length);
  if(!fav.length){wrap.innerHTML='';return}

  wrap.innerHTML=fav.map(entry=>{
    const isPart=entry.kind==='part';
    const title=isPart?entry.part.title:entry.item.title;
    const meta=isPart
      ? `${entry.item.title} • Bagian`
      : (entry.item.type==='collection'?'Koleksi':entry.item.type==='group'?'Kelompok':entry.item.category);
    return `<button class="favorite-card home-favorite-card ${isPart?'favorite-card-part':''}" type="button" data-fav-key="${entry.key}">
      <span class="favorite-icon home-favorite-icon">${categoryVisualSvg(entry.item.category)}</span>
      <span class="favorite-copy"><b>${title}</b><small>${meta}</small></span>
      <span class="favorite-heart" aria-hidden="true">♥</span>
      <span class="favorite-open" aria-hidden="true">›</span>
    </button>`;
  }).join('');

  wrap.querySelectorAll('[data-fav-key]').forEach(btn=>btn.onclick=()=>{
    const entry=resolveFavoriteEntry(btn.dataset.favKey);
    if(!entry)return;
    if(entry.kind==='part')openPart(entry.item.id,entry.part.id);
    else openItem(entry.item.id);
  });
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
  openPart(found.parent.id,found.part.id,{page});
}

function renderBookmarks(){
  const wrap=$('#bookmarkList');
  if(!wrap)return;

  $('#bookmarkPdfTab')?.classList.toggle('active',bookmarkKind==='pdf');
  $('#bookmarkQuranTab')?.classList.toggle('active',bookmarkKind==='quran');
  $('#bookmarkPdfTab')?.setAttribute('aria-selected',String(bookmarkKind==='pdf'));
  $('#bookmarkQuranTab')?.setAttribute('aria-selected',String(bookmarkKind==='quran'));
  if(bookmarkKind==='quran')return renderQuranBookmarks(wrap);

  const entries=[];

  Object.keys(localStorage).forEach(k=>{
    if(!k.startsWith('amaliyah_bookmark_'))return;

    const partId=k.replace('amaliyah_bookmark_','');
    const page=+(localStorage.getItem(k)||0);
    const found=resolvePart(partId);

    if(found && page>0){
      entries.push({...found,page});
    }
  });

  entries.sort((a,b)=>{
    const titleA=String(a.parent.title||'');
    const titleB=String(b.parent.title||'');
    return titleA.localeCompare(titleB,'id');
  });

  const count=entries.length;

  const overview=`
    <section class="bookmark-overview" aria-label="Ringkasan penanda">
      <div class="bookmark-overview-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7 4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V21l-5-3-5 3z"/>
        </svg>
      </div>
      <div class="bookmark-overview-copy">
        <span>TERSIMPAN UNTUK DIBACA KEMBALI</span>
        <b>${count} Penanda</b>
        <small>${count
          ? 'Buka kembali khazanah tepat dari halaman yang ditandai.'
          : 'Halaman yang ditandai saat membaca akan tersimpan di sini.'}</small>
      </div>
    </section>
  `;

  if(!count){
    wrap.innerHTML=overview+`
      <div class="bookmark-empty">
        <div class="bookmark-empty-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V21l-5-3-5 3z"/>
          </svg>
        </div>
        <b>Belum ada penanda</b>
        <p>Tandai halaman penting saat membaca. Amaliyah akan membawamu kembali tepat ke halaman itu.</p>
      </div>
    `;
    return;
  }

  const cards=entries.map(x=>{
    const isSingle=x.parent.type==='single';
    const icon=String(x.parent.icon||'ا');
    const partText=isSingle
      ? 'Khazanah'
      : String(x.part.title||'Bagian');

    return `
      <button class="bookmark-card" type="button" data-bookmark="${x.part.id}">
        <span class="bookmark-card-icon" aria-hidden="true">${icon}</span>

        <span class="bookmark-card-copy">
          <span class="bookmark-card-kicker">${isSingle?'KHAZANAH':'KOLEKSI'}</span>
          <b>${x.parent.title}</b>
          <small>${partText}</small>
        </span>

        <span class="bookmark-page-badge" aria-label="Halaman ${x.page}">
          <small>HAL.</small>
          <b>${x.page}</b>
        </span>

        <span class="bookmark-card-arrow" aria-hidden="true">›</span>
      </button>
    `;
  }).join('');

  wrap.innerHTML=overview+`<div class="bookmark-stack">${cards}</div>`;

  wrap.querySelectorAll('[data-bookmark]').forEach(btn=>{
    const id=btn.dataset.bookmark;
    const x=entries.find(e=>e.part.id===id);

    btn.onclick=()=>{
      if(x)openPart(x.parent.id,x.part.id,{page:x.page});
    };
  });
}

function renderQuranBookmarks(wrap){
  const pages=quranBookmarks().sort((a,b)=>a-b);
  let meta={};
  try{meta=JSON.parse(store.getItem('amaliyah:quran:page-meta')||'{}')||{}}catch{}

  const overview=`
    <section class="bookmark-overview quran-bookmark-overview" aria-label="Ringkasan penanda Al-Qur'an">
      <div class="bookmark-overview-icon" aria-hidden="true">۞</div>
      <div class="bookmark-overview-copy">
        <span>PENANDA MUSHAF AL-QUR'AN</span>
        <b>${pages.length} Halaman</b>
        <small>Penanda ini tersimpan terpisah dari penanda Khazanah.</small>
      </div>
    </section>`;

  if(!pages.length){
    wrap.innerHTML=overview+`<div class="bookmark-empty">
      <div class="bookmark-empty-mark" aria-hidden="true">۞</div>
      <b>Belum ada penanda Al-Qur'an</b>
      <p>Tekan ikon penanda saat membuka halaman Mushaf.</p>
      <button class="quran-empty-button" type="button" data-open-quran>Buka Mushaf</button>
    </div>`;
    wrap.querySelector('[data-open-quran]')?.addEventListener('click',()=>location.href='quran.html');
    return;
  }

  wrap.innerHTML=overview+`<div class="bookmark-stack">${pages.map(page=>{
    const info=meta[page]||{};
    const detail=[info.surah?`Surah ${info.surah}`:'',info.juz?`Juz ${info.juz}`:''].filter(Boolean).join(' • ')||'Mushaf Madinah';
    return `<button class="bookmark-card quran-bookmark-card" type="button" data-quran-page="${page}">
      <span class="bookmark-card-icon" aria-hidden="true">۞</span>
      <span class="bookmark-card-copy"><span class="bookmark-card-kicker">AL-QUR'AN</span><b>Halaman ${page}</b><small>${detail}</small></span>
      <span class="bookmark-card-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join('')}</div>`;
  wrap.querySelectorAll('[data-quran-page]').forEach(button=>{
    button.onclick=()=>location.href=`quran.html?page=${button.dataset.quranPage}`;
  });
}

function showBookmarkKind(kind='pdf'){
  bookmarkKind=kind==='quran'?'quran':'pdf';
  renderBookmarks();
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
    wrap.innerHTML='<div class="empty-state"><b>Belum ada riwayat</b><p>Khazanah yang dibuka akan tercatat otomatis di sini.</p></div>';return;
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
    btn.onclick=()=>openPart(x.parent.id,x.part.id);
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

async function clearAllHistory(){
  if(!getHistoryEntries().length)return;

  const ok=await appConfirm(
    'Hapus semua riwayat Khazanah?\n\nProgres, penanda, dan favorit tidak akan terhapus.'
  );

  if(!ok)return;

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
function cachePrayerKey(loc=getSavedLocation()){
  const region=loc?.prayerRegionId||loc?.regionName||'gps';
  return `prayer:kemenag:${dateKey()}:${String(region).replace(/\s+/g,'_')}`;
}
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
    const r=await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client`+
      `?latitude=${encodeURIComponent(latitude)}`+
      `&longitude=${encodeURIComponent(longitude)}`+
      `&localityLanguage=id`
    );

    if(!r.ok)throw new Error('reverse geocode');

    const j=await r.json();

    const admins=Array.isArray(j?.localityInfo?.administrative)
      ? j.localityInfo.administrative
      : [];

    // Kirim metadata administratif lengkap, bukan hanya nama.
    // Ini penting untuk kasus nama ambigu seperti "Banjar":
    // description dapat menunjukkan Regency/Kabupaten atau City/Kota.
    const regionCandidates=admins
      .map(x=>({
        name:String(x?.name||'').trim(),
        isoName:String(x?.isoName||'').trim(),
        description:String(x?.description||'').trim(),
        adminLevel:Number.isFinite(Number(x?.adminLevel))
          ? Number(x.adminLevel)
          : null,
        isoCode:String(x?.isoCode||'').trim(),
        wikidataId:String(x?.wikidataId||'').trim()
      }))
      .filter(x=>x.name||x.isoName)
      .slice(0,20);

    const namedRegion=admins.find(x=>
      /^(kabupaten|kota)\b/i.test(String(x?.name||'')) ||
      /\b(regency|city|municipality)\b/i.test(
        `${x?.name||''} ${x?.description||''}`
      )
    );

    const regionName=String(
      namedRegion?.name ||
      admins.find(x=>Number(x.adminLevel)===5)?.name ||
      ''
    ).trim();

    const city=j.city||j.locality||j.localityInfo?.informative?.[0]?.name||'Lokasi Anda';
    const province=j.principalSubdivision||'';

    const label=province && province!==city
      ? `${city}, ${province}`
      : city;

    return {
      label,
      regionName,
      regionCandidates,
      province,
      city
    };

  }catch{
    return {
      label:`${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
      regionName:'',
      regionCandidates:[],
      province:'',
      city:''
    };
  }
}

async function fetchPrayerTimes(
  latitude,
  longitude,
  regionName='',
  regionId='',
  regionCandidates=[],
  city='',
  province=''
){
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Makassar';

  const params=new URLSearchParams({
    latitude:String(latitude),
    longitude:String(longitude),
    date:dateKey(),
    tz
  });

  if(regionName)params.set('region',regionName);
  if(regionId)params.set('regionId',regionId);
  if(city)params.set('city',city);
  if(province)params.set('province',province);

  if(Array.isArray(regionCandidates) && regionCandidates.length){
    params.set(
      'regionCandidates',
      JSON.stringify(regionCandidates.slice(0,20))
    );
  }

  let lastError=null;

  for(let attempt=0;attempt<2;attempt++){
    try{
      const r=await fetch(`${PUSH_API}/prayer/daily?${params.toString()}`,{
        cache:'no-store'
      });

      const j=await r.json().catch(()=>null);

      if(r.ok && j?.timings){
        return j;
      }

      lastError=new Error(j?.error||`Jadwal tidak tersedia (${r.status})`);

      // 4xx selain 408/429 biasanya bukan error sementara.
      if(r.status>=400 && r.status<500 && ![408,429].includes(r.status)){
        break;
      }

    }catch(err){
      lastError=err;
    }

    if(attempt===0){
      await new Promise(resolve=>setTimeout(resolve,700));
    }
  }

  throw lastError||new Error('Jadwal tidak tersedia');
}

function setPrayerRefreshBusy(busy){
  const btn=$('#locBtn');
  if(!btn)return;

  btn.disabled=!!busy;
  btn.setAttribute('aria-busy',busy?'true':'false');

  if(busy){
    btn.dataset.oldHtml=btn.innerHTML;
    btn.innerHTML='<span aria-hidden="true">⌖</span> Memuat…';
    btn.style.opacity='.65';
  }else{
    btn.innerHTML=btn.dataset.oldHtml||'<span aria-hidden="true">⌖</span> Ubah';
    btn.style.opacity='';
  }
}

function getCurrentPrayerPosition(){
  return new Promise((resolve,reject)=>{
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy:false,
        timeout:12000,
        maximumAge:3600000
      }
    );
  });
}

function compactPrayerError(message='Jadwal belum dapat diperbarui.'){
  const times=$('#prayerTimes');
  if(!times)return;

  times.innerHTML=
    `<div style="grid-column:1/-1;padding:14px 16px;border-radius:14px;`+
    `background:#f7f0e4;font-size:13px;line-height:1.5;color:#58655f">`+
    `${message}</div>`;

  const next=$('#nextPrayer');
  if(next){
    next.innerHTML=
      '<b>Jadwal belum tersedia</b><br><span>Coba lagi beberapa saat.</span>';
  }
}

async function getPrayerTimes(){
  if(prayerRefreshInFlight)return;

  if(!navigator.onLine){
    await appNotice('Tidak ada koneksi internet. Jadwal yang sudah tersimpan tetap dapat dilihat. Sambungkan internet untuk memperbarui lokasi atau jadwal.');
    return;
  }

  if(!navigator.geolocation){
    $('#location').textContent='Lokasi tidak didukung perangkat';
    return;
  }

  prayerRefreshInFlight=true;
  setPrayerRefreshBusy(true);

  const previousLoc=getSavedLocation();
  const previousLocationText=$('#location')?.textContent||'';
  const hadValidSchedule=!!latestPrayerTimes;

  try{
    $('#location').textContent='📍 Mencari lokasi…';

    const pos=await getCurrentPrayerPosition();
    const {latitude,longitude}=pos.coords;
    const geo=await reverseGeocode(latitude,longitude);

    // Lokasi baru belum disimpan di sini.
    // Simpan hanya setelah jadwal untuk lokasi tersebut benar-benar berhasil.
    let loc={
      latitude,
      longitude,
      label:geo.label,
      regionName:geo.regionName,
      regionCandidates:geo.regionCandidates||[],
      province:geo.province,
      city:geo.city,
      updatedAt:Date.now()
    };

    setLocationLabel(loc.label);

    const data=await fetchPrayerTimes(
      latitude,
      longitude,
      loc.regionName,
      '',
      loc.regionCandidates||[],
      loc.city||'',
      loc.province||''
    );

    if(data?.region?.id){
      loc={
        ...loc,
        prayerRegionId:data.region.id,
        prayerRegionName:data.region.name||loc.regionName,
        prayerSource:data.source||'kemenag',
        updatedAt:Date.now()
      };
    }

    // Baru sekarang lokasi dianggap valid.
    saveLocation(loc);
    store.setItem(cachePrayerKey(loc),JSON.stringify(data));

    renderPrayerData(data);
    queuePushSync();

  }catch(e){
    console.warn('Prayer refresh failed',e);

    // Jangan rusak jadwal yang sebelumnya masih valid hanya karena
    // satu refresh jaringan/API gagal.
    if(previousLoc){
      saveLocation(previousLoc);

      if(hadValidSchedule){
        $('#location').textContent=
          previousLocationText ||
          `📍 ${previousLoc.label||'Lokasi aktif'}`;
      }else{
        setLocationLabel(previousLoc.label||'Lokasi aktif');
        compactPrayerError(
          'Gagal memperbarui jadwal. Jadwal terakhir tetap disimpan.'
        );
      }

    }else if(!hadValidSchedule){
      compactPrayerError(
        'Jadwal gagal dimuat. Periksa koneksi lalu coba lagi.'
      );
    }

  }finally{
    prayerRefreshInFlight=false;
    setPrayerRefreshBusy(false);
  }
}

function cleanTime(v=''){return String(v).split(' ')[0].slice(0,5);}
function renderPrayerData(data){
  latestPrayerTimes=data.timings||null;
  renderPrayers(data.timings);

  const loc=getSavedLocation();
  if(loc?.label){
    const source=data?.source==='kemenag'
      ? ' • Kemenag'
      : data?.source==='aladhan-fallback'
        ? ' • Cadangan'
        : '';
    $('#location').textContent=`📍 ${loc.label}${source}`;
    $('#settingsLocation').textContent=
      `Lokasi aktif: ${loc.label}${data?.region?.name?` • ${data.region.name}`:''}`;
  }

  queuePushSync();
  queueNativePrayerScheduleSync();
  startPrayerNotificationScheduler();
  const hijri=data.date?.hijri;
  if(hijri){
    const h=`${hijri.day} ${hijri.month?.en||''} ${hijri.year} H`;
    $('#hijriDate').textContent=h;
  }
}
function renderPrayers(t){
  if(!t)return;

  const displayNames=[
    ['Imsak','Imsak'],
    ['Subuh','Fajr'],
    ['Dzuhur','Dhuhr'],
    ['Ashar','Asr'],
    ['Maghrib','Maghrib'],
    ['Isya','Isha']
  ];
  const prayerNames=displayNames.slice(1);
  const parse=([n,k])=>{
    let tm=cleanTime(t[k]);
    // Sebagian sumber jadwal Kemenag tidak mengirim Imsak.
    // Untuk tampilan beranda, gunakan 10 menit sebelum Subuh sebagai fallback.
    if(n==='Imsak' && !/^\d{2}:\d{2}$/.test(tm)){
      const fajr=cleanTime(t.Fajr);
      if(/^\d{2}:\d{2}$/.test(fajr)){
        const [fh,fm]=fajr.split(':').map(Number);
        const total=(fh*60+fm-10+1440)%1440;
        tm=`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
      }
    }
    const a=tm.split(':').map(Number);
    const mins=(Number.isFinite(a[0])&&Number.isFinite(a[1]))?a[0]*60+a[1]:0;
    return {n,k,tm,mins};
  };
  const display=displayNames.map(parse);
  const prayers=prayerNames.map(parse);

  const pad=v=>String(v).padStart(2,'0');

  const update=()=>{
    const now=new Date();
    const curSeconds=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();
    const curMinutes=curSeconds/60;

    let next=prayers.find(x=>x.mins>curMinutes);
    if(!next){
      const f=prayers[0];
      next={...f,mins:f.mins+1440};
    }

    let active;
    // Setelah tengah malam tetapi sebelum Subuh, waktu sholat aktif
    // masih Isya dari hari sebelumnya. Subuh adalah waktu berikutnya.
    if(curMinutes<prayers[0].mins){
      active=prayers[prayers.length-1];
    }else{
      active=[...prayers].reverse().find(x=>x.mins<=curMinutes)||prayers[prayers.length-1];
    }

    $('#prayerTimes').innerHTML=display.map(x=>
      `<div class="time ${x.n===active.n?'active':''}"><span>${x.n}</span><b>${x.tm}</b></div>`
    ).join('');

    const targetSeconds=next.mins*60;
    const diffSeconds=Math.max(0,Math.round(targetSeconds-curSeconds));
    const h=Math.floor(diffSeconds/3600);
    const m=Math.floor((diffSeconds%3600)/60);
    const s=diffSeconds%60;

    const timeEl=$('#currentPrayerTime');
    const countdownEl=$('#prayerCountdownValue');
    const targetEl=$('#prayerCountdownTarget');
    if(timeEl){
      const clockNow=new Date();
      timeEl.textContent=`${pad(clockNow.getHours())}:${pad(clockNow.getMinutes())}`;
    }
    if(countdownEl)countdownEl.textContent=`−${pad(h)}:${pad(m)}:${pad(s)}`;
    if(targetEl)targetEl.textContent=`menuju ${next.n}`;

    $('#nextPrayer').innerHTML=`<b>Sholat berikutnya: ${next.n} — ${next.tm}</b><br>${h?h+' jam ':''}${m} menit lagi`;
  };

  update();
  clearInterval(prayerCountdownTimer);
  prayerCountdownTimer=setInterval(update,1000);
}

let monthlyOffset=0;
function renderMonthlyHeader(){
  const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+monthlyOffset);
  $('#monthlyTitle').textContent=new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(d);
}
async function loadMonthlyPrayerTimes(){
  const loc=getSavedLocation();

  if(!loc){
    $('#monthlyTable').innerHTML=
      '<div class="empty-state">Aktifkan lokasi terlebih dahulu dari Beranda atau Pengaturan.</div>';
    return;
  }

  const d=new Date();
  d.setDate(1);
  d.setMonth(d.getMonth()+monthlyOffset);

  const monthKey=
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  $('#monthlyTable').innerHTML=
    '<div class="empty-state">Memuat jadwal bulanan Kemenag…</div>';

  try{
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Makassar';
    const params=new URLSearchParams({
      latitude:String(loc.latitude),
      longitude:String(loc.longitude),
      month:monthKey,
      tz
    });

    if(loc.regionName)params.set('region',loc.regionName);
    if(loc.prayerRegionId)params.set('regionId',loc.prayerRegionId);
    if(loc.city)params.set('city',loc.city);
    if(loc.province)params.set('province',loc.province);
    if(Array.isArray(loc.regionCandidates) && loc.regionCandidates.length){
      params.set(
        'regionCandidates',
        JSON.stringify(loc.regionCandidates.slice(0,20))
      );
    }

    const r=await fetch(`${PUSH_API}/prayer/monthly?${params.toString()}`,{
      cache:'no-store'
    });

    const j=await r.json().catch(()=>null);
    if(!r.ok || !Array.isArray(j?.rows))throw new Error('monthly');

    const today=dateKey();

    $('#monthlyTable').innerHTML=
      `<div class="monthly-grid monthly-head">`+
      `<b>Tgl</b><b>Subuh</b><b>Dzuhur</b><b>Ashar</b><b>Maghrib</b><b>Isya</b>`+
      `</div>`+
      j.rows.map(row=>{
        const day=Number(String(row.date||'').slice(-2));
        const t=row.timings||{};
        return `<div class="monthly-grid ${row.date===today?'today':''}">`+
          `<span>${day||''}</span>`+
          `<span>${cleanTime(t.Fajr)}</span>`+
          `<span>${cleanTime(t.Dhuhr)}</span>`+
          `<span>${cleanTime(t.Asr)}</span>`+
          `<span>${cleanTime(t.Maghrib)}</span>`+
          `<span>${cleanTime(t.Isha)}</span>`+
          `</div>`;
      }).join('');

  }catch{
    $('#monthlyTable').innerHTML=
      '<div class="empty-state">Jadwal bulanan gagal dimuat.</div>';
  }
}
function changeMonth(step){monthlyOffset+=step;renderMonthlyHeader();loadMonthlyPrayerTimes();}

const NOTIF_SETTINGS_KEY='amaliyah:prayerNotifications';
const PUSH_API='https://amaliyah-notify.elmahbub45.workers.dev';
let pushSyncTimer=null;
const DEFAULT_NOTIF_SETTINGS={
  enabled:false,
  lead:0,
  adhanMode:'notification',
  prayers:{Subuh:true,Dzuhur:true,Ashar:true,Maghrib:true,Isya:true}
};


function pushSupported(){
  if(nativeNotificationApp())return true;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function nativeNotificationApp(){
  return !!(window.AmaliyahAndroid &&
    typeof window.AmaliyahAndroid.getNotificationPermission==='function');
}
function nativeAdhanSupported(){
  return !!(nativeNotificationApp() &&
    typeof window.AmaliyahAndroid.syncPrayerSchedule==='function' &&
    typeof window.AmaliyahAndroid.getAdhanMode==='function');
}
function nativeExactAlarmPermission(){
  if(!nativeAdhanSupported())return 'unsupported';
  try{return window.AmaliyahAndroid.getExactAlarmPermission?.()||'required';}
  catch{return 'required'}
}
function getAdhanMode(){
  const fallback=getNotificationSettings().adhanMode||'notification';
  if(!nativeAdhanSupported())return fallback;
  try{
    const mode=String(window.AmaliyahAndroid.getAdhanMode?.()||fallback);
    return ['notification','short','full'].includes(mode)?mode:fallback;
  }catch{return fallback}
}
function syncAdhanUI(){
  const card=$('#adhanSettings');
  if(!card)return;
  const supported=nativeAdhanSupported();
  card.classList.toggle('hidden',!supported);
  if(!supported)return;

  const s=getNotificationSettings();
  const mode=getAdhanMode();
  document.querySelectorAll('input[name="adhanMode"]').forEach(input=>{
    input.checked=input.value===mode;
    input.disabled=!s.enabled || notificationPermission()!=='granted';
  });

  const exact=nativeExactAlarmPermission();
  const status=$('#adhanStatusText');
  const exactBtn=$('#adhanExactAlarmBtn');
  const testBtn=$('#adhanTestBtn');
  const stopBtn=$('#adhanStopBtn');
  const soundEnabled=mode!=='notification';

  if(status){
    status.classList.remove('adhan-ready','adhan-warning');
    if(!s.enabled || notificationPermission()!=='granted'){
      status.textContent='Aktifkan Notifikasi Sholat terlebih dahulu.';
    }else if(!soundEnabled){
      status.textContent='Hanya notifikasi • tanpa suara adzan.';
      status.classList.add('adhan-ready');
    }else if(exact==='granted'){
      status.textContent=mode==='full'
        ? 'Adzan lengkap aktif • ketepatan waktu siap.'
        : 'Pengingat singkat aktif • ketepatan waktu siap.';
      status.classList.add('adhan-ready');
    }else{
      status.textContent='Perlu izin Ketepatan Waktu agar suara berbunyi tepat saat masuk waktu sholat.';
      status.classList.add('adhan-warning');
    }
  }
  if(exactBtn){
    exactBtn.classList.toggle('hidden',!soundEnabled || exact==='granted');
    exactBtn.disabled=!s.enabled || notificationPermission()!=='granted';
  }
  if(testBtn)testBtn.disabled=!s.enabled || notificationPermission()!=='granted' || !soundEnabled;
  if(stopBtn)stopBtn.disabled=!soundEnabled;
}
async function setAdhanMode(mode){
  if(!nativeAdhanSupported())return;
  mode=['notification','short','full'].includes(mode)?mode:'notification';
  const s=getNotificationSettings();
  s.adhanMode=mode;
  setNotificationSettings(s);
  try{window.AmaliyahAndroid.setAdhanMode?.(mode);}catch{}
  syncAdhanUI();
  if(mode!=='notification' && nativeExactAlarmPermission()!=='granted'){
    await requestAdhanExactAlarm();
  }
  queueNativePrayerScheduleSync();
}
async function requestAdhanExactAlarm(){
  if(!nativeAdhanSupported())return;
  try{window.AmaliyahAndroid.requestExactAlarmPermission?.();}catch{}
  setTimeout(()=>syncAdhanUI(),400);
}
async function testAdhanSound(){
  if(!nativeAdhanSupported())return;
  const mode=getAdhanMode();
  if(mode==='notification')return appNotice('Pilih Pengingat Singkat atau Adzan Lengkap terlebih dahulu.');
  try{
    window.AmaliyahAndroid.previewAdhan?.(mode,'Dzuhur');
    await appNotice(mode==='full'?'Memutar contoh adzan lengkap.':'Memutar contoh pengingat singkat.');
  }catch{await appNotice('Suara belum dapat diputar.')}
}
function stopAdhanSound(){
  if(!nativeAdhanSupported())return;
  try{window.AmaliyahAndroid.stopAdhan?.();}catch{}
}

let nativePrayerScheduleSyncTimer=null;
function queueNativePrayerScheduleSync(){
  if(!nativeAdhanSupported())return;
  clearTimeout(nativePrayerScheduleSyncTimer);
  nativePrayerScheduleSyncTimer=setTimeout(()=>syncNativePrayerSchedule(),1200);
}
function nativeMonthlyParams(loc,monthKey){
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Makassar';
  const params=new URLSearchParams({
    latitude:String(loc.latitude),
    longitude:String(loc.longitude),
    month:monthKey,
    tz
  });
  if(loc.regionName)params.set('region',loc.regionName);
  if(loc.prayerRegionId)params.set('regionId',loc.prayerRegionId);
  if(loc.city)params.set('city',loc.city);
  if(loc.province)params.set('province',loc.province);
  if(Array.isArray(loc.regionCandidates) && loc.regionCandidates.length){
    params.set('regionCandidates',JSON.stringify(loc.regionCandidates.slice(0,20)));
  }
  return params;
}
async function fetchNativeMonthlyRows(loc,monthOffset){
  const d=new Date();
  d.setDate(1);
  d.setMonth(d.getMonth()+monthOffset);
  const monthKey=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const params=nativeMonthlyParams(loc,monthKey);
  const r=await fetch(`${PUSH_API}/prayer/monthly?${params.toString()}`,{cache:'no-store'});
  const j=await r.json().catch(()=>null);
  if(!r.ok || !Array.isArray(j?.rows))throw new Error('native-monthly');
  return j.rows;
}
async function syncNativePrayerSchedule(){
  if(!nativeAdhanSupported())return;
  const s=getNotificationSettings();
  const loc=getSavedLocation();
  if(!s.enabled || notificationPermission()!=='granted'){
    try{window.AmaliyahAndroid.clearPrayerSchedule?.();}catch{}
    return;
  }
  if(!loc)return;

  // Jangan hapus jadwal native yang sudah tersimpan hanya karena internet sedang putus.
  if(!navigator.onLine){
    try{window.AmaliyahAndroid.rescheduleStoredPrayerAlarms?.();}catch{}
    return;
  }

  try{
    const [currentRows,nextRows]=await Promise.all([
      fetchNativeMonthlyRows(loc,0),
      fetchNativeMonthlyRows(loc,1)
    ]);
    const byDate=new Map();
    [...currentRows,...nextRows].forEach(row=>{
      if(row?.date)byDate.set(row.date,row);
    });
    const payload={
      version:1,
      enabled:true,
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Makassar',
      leadMinutes:Number(s.lead||0),
      adhanMode:getAdhanMode(),
      prayers:{
        Subuh:!!s.prayers.Subuh,
        Dzuhur:!!s.prayers.Dzuhur,
        Ashar:!!s.prayers.Ashar,
        Maghrib:!!s.prayers.Maghrib,
        Isya:!!s.prayers.Isya
      },
      location:{
        latitude:Number(loc.latitude),
        longitude:Number(loc.longitude),
        label:loc.label||'',
        regionId:loc.prayerRegionId||'',
        regionName:loc.prayerRegionName||loc.regionName||''
      },
      rows:[...byDate.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)))
    };
    window.AmaliyahAndroid.syncPrayerSchedule(JSON.stringify(payload));
  }catch(err){
    console.warn('Native prayer schedule sync failed',err);
    try{window.AmaliyahAndroid.rescheduleStoredPrayerAlarms?.();}catch{}
  }
}
function waitForNativeNotificationPermission(){
  return new Promise(resolve=>{
    const started=Date.now();
    const check=()=>{
      const permission=notificationPermission();
      if(permission==='granted' || Date.now()-started>30000)return resolve(permission);
      setTimeout(check,250);
    };
    check();
  });
}
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}
async function getPushRegistration(){
  if(!pushSupported())throw new Error('Perangkat belum mendukung layanan notifikasi.');
  const registration=await navigator.serviceWorker.ready;
  if(!registration)throw new Error('Layanan aplikasi belum siap.');
  return registration;
}
async function getPushSubscription(){
  if(!pushSupported())return null;
  try{
    const reg=await getPushRegistration();
    return await reg.pushManager.getSubscription();
  }catch{return null}
}
async function getVapidPublicKey(){
  const r=await fetch(`${PUSH_API}/vapid-public-key`,{cache:'no-store'});
  if(!r.ok)throw new Error('Public key notifikasi gagal dimuat.');
  const j=await r.json();
  if(!j?.publicKey)throw new Error('Public key notifikasi tidak tersedia.');
  return j.publicKey;
}
async function ensurePushSubscription(){
  if(!pushSupported())throw new Error('Perangkat ini belum mendukung notifikasi Amaliyah.');
  if(Notification.permission!=='granted')throw new Error('Izin notifikasi belum diberikan.');

  const reg=await getPushRegistration();
  let sub=await reg.pushManager.getSubscription();
  if(sub)return sub;

  const publicKey=await getVapidPublicKey();
  sub=await reg.pushManager.subscribe({
    userVisibleOnly:true,
    applicationServerKey:urlBase64ToUint8Array(publicKey)
  });
  return sub;
}
function buildPushSchedule(){
  if(!latestPrayerTimes)return {};
  const map=[
    ['Subuh','Fajr'],['Dzuhur','Dhuhr'],['Ashar','Asr'],
    ['Maghrib','Maghrib'],['Isya','Isha']
  ];
  const out={};
  for(const [name,key] of map){
    const value=cleanTime(latestPrayerTimes[key]);
    if(value)out[name]=value;
  }
  return out;
}
async function syncPushSubscription({silent=true}={}){
  const settings=getNotificationSettings();
  if(nativeNotificationApp())return settings.enabled ? {native:true} : null;
  if(!settings.enabled || notificationPermission()!=='granted')return null;

  try{
    const sub=await ensurePushSubscription();
    const savedLocation=getSavedLocation();
    const payload={
      subscription:sub.toJSON(),
      location:savedLocation ? {
        latitude:Number(savedLocation.latitude),
        longitude:Number(savedLocation.longitude),
        label:savedLocation.label||'',
        regionName:savedLocation.regionName||'',
        regionId:savedLocation.prayerRegionId||'',
        regionLabel:savedLocation.prayerRegionName||'',
        regionCandidates:Array.isArray(savedLocation.regionCandidates)
          ? savedLocation.regionCandidates.slice(0,20)
          : [],
        city:savedLocation.city||'',
        province:savedLocation.province||''
      } : null,
      prayers:{
        subuh:!!settings.prayers.Subuh,
        dzuhur:!!settings.prayers.Dzuhur,
        ashar:!!settings.prayers.Ashar,
        maghrib:!!settings.prayers.Maghrib,
        isya:!!settings.prayers.Isya
      },
      leadMinutes:Number(settings.lead||0),
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Makassar',
      schedule:buildPushSchedule()
    };

    const r=await fetch(`${PUSH_API}/subscribe`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok || !j.ok)throw new Error('Layanan notifikasi belum siap. Coba lagi saat internet stabil.');

    await updatePushStatus();
    return sub;
  }catch(err){
    await updatePushStatus(err);
    if(!silent)throw err;
    return null;
  }
}
function queuePushSync(){
  clearTimeout(pushSyncTimer);
  pushSyncTimer=setTimeout(()=>syncPushSubscription({silent:true}),700);
}
async function disablePushSubscription(){
  if(nativeNotificationApp())return;
  const sub=await getPushSubscription();
  if(!sub)return;

  try{
    await fetch(`${PUSH_API}/unsubscribe`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({endpoint:sub.endpoint})
    });
  }catch{}

  try{await sub.unsubscribe();}catch{}
}
async function updatePushStatus(error=null){
  const status=$('#notificationStatusText');
  const testBtn=$('#notificationTestBtn');
  const note=$('#notificationPushNote');
  const s=getNotificationSettings();

  if(nativeNotificationApp()){
    let fcmStatus='connecting';
    try{fcmStatus=window.AmaliyahAndroid.getFcmStatus?.()||'connecting';}catch{}
    if(testBtn)testBtn.disabled=notificationPermission()!=='granted';
    if(status){
      status.classList.toggle('notification-push-error',fcmStatus==='error');
      status.classList.toggle('notification-push-live',notificationPermission()==='granted'&&s.enabled);
      status.textContent=notificationPermission()==='granted'&&s.enabled
        ? `Notifikasi Aktif • ${fcmStatus==='ready'?'perangkat siap menerima pengingat':fcmStatus==='error'?'layanan perlu disambungkan ulang':'sedang menyiapkan layanan'}`
        : 'Notifikasi belum diaktifkan';
    }
    if(note)note.textContent=fcmStatus==='error'
      ? 'Izin notifikasi sudah aktif, tetapi layanan pengingat belum tersambung. Buka ulang halaman ini saat internet aktif untuk mencoba lagi.'
      : 'Aplikasi menggunakan sistem notifikasi perangkat. Nama pengirim ditampilkan sebagai Amaliyah.';
    return;
  }

  if(!pushSupported()){
    if(testBtn)testBtn.disabled=true;
    return;
  }

  const sub=await getPushSubscription();

  if(testBtn)testBtn.disabled=!(Notification.permission==='granted' && !!sub);

  if(error){
    if(status){
      status.textContent=`Layanan notifikasi belum tersambung • coba lagi`;
      status.classList.add('notification-push-error');
      status.classList.remove('notification-push-live');
    }
    return;
  }

  status?.classList.remove('notification-push-error','notification-push-live');

  if(Notification.permission==='granted' && s.enabled && sub){
    if(status){
      status.textContent='Notifikasi Aktif • perangkat siap menerima pengingat';
      status.classList.add('notification-push-live');
    }
    if(note)note.textContent='Perangkat sudah siap menerima notifikasi. Gunakan “Tes Notifikasi” untuk memastikan pengingat tetap diterima saat aplikasi ditutup.';
  }else if(note){
    note.textContent='Perangkat ini akan dihubungkan ke layanan notifikasi Amaliyah agar pengingat sholat tetap dapat diterima saat aplikasi ditutup.';
  }
}
async function testPushNotification(){
  const btn=$('#notificationTestBtn');
  try{
    if(btn){btn.disabled=true;btn.textContent='Mengirim…';}
    if(nativeNotificationApp()){
      await showAppNotification('Tes Amaliyah','Tes notifikasi berhasil. Nama pengirim akan tampil sebagai Amaliyah.');
      await appNotice('Tes notifikasi telah dikirim.');
      return;
    }
    const sub=await syncPushSubscription({silent:false});
    if(!sub)throw new Error('Perangkat belum siap menerima notifikasi.');

    const r=await fetch(`${PUSH_API}/test-push`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({endpoint:sub.endpoint})
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok || !j.ok)throw new Error('Layanan notifikasi belum siap. Coba lagi saat internet stabil.');

    await appNotice('Tes dikirim. Tutup/minimalkan aplikasi dan periksa notifikasi HP.');
  }catch(err){
    await appNotice('Tes notifikasi belum berhasil. Periksa koneksi internet lalu coba kembali.');
    await updatePushStatus(err);
  }finally{
    if(btn){btn.textContent='Tes Notifikasi';}
    await updatePushStatus();
  }
}

function getNotificationSettings(){
  try{
    const saved=JSON.parse(store.getItem(NOTIF_SETTINGS_KEY)||'null');
    const settings={
      ...DEFAULT_NOTIF_SETTINGS,
      ...(saved||{}),
      prayers:{...DEFAULT_NOTIF_SETTINGS.prayers,...(saved?.prayers||{})}
    };
    if(nativeNotificationApp() && typeof window.AmaliyahAndroid.getNotificationEnabledState==='function'){
      const nativeState=window.AmaliyahAndroid.getNotificationEnabledState();
      if(nativeState==='true' || nativeState==='false')settings.enabled=nativeState==='true';
      else window.AmaliyahAndroid.setNotificationEnabled?.(!!settings.enabled);
    }
    return settings;
  }catch{return {...DEFAULT_NOTIF_SETTINGS,prayers:{...DEFAULT_NOTIF_SETTINGS.prayers}}}
}
function setNotificationSettings(settings){
  store.setItem(NOTIF_SETTINGS_KEY,JSON.stringify(settings));
  if(nativeNotificationApp()){
    try{window.AmaliyahAndroid.setNotificationEnabled?.(!!settings.enabled);}catch{}
    if(nativeAdhanSupported()){
      try{window.AmaliyahAndroid.setAdhanMode?.(settings.adhanMode||'notification');}catch{}
    }
  }
}
function notificationPermission(){
  if(nativeNotificationApp()){
    try{return window.AmaliyahAndroid.getNotificationPermission();}
    catch{return 'default'}
  }
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
  if(btn)btn.classList.remove('permission-granted','permission-denied');
  if(permission==='unsupported'){
    if(status)status.textContent='Perangkat ini belum mendukung notifikasi Amaliyah.';
    if(btn)btn.classList.add('hidden');
  }else if(permission==='denied'){
    if(status)status.textContent=nativeNotificationApp()
      ? 'Izin notifikasi diblokir di pengaturan aplikasi.'
      : 'Izin notifikasi diblokir di pengaturan perangkat.';
    if(btn){btn.textContent='Izin Diblokir';btn.disabled=true;btn.classList.add('permission-denied');}
  }else if(permission==='granted'){
    if(status)status.textContent=s.enabled?'Notifikasi Aktif':'Izin tersedia • notifikasi belum dinyalakan';
    if(btn){btn.textContent='Izin Notifikasi Aktif';btn.disabled=true;btn.classList.add('permission-granted');}
  }else{
    if(status)status.textContent='Notifikasi belum diizinkan.';
    if(btn){btn.textContent='Aktifkan Izin Notifikasi';btn.disabled=false;btn.classList.remove('hidden');}
  }
  $('#notifBtn')?.classList.toggle('notification-active',permission==='granted'&&s.enabled);
  syncAdhanUI();
  updatePushStatus();
}
async function requestNotifications(){
  if(nativeNotificationApp()){
    try{window.AmaliyahAndroid.requestNotificationPermission();}catch{}
    const p=await waitForNativeNotificationPermission();
    if(p==='granted'){
      const s=getNotificationSettings();
      s.enabled=true;
      setNotificationSettings(s);
      syncNotificationUI();
      startPrayerNotificationScheduler();
      queueNativePrayerScheduleSync();
      await showAppNotification('Amaliyah','Notifikasi berhasil diaktifkan.');
    }else{
      syncNotificationUI();
      await appNotice('Izin notifikasi belum diberikan. Aktifkan melalui pengaturan aplikasi Amaliyah.');
    }
    return;
  }
  if(!pushSupported())return appNotice('Perangkat ini belum mendukung notifikasi Amaliyah.');
  if(Notification.permission==='denied'){
    syncNotificationUI();
    return appNotice('Izin notifikasi diblokir. Aktifkan kembali melalui pengaturan notifikasi perangkat.');
  }

  const p=Notification.permission==='granted'
    ? 'granted'
    : await Notification.requestPermission();

  if(p==='granted'){
    const s=getNotificationSettings();
    s.enabled=true;
    setNotificationSettings(s);
    syncNotificationUI();
    startPrayerNotificationScheduler();

    try{
      await syncPushSubscription({silent:false});
      await showAppNotification('Amaliyah','Notifikasi berhasil diaktifkan. Perangkat sedang disiapkan untuk menerima pengingat.');
    }catch(err){
      await appNotice(`Izin sudah aktif, tetapi layanan notifikasi belum tersambung. Coba lagi saat internet stabil.`);
    }
  }else{
    syncNotificationUI();
  }
}
async function setNotificationMaster(enabled){
  const s=getNotificationSettings();

  if(enabled && notificationPermission()!=='granted'){
    $('#notificationMaster').checked=false;
    await requestNotifications();
    return;
  }

  s.enabled=!!enabled;
  setNotificationSettings(s);
  syncNotificationUI();
  startPrayerNotificationScheduler();
  queueNativePrayerScheduleSync();

  if(enabled){
    if(nativeNotificationApp())return;
    try{await syncPushSubscription({silent:false});}
    catch(err){await appNotice(`Layanan notifikasi belum tersambung. Coba lagi saat internet stabil.`);}
  }else{
    await disablePushSubscription();
    await updatePushStatus();
  }
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
  queuePushSync();
  queueNativePrayerScheduleSync();
}
async function showAppNotification(title,body){
  if(notificationPermission()!=='granted')return;
  if(nativeNotificationApp()){
    try{window.AmaliyahAndroid.showNotification(String(title||'Amaliyah'),String(body||''));}
    catch{}
    return;
  }
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
  if(nativeAdhanSupported())return;
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

  const cached=loc
    ? store.getItem(cachePrayerKey(loc))
    : null;

  if(cached){
    try{
      const data=JSON.parse(cached);
      renderPrayerData(data);

      // Tetap refresh di background agar sumber Kemenag/tanggal terbaru terpakai.
      fetchPrayerTimes(
        loc.latitude,
        loc.longitude,
        loc.regionName||'',
        loc.prayerRegionId||'',
        loc.regionCandidates||[],
        loc.city||'',
        loc.province||''
      ).then(data=>{
        if(data?.region?.id){
          const nextLoc={
            ...getSavedLocation(),
            prayerRegionId:data.region.id,
            prayerRegionName:data.region.name||loc.regionName,
            prayerSource:data.source||'kemenag'
          };
          saveLocation(nextLoc);
          store.setItem(cachePrayerKey(nextLoc),JSON.stringify(data));
        }
        renderPrayerData(data);
        queuePushSync();
      }).catch(()=>{});

      return;
    }catch{}
  }

  if(loc){
    try{
      const data=await fetchPrayerTimes(
        loc.latitude,
        loc.longitude,
        loc.regionName||'',
        loc.prayerRegionId||'',
        loc.regionCandidates||[],
        loc.city||'',
        loc.province||''
      );

      let nextLoc=loc;
      if(data?.region?.id){
        nextLoc={
          ...loc,
          prayerRegionId:data.region.id,
          prayerRegionName:data.region.name||loc.regionName,
          prayerSource:data.source||'kemenag'
        };
        saveLocation(nextLoc);
      }

      store.setItem(cachePrayerKey(nextLoc),JSON.stringify(data));
      renderPrayerData(data);
      queuePushSync();
      return;

    }catch{}
  }

  if(!navigator.onLine){
    if(loc)setLocationLabel(loc.label||'Lokasi tersimpan');
    compactPrayerError('Tidak ada koneksi internet. Jadwal hari ini belum tersimpan. Sambungkan internet sekali untuk memperbaruinya.');
  }else{
    $('#prayerTimes').innerHTML=
      '<span>Izinkan lokasi untuk menampilkan jadwal sholat.</span>';
  }
}



function refreshActiveScreen(){
  if(currentScreen==='bookmarks')renderBookmarks();
  if(currentScreen==='history')renderHistory();
  if(currentScreen==='favorites')renderFavoritesManager();
  if(currentScreen==='home')updateHome();
  if(currentScreen==='settings')syncNotificationUI();
}
window.addEventListener('amaliyah-exact-alarm-changed',()=>{
  syncAdhanUI();
  queueNativePrayerScheduleSync();
});
window.addEventListener('pageshow',refreshActiveScreen);
window.addEventListener('focus',refreshActiveScreen);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')refreshActiveScreen();
});

window.showHome=showHome;
window.showCategories=showCategories;
window.showLibrary=showLibrary;
window.showFavoritesManager=showFavoritesManager;
window.showCollection=showCollection;
window.showSettings=showSettings;
window.showMonthly=showMonthly;
window.showBookmarks=showBookmarks;
window.showBookmarkKind=showBookmarkKind;
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
window.testPushNotification=testPushNotification;
window.setAdhanMode=setAdhanMode;
window.requestAdhanExactAlarm=requestAdhanExactAlarm;
window.testAdhanSound=testAdhanSound;
window.stopAdhanSound=stopAdhanSound;
window.clearAllHistory=clearAllHistory;

const savedScreen=getSavedScreenState();
const initialState=savedScreen||{screen:'home',category:'Semua',focusNotifications:false,itemId:null};

history.replaceState({
  amaliyah:true,
  screen:initialState.screen,
  category:initialState.category||'Semua',
  focusNotifications:!!initialState.focusNotifications,
  itemId:initialState.itemId||null
},'',location.href);

navigateScreen(initialState.screen,{
  push:false,
  category:initialState.category||'Semua',
  focusNotifications:!!initialState.focusNotifications,
  itemId:initialState.itemId||null
});

renderLibrary(initialState.category||'Semua');
syncSettingsLocation();
syncNotificationUI();
bootPrayer();
if(nativeNotificationApp()){
  // V2.50.1: wrapper Android tetap mempertahankan Service Worker/cache shell.
  // Tanpa ini aplikasi akan blank saat perangkat benar-benar offline.
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  try{window.AmaliyahAndroid.retryFcmRegistration?.();}catch{}
  startPrayerNotificationScheduler();
  syncAdhanUI();
  queueNativePrayerScheduleSync();
}else if('serviceWorker'in navigator){
  navigator.serviceWorker.register('./sw.js').then(()=>startPrayerNotificationScheduler()).catch(()=>{});
}else{
  startPrayerNotificationScheduler();
}
