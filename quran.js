(()=>{
  'use strict';
  const config=window.AMALIYAH_QURAN_CONFIG||{};
  const total=Number(config.totalPages)||604;
  const store=localStorage;
  const $=selector=>document.querySelector(selector);
  const $$=selector=>[...document.querySelectorAll(selector)];
  const surahs=[
    [1,'Al-Fatihah','الفاتحة',1],[2,'Al-Baqarah','البقرة',2],[3,'Ali Imran','آل عمران',50],[4,'An-Nisa','النساء',77],[5,'Al-Ma\'idah','المائدة',106],[6,'Al-An\'am','الأنعام',128],[7,'Al-A\'raf','الأعراف',151],[8,'Al-Anfal','الأنفال',177],[9,'At-Taubah','التوبة',187],[10,'Yunus','يونس',208],[11,'Hud','هود',221],[12,'Yusuf','يوسف',235],[13,'Ar-Ra\'d','الرعد',249],[14,'Ibrahim','إبراهيم',255],[15,'Al-Hijr','الحجر',262],[16,'An-Nahl','النحل',267],[17,'Al-Isra','الإسراء',282],[18,'Al-Kahf','الكهف',293],[19,'Maryam','مريم',305],[20,'Taha','طه',312],[21,'Al-Anbiya','الأنبياء',322],[22,'Al-Hajj','الحج',332],[23,'Al-Mu\'minun','المؤمنون',342],[24,'An-Nur','النور',350],[25,'Al-Furqan','الفرقان',359],[26,'Asy-Syu\'ara','الشعراء',367],[27,'An-Naml','النمل',377],[28,'Al-Qasas','القصص',385],[29,'Al-Ankabut','العنكبوت',396],[30,'Ar-Rum','الروم',404],[31,'Luqman','لقمان',411],[32,'As-Sajdah','السجدة',415],[33,'Al-Ahzab','الأحزاب',418],[34,'Saba','سبإ',428],[35,'Fatir','فاطر',434],[36,'Yasin','يس',440],[37,'As-Saffat','الصافات',446],[38,'Sad','ص',453],[39,'Az-Zumar','الزمر',458],[40,'Gafir','غافر',467],[41,'Fussilat','فصلت',477],[42,'Asy-Syura','الشورى',483],[43,'Az-Zukhruf','الزخرف',489],[44,'Ad-Dukhan','الدخان',496],[45,'Al-Jasiyah','الجاثية',499],[46,'Al-Ahqaf','الأحقاف',502],[47,'Muhammad','محمد',507],[48,'Al-Fath','الفتح',511],[49,'Al-Hujurat','الحجرات',515],[50,'Qaf','ق',518],[51,'Az-Zariyat','الذاريات',520],[52,'At-Tur','الطور',523],[53,'An-Najm','النجم',526],[54,'Al-Qamar','القمر',528],[55,'Ar-Rahman','الرحمن',531],[56,'Al-Waqi\'ah','الواقعة',534],[57,'Al-Hadid','الحديد',537],[58,'Al-Mujadilah','المجادلة',542],[59,'Al-Hasyr','الحشر',545],[60,'Al-Mumtahanah','الممتحنة',549],[61,'As-Saff','الصف',551],[62,'Al-Jumu\'ah','الجمعة',553],[63,'Al-Munafiqun','المنافقون',554],[64,'At-Tagabun','التغابن',556],[65,'At-Talaq','الطلاق',558],[66,'At-Tahrim','التحريم',560],[67,'Al-Mulk','الملك',562],[68,'Al-Qalam','القلم',564],[69,'Al-Haqqah','الحاقة',566],[70,'Al-Ma\'arij','المعارج',568],[71,'Nuh','نوح',570],[72,'Al-Jinn','الجن',572],[73,'Al-Muzzammil','المزمل',574],[74,'Al-Muddassir','المدثر',575],[75,'Al-Qiyamah','القيامة',577],[76,'Al-Insan','الإنسان',578],[77,'Al-Mursalat','المرسلات',580],[78,'An-Naba','النبإ',582],[79,'An-Nazi\'at','النازعات',583],[80,'Abasa','عبس',585],[81,'At-Takwir','التكوير',586],[82,'Al-Infitar','الإنفطار',587],[83,'Al-Mutaffifin','المطففين',587],[84,'Al-Insyiqaq','الإنشقاق',589],[85,'Al-Buruj','البروج',590],[86,'At-Tariq','الطارق',591],[87,'Al-A\'la','الأعلى',591],[88,'Al-Gasyiyah','الغاشية',592],[89,'Al-Fajr','الفجر',593],[90,'Al-Balad','البلد',594],[91,'Asy-Syams','الشمس',595],[92,'Al-Lail','الليل',595],[93,'Ad-Duha','الضحى',596],[94,'Asy-Syarh','الشرح',596],[95,'At-Tin','التين',597],[96,'Al-Alaq','العلق',597],[97,'Al-Qadr','القدر',598],[98,'Al-Bayyinah','البينة',598],[99,'Az-Zalzalah','الزلزلة',599],[100,'Al-Adiyat','العاديات',599],[101,'Al-Qari\'ah','القارعة',600],[102,'At-Takasur','التكاثر',600],[103,'Al-Asr','العصر',601],[104,'Al-Humazah','الهمزة',601],[105,'Al-Fil','الفيل',601],[106,'Quraisy','قريش',602],[107,'Al-Ma\'un','الماعون',602],[108,'Al-Kausar','الكوثر',602],[109,'Al-Kafirun','الكافرون',603],[110,'An-Nasr','النصر',603],[111,'Al-Lahab','المسد',603],[112,'Al-Ikhlas','الإخلاص',604],[113,'Al-Falaq','الفلق',604],[114,'An-Nas','الناس',604]
  ];
  const juzPages=[1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];
  const ayahCounts=[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
  const madaniyah=new Set([2,3,4,5,8,9,22,24,33,47,48,49,57,58,59,60,61,62,63,64,65,66,76,98,99,110]);
  let currentPage=1;
  let activeTab='surah';
  let controlsTimer=0;
  let touchStartX=0;
  let touchStartY=0;
  let readerOpen=false;

  function ensureOfflineNotice(){
    let notice=$('#quranOfflineNotice');
    if(notice)return notice;
    notice=document.createElement('div');
    notice.id='quranOfflineNotice';
    notice.className='quran-offline-notice hidden';
    notice.textContent='Tanpa internet • halaman yang tersimpan tetap tersedia';
    document.body.appendChild(notice);
    return notice;
  }
  async function syncOfflineNotice(){
    const notice=ensureOfflineNotice();
    notice.classList.toggle('hidden',navigator.onLine);
    if(navigator.onLine)return;
    const offline=window.AmaliyahQuranOffline;
    if(offline){
      const status=offline.state;
      notice.textContent=status.complete
        ? 'Tanpa internet • Al-Qur’an lengkap tersedia'
        : `Tanpa internet • ${status.count||0} halaman tersimpan`;
    }else{
      notice.textContent='Tanpa internet • halaman tersimpan tetap tersedia';
    }
  }
  window.addEventListener('online',syncOfflineNotice);
  window.addEventListener('offline',syncOfflineNotice);
  window.addEventListener('amaliyah:quran-offline-status',syncOfflineNotice);
  syncOfflineNotice();

  const clampPage=value=>Math.min(total,Math.max(1,Number(value)||1));
  const pad=value=>String(value).padStart(Number(config.pageDigits)||3,'0');
  const pageUrl=page=>`${config.pageBase||''}${config.pagePrefix||'page'}${pad(page)}${config.pageExtension||'.png'}`;
  const storedLastPage=()=>clampPage(store.getItem('amaliyah:quran:last-page')||1);
  const bookmarks=()=>{try{const data=JSON.parse(store.getItem('amaliyah:quran:bookmarks')||'[]');return Array.isArray(data)?data.map(Number).filter(x=>x>=1&&x<=total):[]}catch{return []}};
  const pageMetadata=()=>{try{return JSON.parse(store.getItem('amaliyah:quran:page-meta')||'{}')||{}}catch{return {}}};
  const nearestSurah=page=>[...surahs].reverse().find(item=>item[3]<=page)||surahs[0];
  const approximateJuz=page=>Math.max(1,juzPages.findIndex((start,index)=>page>=start&&(index===29||page<juzPages[index+1]))+1);
  const fallbackMeta=page=>{const surah=nearestSurah(page);return {surah:surah[1],juz:approximateJuz(page)};};
  const progressPercent=page=>Math.min(100,Math.max(0,(clampPage(page)/total)*100));

  function updateIntro(){
    const page=storedLastPage();
    const hasProgress=store.getItem('amaliyah:quran:last-page')!==null;
    let meta={};try{meta=JSON.parse(store.getItem('amaliyah:quran:last-meta')||'{}')||{}}catch{}
    const safeMeta={...fallbackMeta(page),...meta};
    const detail=[safeMeta.surah?`Surah ${safeMeta.surah}`:'',safeMeta.juz?`Juz ${safeMeta.juz}`:''].filter(Boolean).join(' • ');
    const percent=Math.round(progressPercent(page));
    $('#lastReadSummary').textContent=hasProgress?`Terakhir: halaman ${page} • ${detail} • ${percent}%`:`${total} halaman • Tampilan halaman mushaf`;
    $('#quranProgressText').textContent=hasProgress?`${page} / ${total} halaman`:`0 / ${total} halaman`;
    $('#quranProgressPercent').textContent=hasProgress?`${percent}%`:'0%';
    $('#quranDirectoryProgress').style.width=`${hasProgress?progressPercent(page):0}%`;
    $('#continueQuran').firstChild.textContent=hasProgress?'Lanjutkan ':'Mulai Membaca ';
  }

  function directoryItem(number,title,subtitle,trailing,page,{kind='surah',last=false}={}){
    const trail=kind==='surah'?`<span class="directory-arabic">${trailing}</span>`:`<span class="directory-arrow">›</span>`;
    return `<button class="directory-item directory-item-${kind}${last?' is-last-read':''}" type="button" data-open-page="${page}"><span class="directory-number">${number}</span><span class="directory-copy">${last?'<em>TERAKHIR DIBACA</em>':''}<b>${title}</b><small>${subtitle}</small></span>${trail}</button>`;
  }

  function renderDirectory(){
    const list=$('#quranDirectoryList');
    const search=String($('#quranSearch')?.value||'').trim().toLocaleLowerCase('id-ID');
    $('#quranSearchWrap').classList.toggle('hidden',activeTab!=='surah');
    let html='';
    const lastPage=storedLastPage();
    const hasProgress=store.getItem('amaliyah:quran:last-page')!==null;
    if(activeTab==='surah'){
      html=surahs.filter(item=>!search||String(item[0])===search||item[1].toLocaleLowerCase('id-ID').includes(search)||item[2].includes(search)).map(item=>{const place=madaniyah.has(item[0])?'Madaniyah':'Makkiyah';const last=hasProgress&&nearestSurah(lastPage)[0]===item[0];const suffix=last?` • Terakhir hal. ${lastPage}`:'';return directoryItem(item[0],item[1],`${place} • ${ayahCounts[item[0]-1]} ayat • Hal. ${item[3]}${suffix}`,item[2],item[3],{kind:'surah',last});}).join('');
    }else if(activeTab==='juz'){
      html=juzPages.map((page,index)=>directoryItem(index+1,`Juz ${index+1}`,`Mulai halaman ${page}${hasProgress&&approximateJuz(lastPage)===index+1?` • Terakhir hal. ${lastPage}`:''}`,'›',page,{kind:'juz',last:hasProgress&&approximateJuz(lastPage)===index+1})).join('');
    }else if(activeTab==='page'){
      const percent=Math.round(progressPercent(lastPage));
      html=`<div class="directory-page-jump"><div class="page-jump-icon">604</div><div class="page-jump-copy"><b>Langsung ke halaman</b><p>Masukkan nomor halaman 1–${total}. Terakhir dibaca: ${hasProgress?`halaman ${lastPage} (${percent}%)`:'belum ada'}.</p></div><div class="page-jump-form"><input id="directoryPageInput" type="number" min="1" max="${total}" inputmode="numeric" value="${hasProgress?lastPage:1}" aria-label="Nomor halaman"><button id="directoryPageOpen" type="button">Buka Halaman</button></div></div>`;
    }else{
      const meta=pageMetadata(); const pages=bookmarks().sort((a,b)=>a-b);
      html=pages.map(page=>{const info=meta[page]||{};const detail=[info.surah?`Surah ${info.surah}`:'',info.juz?`Juz ${info.juz}`:''].filter(Boolean).join(' • ')||'Mushaf Madinah';return directoryItem('۞',`Halaman ${page}`,detail,'›',page,{kind:'bookmark'});}).join('');
      if(!pages.length)html='<div class="directory-empty"><span>۞</span><b>Belum ada penanda</b><p>Saat membaca, tekan ikon penanda di kanan atas.</p></div>';
    }
    list.innerHTML=html||'<div class="directory-empty"><b>Surah tidak ditemukan</b><p>Coba nama atau nomor yang berbeda.</p></div>';
    list.querySelectorAll('[data-open-page]').forEach(button=>button.onclick=()=>openReader(button.dataset.openPage));
    $('#directoryPageOpen')?.addEventListener('click',()=>openReader($('#directoryPageInput').value));
    $('#directoryPageInput')?.addEventListener('keydown',event=>{if(event.key==='Enter')openReader(event.currentTarget.value);});
  }

  function setActiveTab(tab){activeTab=['surah','juz','page','bookmarks'].includes(tab)?tab:'surah';$$('[data-quran-tab]').forEach(button=>button.classList.toggle('active',button.dataset.quranTab===activeTab));renderDirectory();}
  function showControls(autoHide=true){$('#quranReader').classList.remove('controls-hidden');clearTimeout(controlsTimer);if(autoHide)controlsTimer=setTimeout(()=>$('#quranReader').classList.add('controls-hidden'),3200);}
  function updateBookmarkButton(){const marked=bookmarks().includes(currentPage);$('#toggleQuranBookmark').classList.toggle('marked',marked);$('#toggleQuranBookmark').setAttribute('aria-label',marked?'Hapus penanda halaman':'Tandai halaman');}
  function applyReaderMeta(info,page){const surah=info.surah||nearestSurah(page)[1];const juz=info.juz||approximateJuz(page);$('#readerSurah').textContent=`Surah ${surah}`;$('#readerMeta').textContent=`Juz ${juz} • Halaman ${page}`;$('#immersiveSurah').textContent=`Surah ${surah}`;$('#immersiveJuz').textContent=`Juz ${juz}`;$('#immersivePage').textContent=`Halaman ${page}`;}
  function commitLastRead(page=currentPage){const committed=clampPage(page);const info={...fallbackMeta(committed),...(pageMetadata()[committed]||{})};store.setItem('amaliyah:quran:last-page',String(committed));store.setItem('amaliyah:quran:last-meta',JSON.stringify(info));store.setItem('amaliyah:quran:last-seen-at',String(Date.now()));}

  async function loadMetadata(page){
    const fallback=nearestSurah(page);let info={surah:fallback[1],juz:approximateJuz(page)};applyReaderMeta(info,page);
    try{const response=await fetch(`${config.metadataApi}/page/${page}/quran-uthmani`);if(response.ok){const body=await response.json();const ayah=body?.data?.ayahs?.[0];if(ayah)info={surah:ayah.surah?.englishName||fallback[1],juz:ayah.juz||approximateJuz(page)};}}catch{}
    if(page!==currentPage)return;applyReaderMeta(info,page);const all=pageMetadata();all[page]=info;store.setItem('amaliyah:quran:page-meta',JSON.stringify(all));if(Number(store.getItem('amaliyah:quran:last-page'))===page)store.setItem('amaliyah:quran:last-meta',JSON.stringify(info));
  }

  function prefetch(page){[page-1,page+1].filter(x=>x>=1&&x<=total).forEach(x=>{const image=new Image();image.src=pageUrl(x)});}
  function loadPage(value,{replaceUrl=true,recordLast=true,preserveImmersive=true}={}){
    const reader=$('#quranReader');
    const wasImmersive=preserveImmersive&&reader.classList.contains('controls-hidden');
    currentPage=clampPage(value);const image=$('#quranPageImage');image.classList.remove('loaded');$('#quranLoading').classList.remove('hidden');$('#quranImageError').classList.add('hidden');
    image.onload=()=>{image.classList.add('loaded');$('#quranLoading').classList.add('hidden');$('#quranImageError').classList.add('hidden');prefetch(currentPage)};image.onerror=()=>{$('#quranLoading').classList.add('hidden');const box=$('#quranImageError');box.classList.remove('hidden');const title=box.querySelector('b');const text=box.querySelector('p');if(!navigator.onLine){if(title)title.textContent='Halaman belum tersimpan di perangkat';if(text)text.textContent="Halaman ini belum tersimpan di perangkat. Sambungkan internet untuk membukanya pertama kali.";}else{if(title)title.textContent='Halaman belum dapat dimuat';if(text)text.textContent='Periksa koneksi internet lalu coba kembali.';}};image.src=pageUrl(currentPage);image.alt=`Halaman ${currentPage} Mushaf Al-Qur'an`;
    $('#pageCounter b').textContent=`${currentPage} / ${total}`;$('#previousQuranPage').disabled=currentPage<=1;$('#nextQuranPage').disabled=currentPage>=total;if(recordLast||readerOpen)commitLastRead(currentPage);if(replaceUrl&&readerOpen)history.replaceState({quranReader:true,page:currentPage},'',`quran.html?page=${currentPage}`);updateBookmarkButton();loadMetadata(currentPage);
    if(wasImmersive){clearTimeout(controlsTimer);reader.classList.add('controls-hidden');}else showControls();
  }

  function showReaderUi(){readerOpen=true;$('#quranDirectory').classList.add('hidden');$('#quranReader').classList.remove('hidden');document.documentElement.style.overflow='hidden';}
  function showDirectoryUi(){readerOpen=false;clearTimeout(controlsTimer);$('#quranReader').classList.add('hidden');$('#quranDirectory').classList.remove('hidden');document.documentElement.style.overflow='';updateIntro();renderDirectory();}
  function openReader(page=storedLastPage()){showReaderUi();history.pushState({quranReader:true,page:clampPage(page)},'',`quran.html?page=${clampPage(page)}`);loadPage(page,{replaceUrl:true,recordLast:false});}
  function closeReader(){if(!readerOpen)return;commitLastRead(currentPage);if(history.state?.quranReader)history.back();else{showDirectoryUi();history.replaceState({quranDirectory:true},'',`quran.html`);}}
  function toggleBookmark(){const set=new Set(bookmarks());set.has(currentPage)?set.delete(currentPage):set.add(currentPage);store.setItem('amaliyah:quran:bookmarks',JSON.stringify([...set].sort((a,b)=>a-b)));updateBookmarkButton();showControls();}

  function applyNightMode(){const enabled=store.getItem('amaliyah:quran:night-mode')==='1';$('#quranReader').classList.toggle('night-mode',enabled);$('#toggleNightMode').classList.toggle('active',enabled);$('#toggleNightMode').setAttribute('aria-label',enabled?'Matikan mode malam':'Aktifkan mode malam');}
  function toggleNightMode(){store.setItem('amaliyah:quran:night-mode',store.getItem('amaliyah:quran:night-mode')==='1'?'0':'1');applyNightMode();showControls(false);}

  function populateQuickNavigator(){$('#pickerSurahSelect').innerHTML=surahs.map(item=>`<option value="${item[3]}">${item[0]}. ${item[1]} — ${item[2]}</option>`).join('');$('#pickerJuzSelect').innerHTML=juzPages.map((page,index)=>`<option value="${page}">Juz ${index+1} — halaman ${page}</option>`).join('');}
  function setPickerTab(tab='page'){$$('[data-picker-tab]').forEach(button=>button.classList.toggle('active',button.dataset.pickerTab===tab));$$('[data-picker-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.pickerPanel!==tab));}
  function openQuickNavigator(tab='page'){const dialog=$('#pagePicker');const page=readerOpen?currentPage:storedLastPage();$('#pagePickerInput').value=page;$('#pickerSurahSelect').value=String(nearestSurah(page)[3]);$('#pickerJuzSelect').value=String(juzPages[approximateJuz(page)-1]);setPickerTab(tab);if(!dialog.open)dialog.showModal();if(tab==='page')setTimeout(()=>$('#pagePickerInput').select(),30);}
  function jumpFromPicker(page){$('#pagePicker').close();if(readerOpen)loadPage(page,{recordLast:false});else openReader(page);}

  function boot(){
    populateQuickNavigator();applyNightMode();updateIntro();renderDirectory();const requested=new URLSearchParams(location.search).get('page');history.replaceState({quranDirectory:true},'',`quran.html`);if(requested)openReader(requested);
    $('#quranHomeBack').onclick=()=>location.href='index.html';$('#continueQuran').onclick=()=>openReader(storedLastPage());$$('[data-quran-tab]').forEach(button=>button.onclick=()=>setActiveTab(button.dataset.quranTab));$('#quranSearch').oninput=renderDirectory;$('#closeReader').onclick=closeReader;
    $('#previousQuranPage').onclick=()=>loadPage(currentPage-1);$('#nextQuranPage').onclick=()=>loadPage(currentPage+1);$('#pageTapPrev').onclick=()=>loadPage(currentPage+1);$('#pageTapNext').onclick=()=>loadPage(currentPage-1);$('#toggleQuranBookmark').onclick=toggleBookmark;$('#toggleNightMode').onclick=toggleNightMode;$('#retryQuranPage').onclick=()=>loadPage(currentPage,{replaceUrl:false});$('#pageCounter').onclick=()=>openQuickNavigator('page');$$('[data-picker-tab]').forEach(button=>button.onclick=()=>setPickerTab(button.dataset.pickerTab));$('#confirmPagePicker').onclick=()=>jumpFromPicker($('#pagePickerInput').value);$('#confirmSurahPicker').onclick=()=>jumpFromPicker($('#pickerSurahSelect').value);$('#confirmJuzPicker').onclick=()=>jumpFromPicker($('#pickerJuzSelect').value);
    $('#quranStage').addEventListener('click',event=>{if(event.target.id==='quranStage'||event.target.id==='quranPageShell'||event.target.id==='quranPageImage'){$('#quranReader').classList.contains('controls-hidden')?showControls():$('#quranReader').classList.add('controls-hidden')}});
    $('#quranStage').addEventListener('touchstart',event=>{touchStartX=event.changedTouches[0].clientX;touchStartY=event.changedTouches[0].clientY},{passive:true});$('#quranStage').addEventListener('touchend',event=>{const dx=event.changedTouches[0].clientX-touchStartX;const dy=event.changedTouches[0].clientY-touchStartY;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4)loadPage(currentPage+(dx>0?1:-1));},{passive:true});
    window.addEventListener('popstate',event=>{if(event.state?.quranReader){showReaderUi();loadPage(event.state.page||storedLastPage(),{replaceUrl:false});}else{if(readerOpen)commitLastRead(currentPage);showDirectoryUi();}});
    window.addEventListener('pagehide',()=>{if(readerOpen)commitLastRead(currentPage);});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&readerOpen)commitLastRead(currentPage);});
    document.addEventListener('keydown',event=>{if(!readerOpen)return;if(event.key==='ArrowRight')loadPage(currentPage+1);if(event.key==='ArrowLeft')loadPage(currentPage-1);if(event.key==='Escape')closeReader();});
  }
  boot();
})();
