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
let prayerCountdownTimer = null;
let prayerNotificationTimer = null;
let latestPrayerTimes = null;
let prayerRefreshInFlight = false;
let activeLibraryCategory='Semua';
let librarySearchQuery='';
let activeCollectionId=null;

const SCREEN_TO_ID={
  home:'#app', library:'#library', collection:'#collection',
  settings:'#settings', monthly:'#monthly', bookmarks:'#bookmarks', history:'#history'
};
let currentScreen='home';
const SCREEN_STATE_KEY='amaliyah:screenState';

function allParts(){
  const arr=[];
  items.forEach(item=>{
    if(item.type==='single') arr.push({parent:item,part:item});
    else (item.parts||[]).forEach(part=>{ if(!part.itemId && part.file)arr.push({parent:item,part}); });
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
  saveScreenState(screen,{category,focusNotifications,itemId});
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
    paintScreen('home');
    saveScreenState('home');
    updateHome();
  }
});

function firstReadablePart(item,seen=new Set()){
  if(!item || seen.has(item.id))return null;
  seen.add(item.id);
  if(item.type==='single')return {item,part:item};
  for(const p of (item.parts||[])){
    if(p.itemId){
      const child=getItem(p.itemId);
      const nested=firstReadablePart(child,seen);
      if(nested)return nested;
    }else if(p.file){
      return {item,part:p};
    }
  }
  return null;
}

function resolveReadablePart(item,partId){
  if(!item)return null;
  if(item.type==='single')return {item,part:item};
  const direct=(item.parts||[]).find(p=>p.id===partId && !p.itemId && p.file);
  if(direct)return {item,part:direct};

  // V2.36.4: bila sebuah part dipindahkan keluar Collection menjadi Single,
  // pertahankan progres/lanjut membaca dengan ID part yang sama.
  if(partId){
    const migrated=resolvePart(partId);
    if(migrated && migrated.parent.id!==item.id)return migrated;
  }

  return firstReadablePart(item);
}

function getLastState(){
  let itemId=store.getItem('amaliyah:lastItem');
  let item=getItem(itemId);
  if(!item || item.hidden)item=items.find(x=>!x.hidden) || items[0];
  if(!item)return null;
  const pid=item.type==='single'?item.id:store.getItem(lastPartKey(item.id));
  return resolveReadablePart(item,pid);
}

function partProgress(part){
  const p=Math.max(1,+(store.getItem(pageKey(part.id))||1));
  const total=part.pages||1;
  return {page:Math.min(p,total),total,percent:Math.min(100,(p/total)*100)};
}

function itemProgress(item){
  if(item.type==='single') return {...partProgress(item),part:item};
  const pid=store.getItem(lastPartKey(item.id));
  const found=resolveReadablePart(item,pid);
  const pr=found?.part ? partProgress(found.part) : {page:1,total:1,percent:0};
  return {...pr,part:found?.part||null};
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
  const pid=store.getItem(lastPartKey(item.id));
  const found=resolveReadablePart(item,pid);
  if(!found)return showCollection(item.id);
  openPart(found.item.id,found.part.id);
}

function itemSearchText(item){
  const parts=(item.parts||[]).flatMap(p=>[p.title,p.arabicTitle]).filter(Boolean);
  return [item.title,item.arabicTitle,item.category,...parts]
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
    const visible=items.filter(b=>!b.hidden);
    const count=cat==='Semua' ? visible.length : visible.filter(b=>b.category===cat).length;
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
  const visibleItems=items.filter(x=>!x.hidden);
  let filtered=category==='Semua'?visibleItems:visibleItems.filter(x=>x.category===category);
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
  const entries=item.parts||[];
  $('#collectionMeta').innerHTML=`<b>${item.type==='collection'?'Koleksi berurutan':'Kelompok bacaan'}</b><span>${entries.length} isi</span>`;
  const wrap=$('#collectionList');

  wrap.innerHTML=entries.map((part,i)=>{
    if(part.itemId){
      const child=getItem(part.itemId);
      if(!child)return '';
      const childMeta=child.type==='single'
        ? `${Math.max(1,Number(child.pages)||1)} halaman`
        : `${child.parts?.length||0} isi`;
      const fav=isFavorite(child.id);
      return `<div class="collection-part-row nested-item-row">
        <button class="collection-part" type="button" data-child-item="${child.id}">
          <span class="part-number">${child.type==='single'?'▤':'▰'}</span>
          <span class="part-copy"><b>${child.title}</b><small>${child.type==='single'?'Bacaan':child.type==='collection'?'Collection':'Group'} • ${childMeta}</small></span>
          <span class="chevron">›</span>
        </button>
        <button class="favorite-btn part-favorite-btn ${fav?'active':''}" type="button" data-child-favorite="${child.id}" aria-label="${fav?'Hapus dari favorit':'Tambahkan ke favorit'}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>
        </button>
      </div>`;
    }
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
    e.stopPropagation();togglePartFavorite(item.id,btn.dataset.partFavorite);renderCollection(item.id);
  });
  wrap.querySelectorAll('[data-child-item]').forEach(btn=>btn.onclick=()=>openItem(btn.dataset.childItem));
  wrap.querySelectorAll('[data-child-favorite]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();toggleFavorite(btn.dataset.childFavorite);renderCollection(item.id);
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
    if(item&&part)return favoritePartKey(itemId,partId);

    // V2.36.4: favorit part lama mengikuti file jika part kini menjadi Single.
    const migrated=resolvePart(partId);
    if(migrated?.parent?.type==='single')return favoriteItemKey(migrated.parent.id);
    return null;
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
    return `<button class="favorite-card ${isPart?'favorite-card-part':''}" type="button" data-fav-key="${entry.key}">
      <span class="favorite-icon">${entry.item.icon||'◈'}</span>
      <span class="favorite-copy"><b>${title}</b><small>${meta}</small></span>
      <span class="favorite-star">★</span>
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
  openPart(found.parent.id,found.part.id,page);
}

function renderBookmarks(){
  const wrap=$('#bookmarkList');
  if(!wrap)return;

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
    <section class="bookmark-overview" aria-label="Ringkasan bookmark">
      <div class="bookmark-overview-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7 4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V21l-5-3-5 3z"/>
        </svg>
      </div>
      <div class="bookmark-overview-copy">
        <span>TERSIMPAN UNTUK DIBACA KEMBALI</span>
        <b>${count} Bookmark</b>
        <small>${count
          ? 'Buka kembali bacaan tepat dari halaman yang ditandai.'
          : 'Halaman yang ditandai dari Reader akan tersimpan di sini.'}</small>
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
        <b>Belum ada bookmark</b>
        <p>Tandai halaman penting saat membaca. Amaliyah akan membawamu kembali tepat ke halaman itu.</p>
      </div>
    `;
    return;
  }

  const cards=entries.map(x=>{
    const isSingle=x.parent.type==='single';
    const icon=String(x.parent.icon||'ا');
    const partText=isSingle
      ? 'Bacaan'
      : String(x.part.title||'Bagian');

    return `
      <button class="bookmark-card" type="button" data-bookmark="${x.part.id}">
        <span class="bookmark-card-icon" aria-hidden="true">${icon}</span>

        <span class="bookmark-card-copy">
          <span class="bookmark-card-kicker">${isSingle?'BACAAN':'KOLEKSI'}</span>
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
      if(x)openPart(x.parent.id,x.part.id,x.page);
    };
  });
}

function getHistoryEntries(){
  let hist=[];
  try{hist=JSON.parse(store.getItem('amaliyah_history')||'[]')}catch{}
  return hist.map((h,rawIndex)=>{
    if(h.partId){
      const parent=getItem(h.id);
      const part=parent?.type==='single'?parent:parent?.parts?.find(p=>p.id===h.partId);
      if(parent&&part)return {parent,part,page:h.page||1,rawIndex,raw:h};

      // V2.36.4: riwayat part lama tetap mengikuti ID bila menjadi Single.
      const migrated=resolvePart(h.partId);
      return migrated?{parent:migrated.parent,part:migrated.part,page:h.page||1,rawIndex,raw:h}:null;
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

async function clearAllHistory(){
  if(!getHistoryEntries().length)return;

  const ok=await appConfirm(
    'Hapus semua riwayat bacaan?\n\nProgres, bookmark, dan favorit tidak akan terhapus.'
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
  prayers:{Subuh:true,Dzuhur:true,Ashar:true,Maghrib:true,Isya:true}
};


function pushSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}
async function getPushRegistration(){
  if(!pushSupported())throw new Error('Web Push tidak didukung browser ini.');
  const registration=await navigator.serviceWorker.ready;
  if(!registration)throw new Error('Service Worker belum siap.');
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
  if(!pushSupported())throw new Error('Browser ini tidak mendukung Web Push.');
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
  if(!settings.enabled || Notification.permission!=='granted')return null;

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
    if(!r.ok || !j.ok)throw new Error(j.error||'Subscription gagal disimpan.');

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

  if(!pushSupported()){
    if(testBtn)testBtn.disabled=true;
    return;
  }

  const sub=await getPushSubscription();

  if(testBtn)testBtn.disabled=!(Notification.permission==='granted' && !!sub);

  if(error){
    if(status){
      status.textContent=`Push belum tersambung • ${error.message||'coba lagi'}`;
      status.classList.add('notification-push-error');
      status.classList.remove('notification-push-live');
    }
    return;
  }

  status?.classList.remove('notification-push-error','notification-push-live');

  if(Notification.permission==='granted' && s.enabled && sub){
    if(status){
      status.textContent='Notifikasi Push Aktif • perangkat tersambung';
      status.classList.add('notification-push-live');
    }
    if(note)note.textContent='Perangkat sudah terhubung ke Web Push. Gunakan “Tes Notifikasi” untuk memastikan notifikasi dapat diterima saat aplikasi ditutup.';
  }else if(note){
    note.textContent='Web Push akan menghubungkan perangkat ini ke layanan notifikasi Amaliyah. Setelah tes berhasil, tahap berikutnya adalah menjadwalkan pengiriman sholat dari server.';
  }
}
async function testPushNotification(){
  const btn=$('#notificationTestBtn');
  try{
    if(btn){btn.disabled=true;btn.textContent='Mengirim…';}
    const sub=await syncPushSubscription({silent:false});
    if(!sub)throw new Error('Subscription belum tersedia.');

    const r=await fetch(`${PUSH_API}/test-push`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({endpoint:sub.endpoint})
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok || !j.ok)throw new Error(j.error||'Tes notifikasi gagal.');

    await appNotice('Tes dikirim. Tutup/minimalkan aplikasi dan periksa notifikasi HP.');
  }catch(err){
    await appNotice(`Tes notifikasi gagal: ${err.message}`);
    await updatePushStatus(err);
  }finally{
    if(btn){btn.textContent='Tes Notifikasi';}
    await updatePushStatus();
  }
}

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
  updatePushStatus();
}
async function requestNotifications(){
  if(!pushSupported())return appNotice('Browser ini tidak mendukung Web Push.');
  if(Notification.permission==='denied'){
    syncNotificationUI();
    return appNotice('Izin notifikasi diblokir. Aktifkan kembali melalui pengaturan situs/browser.');
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
      await showAppNotification('Amaliyah','Notifikasi berhasil diaktifkan. Perangkat sedang disiapkan untuk Web Push.');
    }catch(err){
      await appNotice(`Izin aktif, tetapi Web Push belum tersambung: ${err.message}`);
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

  if(enabled){
    try{await syncPushSubscription({silent:false});}
    catch(err){await appNotice(`Web Push belum tersambung: ${err.message}`);}
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

  $('#prayerTimes').innerHTML=
    '<span>Izinkan lokasi untuk menampilkan jadwal sholat.</span>';
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
window.testPushNotification=testPushNotification;
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
if('serviceWorker'in navigator){
  navigator.serviceWorker.register('./sw.js').then(()=>startPrayerNotificationScheduler()).catch(()=>{});
}else{
  startPrayerNotificationScheduler();
}
