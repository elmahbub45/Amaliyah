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
  let currentPage=1;
  let activeTab='surah';
  let controlsTimer=0;
  let touchStartX=0;
  let touchStartY=0;
  let readerOpen=false;
  let readingCommitTimer=0;

  const clampPage=value=>Math.min(total,Math.max(1,Number(value)||1));
  const pad=value=>String(value).padStart(Number(config.pageDigits)||3,'0');
  const pageUrl=page=>`${config.pageBase||''}${config.pagePrefix||'page'}${pad(page)}${config.pageExtension||'.png'}`;
  const storedLastPage=()=>clampPage(store.getItem('amaliyah:quran:last-page')||1);
  const bookmarks=()=>{try{const data=JSON.parse(store.getItem('amaliyah:quran:bookmarks')||'[]');return Array.isArray(data)?data.map(Number).filter(x=>x>=1&&x<=total):[]}catch{return []}};
  const pageMetadata=()=>{try{return JSON.parse(store.getItem('amaliyah:quran:page-meta')||'{}')||{}}catch{return {}}};
  const nearestSurah=page=>[...surahs].reverse().find(item=>item[3]<=page)||surahs[0];
  const approximateJuz=page=>Math.max(1,juzPages.findIndex((start,index)=>page>=start&&(index===29||page<juzPages[index+1]))+1);

  function updateIntro(){
    const page=storedLastPage();
    const hasProgress=store.getItem('amaliyah:quran:last-page')!==null;
    let meta={};try{meta=JSON.parse(store.getItem('amaliyah:quran:last-meta')||'{}')||{}}catch{}
    const detail=[meta.surah?`Surah ${meta.surah}`:'',meta.juz?`Juz ${meta.juz}`:''].filter(Boolean).join(' • ');
    $('#lastReadSummary').textContent=hasProgress?`Terakhir halaman ${page} dari ${total}${detail?' • '+detail:''}`:`${total} halaman • Tampilan halaman mushaf`;
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
      html=surahs.filter(item=>!search||String(item[0])===search||item[1].toLocaleLowerCase('id-ID').includes(search)||item[2].includes(search)).map(item=>directoryItem(item[0],item[1],`Mulai halaman ${item[3]} • Mushaf Madinah`,item[2],item[3],{kind:'surah',last:hasProgress&&nearestSurah(lastPage)[0]===item[0]})).join('');
    }else if(activeTab==='juz'){
      html=juzPages.map((page,index)=>directoryItem(index+1,`Juz ${index+1}`,`Mulai halaman ${page}`,'›',page,{kind:'juz',last:hasProgress&&approximateJuz(lastPage)===index+1})).join('');
    }else{
      const meta=pageMetadata(); const pages=bookmarks().sort((a,b)=>a-b);
      html=pages.map(page=>{const info=meta[page]||{};const detail=[info.surah?`Surah ${info.surah}`:'',info.juz?`Juz ${info.juz}`:''].filter(Boolean).join(' • ')||'Mushaf Madinah';return directoryItem('۞',`Halaman ${page}`,detail,'›',page,{kind:'bookmark'});}).join('');
      if(!pages.length)html='<div class="directory-empty"><span>۞</span><b>Belum ada penanda</b><p>Saat membaca, tekan ikon penanda di kanan atas.</p></div>';
    }
    list.innerHTML=html||'<div class="directory-empty"><b>Surah tidak ditemukan</b><p>Coba nama atau nomor yang berbeda.</p></div>';
    list.querySelectorAll('[data-open-page]').forEach(button=>button.onclick=()=>openReader(button.dataset.openPage));
  }

  function setActiveTab(tab){activeTab=['surah','juz','bookmarks'].includes(tab)?tab:'surah';$$('[data-quran-tab]').forEach(button=>button.classList.toggle('active',button.dataset.quranTab===activeTab));renderDirectory();}
  function showControls(autoHide=true){$('#quranReader').classList.remove('controls-hidden');clearTimeout(controlsTimer);if(autoHide)controlsTimer=setTimeout(()=>$('#quranReader').classList.add('controls-hidden'),3200);}
  function updateBookmarkButton(){const marked=bookmarks().includes(currentPage);$('#toggleQuranBookmark').classList.toggle('marked',marked);$('#toggleQuranBookmark').setAttribute('aria-label',marked?'Hapus penanda halaman':'Tandai halaman');}
  function applyReaderMeta(info,page){const surah=info.surah||nearestSurah(page)[1];const juz=info.juz||approximateJuz(page);$('#readerSurah').textContent=`Surah ${surah}`;$('#readerMeta').textContent=`Juz ${juz} • Halaman ${page}`;$('#immersiveSurah').textContent=`Surah ${surah}`;$('#immersiveJuz').textContent=`Juz ${juz}`;$('#immersivePage').textContent=`Halaman ${page}`;}
  function commitLastRead(page=currentPage){const committed=clampPage(page);store.setItem('amaliyah:quran:last-page',String(committed));const info=pageMetadata()[committed];if(info)store.setItem('amaliyah:quran:last-meta',JSON.stringify(info));}
  function scheduleLastReadCommit(page=currentPage){clearTimeout(readingCommitTimer);readingCommitTimer=setTimeout(()=>{if(readerOpen&&currentPage===clampPage(page))commitLastRead(page);},7000);}

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
    image.onload=()=>{image.classList.add('loaded');$('#quranLoading').classList.add('hidden');prefetch(currentPage)};image.onerror=()=>{$('#quranLoading').classList.add('hidden');$('#quranImageError').classList.remove('hidden')};image.src=pageUrl(currentPage);image.alt=`Halaman ${currentPage} Mushaf Al-Qur'an`;
    $('#pageCounter b').textContent=`${currentPage} / ${total}`;$('#previousQuranPage').disabled=currentPage<=1;$('#nextQuranPage').disabled=currentPage>=total;clearTimeout(readingCommitTimer);if(recordLast)commitLastRead(currentPage);else scheduleLastReadCommit(currentPage);if(replaceUrl&&readerOpen)history.replaceState({quranReader:true,page:currentPage},'',`quran.html?page=${currentPage}`);updateBookmarkButton();loadMetadata(currentPage);
    if(wasImmersive){clearTimeout(controlsTimer);reader.classList.add('controls-hidden');}else showControls();
  }

  function showReaderUi(){readerOpen=true;$('#quranDirectory').classList.add('hidden');$('#quranReader').classList.remove('hidden');document.documentElement.style.overflow='hidden';}
  function showDirectoryUi(){readerOpen=false;clearTimeout(controlsTimer);clearTimeout(readingCommitTimer);$('#quranReader').classList.add('hidden');$('#quranDirectory').classList.remove('hidden');document.documentElement.style.overflow='';updateIntro();renderDirectory();}
  function openReader(page=storedLastPage()){showReaderUi();history.pushState({quranReader:true,page:clampPage(page)},'',`quran.html?page=${clampPage(page)}`);loadPage(page,{replaceUrl:true,recordLast:false});}
  function closeReader(){if(!readerOpen)return;if(history.state?.quranReader)history.back();else{showDirectoryUi();history.replaceState({quranDirectory:true},'',`quran.html`);}}
  function toggleBookmark(){const set=new Set(bookmarks());set.has(currentPage)?set.delete(currentPage):set.add(currentPage);store.setItem('amaliyah:quran:bookmarks',JSON.stringify([...set].sort((a,b)=>a-b)));updateBookmarkButton();showControls();}

  function populateQuickNavigator(){$('#pickerSurahSelect').innerHTML=surahs.map(item=>`<option value="${item[3]}">${item[0]}. ${item[1]} — ${item[2]}</option>`).join('');$('#pickerJuzSelect').innerHTML=juzPages.map((page,index)=>`<option value="${page}">Juz ${index+1} — halaman ${page}</option>`).join('');}
  function setPickerTab(tab='page'){$$('[data-picker-tab]').forEach(button=>button.classList.toggle('active',button.dataset.pickerTab===tab));$$('[data-picker-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.pickerPanel!==tab));}
  function openQuickNavigator(tab='page'){const dialog=$('#pagePicker');const page=readerOpen?currentPage:storedLastPage();$('#pagePickerInput').value=page;$('#pickerSurahSelect').value=String(nearestSurah(page)[3]);$('#pickerJuzSelect').value=String(juzPages[approximateJuz(page)-1]);setPickerTab(tab);if(!dialog.open)dialog.showModal();if(tab==='page')setTimeout(()=>$('#pagePickerInput').select(),30);}
  function jumpFromPicker(page){$('#pagePicker').close();if(readerOpen)loadPage(page,{recordLast:false});else openReader(page);}

  function boot(){
    populateQuickNavigator();updateIntro();renderDirectory();const requested=new URLSearchParams(location.search).get('page');history.replaceState({quranDirectory:true},'',`quran.html`);if(requested)openReader(requested);
    $('#quranHomeBack').onclick=()=>location.href='index.html';$('#continueQuran').onclick=()=>openReader(storedLastPage());$$('[data-quran-tab]').forEach(button=>button.onclick=()=>setActiveTab(button.dataset.quranTab));$('#quranSearch').oninput=renderDirectory;$('#closeReader').onclick=closeReader;
    $('#previousQuranPage').onclick=()=>loadPage(currentPage-1);$('#nextQuranPage').onclick=()=>loadPage(currentPage+1);$('#pageTapPrev').onclick=()=>loadPage(currentPage+1);$('#pageTapNext').onclick=()=>loadPage(currentPage-1);$('#toggleQuranBookmark').onclick=toggleBookmark;$('#retryQuranPage').onclick=()=>loadPage(currentPage,{replaceUrl:false,recordLast:false});$('#pageCounter').onclick=()=>openQuickNavigator('page');$$('[data-picker-tab]').forEach(button=>button.onclick=()=>setPickerTab(button.dataset.pickerTab));$('#confirmPagePicker').onclick=()=>jumpFromPicker($('#pagePickerInput').value);$('#confirmSurahPicker').onclick=()=>jumpFromPicker($('#pickerSurahSelect').value);$('#confirmJuzPicker').onclick=()=>jumpFromPicker($('#pickerJuzSelect').value);
    $('#quranStage').addEventListener('click',event=>{if(event.target.id==='quranStage'||event.target.id==='quranPageShell'||event.target.id==='quranPageImage'){$('#quranReader').classList.contains('controls-hidden')?showControls():$('#quranReader').classList.add('controls-hidden')}});
    $('#quranStage').addEventListener('touchstart',event=>{touchStartX=event.changedTouches[0].clientX;touchStartY=event.changedTouches[0].clientY},{passive:true});$('#quranStage').addEventListener('touchend',event=>{const dx=event.changedTouches[0].clientX-touchStartX;const dy=event.changedTouches[0].clientY-touchStartY;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4)loadPage(currentPage+(dx>0?1:-1));},{passive:true});
    window.addEventListener('popstate',event=>{if(event.state?.quranReader){showReaderUi();loadPage(event.state.page||storedLastPage(),{replaceUrl:false,recordLast:false});}else showDirectoryUi();});
    document.addEventListener('keydown',event=>{if(!readerOpen)return;if(event.key==='ArrowRight')loadPage(currentPage+1);if(event.key==='ArrowLeft')loadPage(currentPage-1);if(event.key==='Escape')closeReader();});
  }
  boot();
})();
