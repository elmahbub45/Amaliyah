(()=>{
  'use strict';

  const CACHE_NAME='amaliyah-quran-pages-v1';
  const EVENT_NAME='amaliyah:quran-offline-status';
  const config=window.AMALIYAH_QURAN_CONFIG||{};
  const total=Number(config.totalPages)||604;
  const pageDigits=Number(config.pageDigits)||3;
  let running=false;
  let cancelRequested=false;
  let clearConfirmUntil=0;
  let state={count:0,total,complete:false,running:false,error:'',cancelled:false};

  const pad=value=>String(value).padStart(pageDigits,'0');
  const pageUrl=page=>`${config.pageBase||''}${config.pagePrefix||'page'}${pad(page)}${config.pageExtension||'.png'}`;
  const makeRequest=page=>new Request(pageUrl(page),{method:'GET',mode:'no-cors',cache:'no-store',credentials:'omit'});

  function dispatch(){
    window.dispatchEvent(new CustomEvent(EVENT_NAME,{detail:{...state}}));
    renderAll();
  }

  function setState(next){
    state={...state,...next,total};
    state.count=Math.max(0,Math.min(total,Number(state.count)||0));
    state.complete=state.count>=total && !state.error;
    dispatch();
    return {...state};
  }

  function matchingPageNumber(url){
    try{
      const base=String(config.pageBase||'');
      if(!base||!String(url).startsWith(base))return null;
      const name=new URL(url).pathname.split('/').pop()||'';
      const prefix=String(config.pagePrefix||'page').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const ext=String(config.pageExtension||'.png').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const match=name.match(new RegExp(`^${prefix}(\\d{${pageDigits}})${ext}$`));
      if(!match)return null;
      const n=Number(match[1]);
      return n>=1&&n<=total?n:null;
    }catch{return null}
  }

  async function scan(){
    if(!('caches' in window))return setState({count:0,complete:false,error:'Penyimpanan tanpa internet tidak tersedia di perangkat ini.'});
    try{
      const cache=await caches.open(CACHE_NAME);
      const keys=await cache.keys();
      const pages=new Set(keys.map(key=>matchingPageNumber(key.url)).filter(Boolean));
      return setState({count:pages.size,complete:pages.size>=total,error:'',cancelled:false});
    }catch(error){
      return setState({error:'Status penyimpanan Al-Qur’an belum dapat diperiksa.'});
    }
  }

  async function fetchAndStore(cache,page){
    const request=makeRequest(page);
    const existing=await cache.match(request);
    if(existing)return true;

    let lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      if(cancelRequested)return false;
      try{
        const response=await fetch(request);
        if(!response || !(response.ok||response.type==='opaque'))throw new Error('Unduhan halaman gagal');
        await cache.put(request,response.clone());
        return true;
      }catch(error){
        lastError=error;
        if(attempt===0)await new Promise(resolve=>setTimeout(resolve,350));
      }
    }
    throw lastError||new Error('Unduhan halaman gagal');
  }

  async function downloadAll(){
    if(running){
      cancelRequested=true;
      return {...state};
    }
    if(!navigator.onLine){
      return setState({error:'Sambungkan internet untuk mengunduh Al-Qur’an.',cancelled:false});
    }
    if(!('caches' in window)){
      return setState({error:'Penyimpanan tanpa internet tidak tersedia di perangkat ini.'});
    }

    running=true;
    cancelRequested=false;
    setState({running:true,error:'',cancelled:false});
    if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});

    try{
      const cache=await caches.open(CACHE_NAME);
      const keys=await cache.keys();
      const available=new Set(keys.map(key=>matchingPageNumber(key.url)).filter(Boolean));
      let completed=available.size;
      let cursor=1;
      const failed=[];
      setState({count:completed,running:true,error:''});

      const worker=async()=>{
        while(!cancelRequested){
          let page=null;
          while(cursor<=total){
            const candidate=cursor++;
            if(!available.has(candidate)){page=candidate;break;}
          }
          if(page===null)return;
          try{
            const saved=await fetchAndStore(cache,page);
            if(!saved && cancelRequested)return;
            if(saved){available.add(page);completed++;setState({count:completed,running:true,error:''});}
          }catch{failed.push(page);}
        }
      };

      await Promise.all([worker(),worker(),worker()]);

      if(cancelRequested){
        running=false;
        return setState({count:completed,running:false,cancelled:true,error:''});
      }

      running=false;
      if(failed.length){
        return setState({count:completed,running:false,error:`${failed.length} halaman belum berhasil diunduh. Tekan Lanjutkan Unduhan untuk mencoba lagi.`,cancelled:false});
      }
      return setState({count:completed,running:false,complete:completed>=total,error:'',cancelled:false});
    }catch(error){
      running=false;
      return setState({running:false,error:'Unduhan terhenti. Periksa koneksi lalu lanjutkan kembali.',cancelled:false});
    }
  }

  async function clearAll(){
    if(running){cancelRequested=true;return {...state};}
    try{
      await caches.delete(CACHE_NAME);
      return setState({count:0,complete:false,running:false,error:'',cancelled:false});
    }catch{
      return setState({error:'Data Al-Qur’an yang tersimpan belum dapat dihapus.'});
    }
  }

  async function isPageAvailable(page){
    if(!('caches' in window))return false;
    try{
      const cache=await caches.open(CACHE_NAME);
      return !!(await cache.match(makeRequest(page)));
    }catch{return false}
  }

  function statusText(s){
    if(s.running)return `Mengunduh Al-Qur’an… ${s.count} dari ${s.total} halaman.`;
    if(s.complete)return 'Al-Qur’an lengkap dan siap dibaca tanpa internet.';
    if(s.error)return s.error;
    if(!navigator.onLine && s.count>0)return `${s.count} halaman sudah tersimpan. Sambungkan internet untuk melengkapinya.`;
    if(!navigator.onLine)return 'Belum ada halaman yang tersimpan lengkap. Sambungkan internet untuk mengunduh.';
    if(s.count>0)return `${s.count} dari ${s.total} halaman sudah tersimpan. Unduhan dapat dilanjutkan kapan saja.`;
    return 'Unduh 604 halaman mushaf sekali saat internet aktif agar Al-Qur’an dapat dibaca tanpa internet.';
  }

  function renderContainer(box){
    const count=box.querySelector('[data-quran-offline-count]');
    const percent=box.querySelector('[data-quran-offline-percent]');
    const bar=box.querySelector('[data-quran-offline-progress]');
    const status=box.querySelector('[data-quran-offline-status]');
    const download=box.querySelector('[data-quran-offline-download]');
    const clear=box.querySelector('[data-quran-offline-clear]');
    const pct=Math.round((state.count/total)*100);

    if(count)count.textContent=`${state.count} / ${total} halaman`;
    if(percent)percent.textContent=`${pct}%`;
    if(bar)bar.style.width=`${pct}%`;
    if(status)status.textContent=statusText(state);

    if(download){
      download.disabled=!navigator.onLine && !state.running;
      download.textContent=state.running
        ? 'Batalkan Unduhan'
        : state.complete
          ? 'Siap Tanpa Internet ✓'
          : state.count>0
            ? 'Lanjutkan Unduhan'
            : 'Unduh Al-Qur’an';
      download.classList.toggle('is-complete',state.complete);
    }
    if(clear){
      clear.hidden=state.count<=0 && !state.complete;
      if(Date.now()>clearConfirmUntil)clear.textContent='Hapus Data Tersimpan';
    }
    box.classList.toggle('is-complete',state.complete);
    box.classList.toggle('is-downloading',state.running);
  }

  function renderAll(){
    document.querySelectorAll('[data-quran-offline-ui]').forEach(renderContainer);
  }

  function bindUi(){
    document.querySelectorAll('[data-quran-offline-download]').forEach(button=>{
      if(button.dataset.boundOffline==='1')return;
      button.dataset.boundOffline='1';
      button.addEventListener('click',()=>downloadAll());
    });
    document.querySelectorAll('[data-quran-offline-clear]').forEach(button=>{
      if(button.dataset.boundOffline==='1')return;
      button.dataset.boundOffline='1';
      button.addEventListener('click',async()=>{
        const now=Date.now();
        if(now>clearConfirmUntil){
          clearConfirmUntil=now+4500;
          document.querySelectorAll('[data-quran-offline-clear]').forEach(btn=>{btn.textContent='Tekan lagi untuk hapus';});
          setTimeout(()=>{if(Date.now()>clearConfirmUntil)renderAll();},4700);
          return;
        }
        clearConfirmUntil=0;
        await clearAll();
      });
    });
    renderAll();
  }

  window.addEventListener('online',()=>{setState({error:''});scan();});
  window.addEventListener('offline',renderAll);

  window.AmaliyahQuranOffline={
    cacheName:CACHE_NAME,
    get state(){return {...state}},
    scan,
    downloadAll,
    clearAll,
    isPageAvailable,
    render:renderAll
  };

  bindUi();
  scan();
})();
