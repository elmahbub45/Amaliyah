const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const clone=o=>JSON.parse(JSON.stringify(o));
const DRAFT_KEY='amaliyah:admin:draft:v32';
const BACKUP_KEY='amaliyah:admin:backups:v32';
const MAX_BACKUPS=10;
const VALID_TYPES=new Set(['single','collection','group']);

let original=null;
let data=null;
let selectedId=null;
let editingPartIndex=-1;
let dirty=false;
let mainDragIndex=null;
let partDragIndex=null;
let autosaveTimer=null;
let confirmResolver=null;

async function boot(){
  original=await fetchBooks();
  data=clone(original);

  const draft=readDraft();
  if(draft?.items){
    const use=await confirmInternal(
      'Draft belum diekspor ditemukan',
      'Ada draft Admin Koleksi yang tersimpan di browser ini.\n\nMuat draft tersebut agar perubahan sebelumnya tidak hilang?',
      'Muat Draft',
      'Gunakan Server'
    );
    if(use)data=draft;
  }

  bind();
  refreshCategoryUI();
  renderList();
  updateAllStatus(false,'books.json siap diedit');

  if(innerWidth>820 && data.items?.length){
    selectItem(data.items[0].id);
  }
}

async function fetchBooks(){
  const r=await fetch('./books.json',{cache:'no-store'});
  if(!r.ok)throw new Error('books.json gagal dimuat dari repository.');
  const parsed=await r.json();
  assertBooksShape(parsed);
  return parsed;
}

function assertBooksShape(parsed){
  if(!parsed || !Array.isArray(parsed.items)){
    throw new Error('Format books.json tidak valid: items[] tidak ditemukan.');
  }
}

function bind(){
  $('#searchInput').addEventListener('input',renderList);
  $('#categoryFilter').addEventListener('change',renderList);
  $('#typeFilter').addEventListener('change',renderList);

  $('#addItemBtn').onclick=openItemDialog;
  $('#createItemBtn').onclick=createItem;

  $('#deleteItemBtn').onclick=deleteItem;
  $('#previewBtn').onclick=()=>showItemPreview(getSelected());
  $('#closePreviewBtn').onclick=()=>$('#previewDialog').close();

  $('#titleInput').oninput=()=>patchSelected('title',$('#titleInput').value);
  $('#categoryInput').oninput=()=>patchSelected('category',$('#categoryInput').value);
  $('#typeInput').onchange=changeType;
  $('#iconInput').oninput=()=>patchSelected('icon',$('#iconInput').value);
  $('#coverTextInput').oninput=()=>patchSelected('coverText',$('#coverTextInput').value);

  $('#singleFileInput').oninput=()=>{
    patchSelected('file',$('#singleFileInput').value);
    updateSingleR2Key();
  };
  $('#singlePagesInput').oninput=()=>patchSelected(
    'pages',
    Math.max(1,Number($('#singlePagesInput').value)||1)
  );
  $('#singlePdfPicker').onchange=handleSinglePdfPicker;

  $('#addPartBtn').onclick=()=>openPartDialog();
  $('#savePartBtn').onclick=savePart;
  $('#partTitleInput').oninput=onPartTitleInput;
  $('#partIdInput').oninput=()=>$('#partIdInput').dataset.touched='1';
  $('#partFileInput').oninput=updatePartR2Key;
  $('#partPdfPicker').onchange=handlePartPdfPicker;

  $('#saveDraftBtn').onclick=()=>saveDraft('Draft disimpan manual');
  $('#backupBtn').onclick=openBackupDialog;
  $('#closeBackupBtn').onclick=()=>$('#backupDialog').close();

  $('#undoBtn').onclick=undoAll;
  $('#reloadBtn').onclick=reloadServer;
  $('#importBtn').onclick=()=>$('#importFile').click();
  $('#importFile').onchange=importJson;

  $('#validateBtn').onclick=()=>openValidationDialog(false);
  $('#exportBtn').onclick=()=>openValidationDialog(true);
  $('#closeValidationBtn').onclick=()=>$('#validationDialog').close();
  $('#validationCloseBtn').onclick=()=>$('#validationDialog').close();
  $('#confirmExportBtn').onclick=exportJson;

  $('#confirmCancelBtn').onclick=()=>resolveConfirm(false);
  $('#confirmOkBtn').onclick=()=>resolveConfirm(true);

  window.addEventListener('beforeunload',e=>{
    if(dirty){
      e.preventDefault();
      e.returnValue='';
    }
  });

  window.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){
      e.preventDefault();
      saveDraft('Draft disimpan dengan Ctrl+S');
    }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='e'){
      e.preventDefault();
      openValidationDialog(true);
    }
  });
}

/* ===================== BASIC HELPERS ===================== */
function esc(s=''){
  return String(s).replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function slugify(s=''){
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,70)||'bacaan-baru';
}

function r2Key(file=''){
  const s=String(file).trim().replace(/^\/+/,'');
  return s.startsWith('assets/pdf-v2/')
    ? s.slice('assets/pdf-v2/'.length)
    : s;
}

function categories(){
  const declared=(data.categories||[]).filter(x=>x && x!=='Semua');
  const used=(data.items||[]).map(x=>String(x.category||'').trim()).filter(Boolean);
  return [...new Set([...declared,...used])].sort((a,b)=>a.localeCompare(b,'id'));
}

function refreshCategoryUI(){
  const cats=categories();
  $('#categoryFilter').innerHTML=
    '<option value="">Semua kategori</option>'+
    cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');

  $('#categoryOptions').innerHTML=
    cats.map(c=>`<option value="${esc(c)}"></option>`).join('');
}

function uniqueItemId(base){
  let id=base,n=2;
  while(data.items.some(x=>x.id===id))id=`${base}-${n++}`;
  return id;
}

function allPartIds(){
  return new Set(
    data.items.flatMap(x=>
      x.type==='single' ? [] : (x.parts||[]).map(p=>p.id)
    )
  );
}

function uniquePartId(base){
  const ids=new Set([
    ...data.items.map(x=>x.id),
    ...allPartIds()
  ]);
  let id=base,n=2;
  while(ids.has(id))id=`${base}-${n++}`;
  return id;
}

function getSelected(){
  return data.items.find(x=>x.id===selectedId)||null;
}

function totalPdf(){
  return data.items.reduce(
    (n,x)=>n+(x.type==='single'?1:(x.parts||[]).length),
    0
  );
}

function syncCategoriesForExport(){
  const used=[...new Set(
    data.items.map(x=>String(x.category||'').trim()).filter(Boolean)
  )];
  data.categories=['Semua',...used];
}

function normalizeExport(){
  syncCategoriesForExport();
  return data;
}

/* ===================== STATUS / DRAFT / BACKUP ===================== */
function updateAllStatus(isDirty=dirty,msg=''){
  dirty=isDirty;

  const validation=validateAll();
  $('#dirtyDot').classList.toggle('dirty',dirty);
  $('#workspaceStatusDot').className=
    'status-dot '+(validation.errors.length?'error':dirty?'dirty':'ready');

  $('#statusText').textContent=
    msg||(dirty?'Ada perubahan yang belum di-download':'Tidak ada perubahan');

  $('#workspaceStatus').textContent=
    validation.errors.length
      ? `${validation.errors.length} error perlu diperbaiki`
      : dirty
        ? 'Perubahan belum diekspor'
        : 'Data siap';

  $('#metricItems').textContent=data.items.length;
  $('#metricPdf').textContent=totalPdf();
  $('#metricErrors').textContent=validation.errors.length;
  $('#metricWarnings').textContent=validation.warnings.length;
  $('#catalogInfo').textContent=`${data.items.length} bacaan • ${totalPdf()} PDF`;

  $('#confirmExportBtn').disabled=validation.errors.length>0;

  if(selectedId)renderItemValidation();
}

function markDirty(msg='Perubahan disimpan di editor'){
  dirty=true;
  scheduleAutosave();
  renderList();
  renderLivePreview();
  updateAllStatus(true,msg);
}

function scheduleAutosave(){
  clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(()=>{
    localStorage.setItem(DRAFT_KEY,JSON.stringify(data));
  },550);
}

function saveDraft(message='Draft disimpan'){
  localStorage.setItem(DRAFT_KEY,JSON.stringify(data));
  updateAllStatus(dirty,message);
  toast(message,'ok');
}

function readDraft(){
  try{
    const raw=localStorage.getItem(DRAFT_KEY);
    return raw?JSON.parse(raw):null;
  }catch{
    return null;
  }
}

function readBackups(){
  try{
    const raw=localStorage.getItem(BACKUP_KEY);
    const arr=raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr:[];
  }catch{
    return [];
  }
}

function writeBackups(arr){
  localStorage.setItem(BACKUP_KEY,JSON.stringify(arr.slice(0,MAX_BACKUPS)));
}

function createBackup(reason='Backup otomatis',snapshot=data){
  if(!snapshot?.items)return;
  const backups=readBackups();
  backups.unshift({
    id:`b-${Date.now()}-${Math.random().toString(16).slice(2,7)}`,
    at:new Date().toISOString(),
    reason,
    items:snapshot.items.length,
    pdf:snapshot.items.reduce((n,x)=>n+(x.type==='single'?1:(x.parts||[]).length),0),
    data:clone(snapshot)
  });
  writeBackups(backups);
}

function openBackupDialog(){
  renderBackups();
  $('#backupDialog').showModal();
}

function renderBackups(){
  const list=$('#backupList');
  const backups=readBackups();

  if(!backups.length){
    list.innerHTML='<div class="backup-empty">Belum ada backup lokal.</div>';
    return;
  }

  list.innerHTML=backups.map(b=>{
    const d=new Date(b.at);
    const stamp=d.toLocaleString('id-ID',{
      dateStyle:'medium',
      timeStyle:'short'
    });
    return `
      <div class="backup-row" data-backup="${esc(b.id)}">
        <div>
          <b>${esc(b.reason)}</b>
          <small>${esc(stamp)} • ${b.items} bacaan • ${b.pdf} PDF</small>
        </div>
        <div class="backup-actions">
          <button type="button" data-backup-download="${esc(b.id)}">Download</button>
          <button type="button" data-backup-restore="${esc(b.id)}">Pulihkan</button>
        </div>
      </div>
    `;
  }).join('');

  $$('[data-backup-download]',list).forEach(btn=>{
    btn.onclick=()=>{
      const b=backups.find(x=>x.id===btn.dataset.backupDownload);
      if(b)downloadJson(b.data,`books-backup-${safeDateStamp(new Date(b.at))}.json`);
    };
  });

  $$('[data-backup-restore]',list).forEach(btn=>{
    btn.onclick=async()=>{
      const b=backups.find(x=>x.id===btn.dataset.backupRestore);
      if(!b)return;

      const ok=await confirmInternal(
        'Pulihkan backup?',
        `Data editor saat ini akan diganti dengan backup:\n${b.reason}`,
        'Pulihkan',
        'Batal'
      );
      if(!ok)return;

      createBackup('Sebelum memulihkan backup');
      data=clone(b.data);
      selectedId=null;
      dirty=true;
      refreshCategoryUI();
      renderList();
      showEmptyEditor();
      updateAllStatus(true,'Backup dipulihkan');
      saveDraft('Backup dipulihkan ke draft');
      $('#backupDialog').close();
    };
  });
}

/* ===================== LIST / ORDER ===================== */
function renderList(){
  const q=$('#searchInput').value.trim().toLowerCase();
  const cat=$('#categoryFilter').value;
  const type=$('#typeFilter').value;

  const indexed=data.items.map((item,index)=>({item,index}));
  const arr=indexed.filter(({item:x})=>{
    const haystack=[
      x.title,x.id,x.category,x.type,x.coverText,
      ...(x.parts||[]).flatMap(p=>[p.title,p.id,p.file])
    ].join(' ').toLowerCase();

    return (!cat||x.category===cat) &&
      (!type||x.type===type) &&
      (!q||haystack.includes(q));
  });

  const list=$('#itemList');

  if(!arr.length){
    list.innerHTML='<div class="list-empty">Tidak ada bacaan yang cocok dengan filter.</div>';
    updateAllStatus(dirty);
    return;
  }

  list.innerHTML=arr.map(({item:x,index})=>{
    const count=x.type==='single'
      ? `${Math.max(1,Number(x.pages)||1)} hal.`
      : `${x.parts?.length||0} bagian`;

    return `
      <div class="item-card ${x.id===selectedId?'active':''}"
           draggable="true"
           data-id="${esc(x.id)}"
           data-main-index="${index}">
        <button class="main-drag-handle" type="button" title="Drag">☰</button>

        <button class="item-select" type="button" data-select-id="${esc(x.id)}">
          <span class="item-icon">${esc(x.icon||'◈')}</span>
          <span class="item-copy">
            <b>${esc(x.title||'(Tanpa judul)')}</b>
            <small>${esc(x.category||'Tanpa kategori')} • ${esc(x.type)}</small>
          </span>
          <span class="item-count">${esc(count)}</span>
        </button>

        <span class="main-order-actions">
          <button type="button" data-main-up="${index}" title="Naik">↑</button>
          <button type="button" data-main-down="${index}" title="Turun">↓</button>
        </span>
      </div>
    `;
  }).join('');

  $$('[data-select-id]',list).forEach(btn=>{
    btn.onclick=()=>selectItem(btn.dataset.selectId);
  });

  $$('.item-card',list).forEach(row=>{
    row.addEventListener('dragstart',e=>{
      mainDragIndex=Number(row.dataset.mainIndex);
      row.classList.add('dragging');
      try{e.dataTransfer.effectAllowed='move'}catch{}
    });

    row.addEventListener('dragend',()=>{
      mainDragIndex=null;
      row.classList.remove('dragging');
      $$('.drag-over',list).forEach(el=>el.classList.remove('drag-over'));
    });

    row.addEventListener('dragover',e=>{
      e.preventDefault();
      row.classList.add('drag-over');
    });

    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));

    row.addEventListener('drop',e=>{
      e.preventDefault();
      row.classList.remove('drag-over');
      const to=Number(row.dataset.mainIndex);
      if(mainDragIndex===null||mainDragIndex===to)return;
      moveMainItem(mainDragIndex,to);
    });
  });

  $$('[data-main-up]',list).forEach(btn=>{
    btn.onclick=e=>{
      e.stopPropagation();
      moveMainItem(Number(btn.dataset.mainUp),Number(btn.dataset.mainUp)-1);
    };
  });

  $$('[data-main-down]',list).forEach(btn=>{
    btn.onclick=e=>{
      e.stopPropagation();
      moveMainItem(Number(btn.dataset.mainDown),Number(btn.dataset.mainDown)+1);
    };
  });

  updateAllStatus(dirty);
}

function moveMainItem(from,to){
  if(from<0||to<0||from>=data.items.length||to>=data.items.length||from===to)return;

  const [item]=data.items.splice(from,1);
  data.items.splice(to,0,item);
  selectedId=item.id;

  markDirty('Urutan bacaan utama diubah');

  requestAnimationFrame(()=>{
    document.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.scrollIntoView({
      block:'nearest',
      behavior:'smooth'
    });
  });
}

/* ===================== EDITOR ===================== */
function selectItem(id){
  selectedId=id;
  renderList();

  const x=getSelected();
  if(!x)return;

  $('#emptyEditor').classList.add('hidden');
  $('#editorContent').classList.remove('hidden');

  $('#editorHeading').textContent=x.title||'Edit Bacaan';
  $('#editorTypeBadge').textContent=x.type||'';
  $('#editorCategoryBadge').textContent=x.category||'Tanpa kategori';
  $('#editorMeta').textContent=`ID: ${x.id}`;

  $('#titleInput').value=x.title||'';
  $('#categoryInput').value=x.category||'';
  $('#typeInput').value=x.type||'single';
  $('#iconInput').value=x.icon||'';
  $('#idInput').value=x.id||'';
  $('#coverTextInput').value=x.coverText??x.title??'';

  $('#singleFields').classList.toggle('hidden',x.type!=='single');
  $('#partsSection').classList.toggle('hidden',x.type==='single');

  if(x.type==='single'){
    $('#singleFileInput').value=x.file||'';
    $('#singlePagesInput').value=Math.max(1,Number(x.pages)||1);
    $('#singlePdfPicker').value='';
    updateSingleR2Key();
  }else{
    renderParts();
  }

  renderLivePreview();
  renderItemValidation();
}

function showEmptyEditor(){
  $('#editorContent').classList.add('hidden');
  $('#emptyEditor').classList.remove('hidden');
}

function patchSelected(key,value){
  const x=getSelected();
  if(!x)return;
  x[key]=value;

  if(key==='title')$('#editorHeading').textContent=value||'Edit Bacaan';
  if(key==='category')$('#editorCategoryBadge').textContent=value||'Tanpa kategori';

  markDirty();
}

async function changeType(){
  const x=getSelected();
  if(!x)return;

  const next=$('#typeInput').value;
  if(next===x.type)return;

  const message=x.type==='single'
    ? `Ubah "${x.title}" dari Single menjadi ${next}?\n\nPDF yang sekarang akan dijadikan bagian pertama.`
    : next==='single'
      ? `Ubah "${x.title}" menjadi Single?\n\nHanya bagian pertama yang akan dipakai sebagai PDF utama di data editor.`
      : `Ubah tipe ${x.type} menjadi ${next}?`;

  const ok=await confirmInternal('Ubah tipe bacaan?',message,'Ubah Tipe','Batal');
  if(!ok){
    $('#typeInput').value=x.type;
    return;
  }

  createBackup(`Sebelum mengubah tipe: ${x.title}`);

  if(x.type==='single' && next!=='single'){
    x.parts=[{
      id:uniquePartId(`${x.id}-bagian-1`),
      title:x.title,
      file:x.file||suggestFolderPath(x),
      pages:Math.max(1,Number(x.pages)||1)
    }];
    delete x.file;
    delete x.pages;
  }else if(x.type!=='single' && next==='single'){
    const p=x.parts?.[0]||{};
    x.file=p.file||suggestFolderPath(x);
    x.pages=Math.max(1,Number(p.pages)||1);
    delete x.parts;
  }

  x.type=next;
  markDirty('Tipe bacaan diubah');
  selectItem(x.id);
}

function renderLivePreview(){
  const x=getSelected();
  if(!x)return;

  $('#previewIcon').textContent=x.icon||'◈';
  $('#previewCategory').textContent=(x.category||'Tanpa kategori').toUpperCase();
  $('#previewTitle').textContent=x.title||'(Tanpa judul)';
  $('#previewCover').textContent=(x.coverText??x.title??'').replace(/\n+/g,' • ');
  $('#previewType').textContent=(x.type||'').toUpperCase();
}

function updateSingleR2Key(){
  $('#singleR2Key').textContent=`R2 key: ${r2Key($('#singleFileInput').value)||'—'}`;
}

function handleSinglePdfPicker(){
  const f=$('#singlePdfPicker').files?.[0];
  const x=getSelected();
  if(!f||!x)return;

  let current=$('#singleFileInput').value.trim();

  if(!current || current.endsWith('/')){
    const base=current||suggestFolderPath(x);
    $('#singleFileInput').value=
      `${base}${base.endsWith('/')?'':'/'}${slugify(f.name.replace(/\.pdf$/i,''))}.pdf`;
  }

  x.file=$('#singleFileInput').value;
  updateSingleR2Key();
  markDirty('Path PDF diperbarui dari nama file');
}

/* ===================== PARTS ===================== */
function renderParts(){
  const x=getSelected();
  if(!x||x.type==='single')return;

  $('#partsHeading').textContent=
    x.type==='collection'?'Bagian Koleksi':'Isi Kelompok';
  $('#partsEyebrow').textContent=
    x.type==='collection'?'URUTAN KOLEKSI':'DAFTAR KELOMPOK';

  const list=$('#partsList');
  const parts=x.parts||[];

  if(!parts.length){
    list.innerHTML='<div class="parts-empty">Belum ada bagian. Tambahkan minimal satu PDF.</div>';
    return;
  }

  list.innerHTML=parts.map((p,i)=>`
    <div class="part-row" draggable="true" data-part-index="${i}">
      <button class="drag-handle" type="button" title="Drag">☰</button>
      <span class="part-num">${String(i+1).padStart(2,'0')}</span>

      <span class="part-copy">
        <b>${esc(p.title||'(Tanpa judul)')}</b>
        <small>${esc(p.file||'(Path kosong)')} • ${Math.max(1,Number(p.pages)||1)} hal.</small>
      </span>

      <span class="part-actions">
        <button type="button" data-up="${i}" title="Naik">↑</button>
        <button type="button" data-down="${i}" title="Turun">↓</button>
        <button type="button" data-edit="${i}" title="Edit">✎</button>
        <button type="button" data-delete="${i}" title="Hapus">×</button>
      </span>
    </div>
  `).join('');

  $$('.part-row',list).forEach(row=>{
    row.addEventListener('dragstart',e=>{
      partDragIndex=Number(row.dataset.partIndex);
      row.classList.add('dragging');
      try{e.dataTransfer.effectAllowed='move'}catch{}
    });

    row.addEventListener('dragend',()=>{
      partDragIndex=null;
      row.classList.remove('dragging');
      $$('.drag-over',list).forEach(el=>el.classList.remove('drag-over'));
    });

    row.addEventListener('dragover',e=>{
      e.preventDefault();
      row.classList.add('drag-over');
    });

    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));

    row.addEventListener('drop',e=>{
      e.preventDefault();
      row.classList.remove('drag-over');
      const to=Number(row.dataset.partIndex);
      if(partDragIndex===null||partDragIndex===to)return;
      movePart(partDragIndex,to);
    });
  });

  $$('[data-up]',list).forEach(btn=>btn.onclick=()=>movePart(Number(btn.dataset.up),Number(btn.dataset.up)-1));
  $$('[data-down]',list).forEach(btn=>btn.onclick=()=>movePart(Number(btn.dataset.down),Number(btn.dataset.down)+1));
  $$('[data-edit]',list).forEach(btn=>btn.onclick=()=>openPartDialog(Number(btn.dataset.edit)));
  $$('[data-delete]',list).forEach(btn=>btn.onclick=()=>removePart(Number(btn.dataset.delete)));
}

function movePart(from,to){
  const x=getSelected();
  if(!x||!Array.isArray(x.parts))return;
  if(from<0||to<0||from>=x.parts.length||to>=x.parts.length||from===to)return;

  const [p]=x.parts.splice(from,1);
  x.parts.splice(to,0,p);
  markDirty('Urutan bagian diubah');
  renderParts();
}

async function removePart(i){
  const x=getSelected();
  const p=x?.parts?.[i];
  if(!p)return;

  const ok=await confirmInternal(
    'Hapus bagian?',
    `Hapus "${p.title}" dari books.json?\n\nObject PDF di Cloudflare R2 tidak ikut terhapus.`,
    'Hapus',
    'Batal'
  );
  if(!ok)return;

  createBackup(`Sebelum menghapus bagian: ${p.title}`);
  x.parts.splice(i,1);
  markDirty('Bagian dihapus dari data');
  renderParts();
}

function openPartDialog(i=-1){
  const x=getSelected();
  if(!x)return;

  editingPartIndex=i;
  const p=i>=0?x.parts[i]:null;

  $('#partDialogMode').textContent=i>=0?'EDIT BAGIAN':'BAGIAN BARU';
  $('#partDialogTitle').textContent=i>=0?'Edit Bagian':'Tambah Bagian';
  $('#partTitleInput').value=p?.title||'';
  $('#partIdInput').value=p?.id||'';
  $('#partIdInput').readOnly=i>=0;
  $('#partIdInput').dataset.touched='';
  $('#partFileInput').value=p?.file||suggestFolderPath(x);
  $('#partPagesInput').value=Math.max(1,Number(p?.pages)||1);
  $('#partPdfPicker').value='';
  updatePartR2Key();

  $('#partDialog').showModal();
}

function onPartTitleInput(){
  if(editingPartIndex<0 && !$('#partIdInput').dataset.touched){
    $('#partIdInput').value=uniquePartId(slugify($('#partTitleInput').value));
  }
}

function suggestFolderPath(x){
  const folder={
    "Al-Qur'an":'quran',
    Wirid:'wirid',
    Doa:'doa',
    Maulid:'maulid',
    Dalail:'dalail',
    Syair:'syair',
    Khutbah:'khutbah'
  }[x.category]||slugify(x.category||'doa');

  const sub=x.type==='single'?'':`${slugify(x.id||x.title)}/`;
  return `assets/pdf-v2/${folder}/${sub}`;
}

function updatePartR2Key(){
  $('#partR2Key').textContent=`R2 key: ${r2Key($('#partFileInput').value)||'—'}`;
}

function handlePartPdfPicker(){
  const f=$('#partPdfPicker').files?.[0];
  const x=getSelected();
  if(!f||!x)return;

  let current=$('#partFileInput').value.trim();

  if(!current||current.endsWith('/')){
    const base=current||suggestFolderPath(x);
    $('#partFileInput').value=
      `${base}${base.endsWith('/')?'':'/'}${slugify(f.name.replace(/\.pdf$/i,''))}.pdf`;
  }

  if(!$('#partTitleInput').value){
    $('#partTitleInput').value=
      f.name.replace(/\.pdf$/i,'').replace(/[-_]+/g,' ');
  }

  if(editingPartIndex<0 && !$('#partIdInput').value){
    $('#partIdInput').value=uniquePartId(slugify($('#partTitleInput').value));
  }

  updatePartR2Key();
}

function savePart(){
  const x=getSelected();
  if(!x)return;

  const title=$('#partTitleInput').value.trim();
  let id=$('#partIdInput').value.trim();
  const file=$('#partFileInput').value.trim();
  const pages=Math.max(1,Number($('#partPagesInput').value)||1);

  if(!title){
    toast('Judul bagian wajib diisi.','error');
    $('#partTitleInput').focus();
    return;
  }

  if(!file){
    toast('Path PDF wajib diisi.','error');
    $('#partFileInput').focus();
    return;
  }

  if(!file.startsWith('assets/pdf-v2/')){
    toast('Path sebaiknya diawali assets/pdf-v2/.','warn');
  }

  if(editingPartIndex<0){
    id=id||uniquePartId(slugify(title));

    const used=new Set([
      ...data.items.map(it=>it.id),
      ...data.items.flatMap(it=>(it.parts||[]).map(p=>p.id))
    ]);

    if(used.has(id)){
      toast('ID sudah digunakan.','error');
      return;
    }

    x.parts.push({id,title,file,pages});
  }else{
    const p=x.parts[editingPartIndex];
    p.title=title;
    p.file=file;
    p.pages=pages;
  }

  $('#partDialog').close();
  markDirty(editingPartIndex<0?'Bagian baru ditambahkan':'Bagian diperbarui');
  renderParts();
}

/* ===================== CREATE / DELETE ITEM ===================== */
function openItemDialog(){
  $('#newTitleInput').value='';
  $('#newIconInput').value='';
  $('#newCategoryInput').value=categories()[0]||'Doa';
  $('#newTypeInput').value='single';
  $('#itemDialog').showModal();
}

function createItem(){
  const title=$('#newTitleInput').value.trim();
  if(!title){
    toast('Judul wajib diisi.','error');
    return;
  }

  const type=$('#newTypeInput').value;
  const category=$('#newCategoryInput').value.trim()||'Lainnya';
  const icon=$('#newIconInput').value.trim()||'◈';
  const id=uniqueItemId(slugify(title));

  const item={
    id,
    title,
    category,
    type,
    icon,
    coverText:title
  };

  if(type==='single'){
    item.file=`assets/pdf-v2/${slugify(category)}/`;
    item.pages=1;
  }else{
    item.parts=[];
  }

  data.items.push(item);
  $('#itemDialog').close();
  selectedId=id;

  refreshCategoryUI();
  markDirty('Bacaan baru dibuat');
  selectItem(id);
}

async function deleteItem(){
  const x=getSelected();
  if(!x)return;

  const count=x.type==='single'?1:(x.parts||[]).length;

  const ok=await confirmInternal(
    'Hapus bacaan?',
    `Hapus "${x.title}" beserta ${count} referensi PDF dari books.json?\n\nPDF fisik di Cloudflare R2 TIDAK ikut terhapus.`,
    'Hapus Bacaan',
    'Batal'
  );
  if(!ok)return;

  createBackup(`Sebelum menghapus bacaan: ${x.title}`);
  data.items=data.items.filter(i=>i.id!==x.id);
  selectedId=null;

  refreshCategoryUI();
  renderList();
  showEmptyEditor();
  updateAllStatus(true,'Bacaan dihapus dari data');
  scheduleAutosave();
}

/* ===================== VALIDATION ===================== */
function validateAll(){
  const errors=[];
  const warnings=[];
  const oks=[];

  if(!data || !Array.isArray(data.items)){
    errors.push({scope:'Root',message:'items[] tidak ditemukan.'});
    return {errors,warnings,oks};
  }

  const topIds=new Map();
  const partIds=new Map();
  const paths=new Map();

  data.items.forEach((item,index)=>{
    const label=item.title||`Item #${index+1}`;

    if(!item.id){
      errors.push({scope:label,message:'ID bacaan kosong.'});
    }else{
      if(topIds.has(item.id)){
        errors.push({scope:label,message:`ID bacaan duplikat: ${item.id}`});
      }
      topIds.set(item.id,index);
    }

    if(!String(item.title||'').trim()){
      errors.push({scope:label,message:'Judul tampilan kosong.'});
    }

    if(!String(item.category||'').trim()){
      errors.push({scope:label,message:'Kategori kosong.'});
    }

    if(!VALID_TYPES.has(item.type)){
      errors.push({scope:label,message:`Tipe tidak valid: ${item.type||'(kosong)'}`});
    }

    if(!String(item.icon||'').trim()){
      warnings.push({scope:label,message:'Icon kartu kosong.'});
    }

    if(!String(item.coverText??'').trim()){
      warnings.push({scope:label,message:'Teks cover/kartu kosong.'});
    }

    if(item.type==='single'){
      validateFile(label,item.file,item.pages,errors,warnings,paths);
    }else if(VALID_TYPES.has(item.type)){
      if(!Array.isArray(item.parts)){
        errors.push({scope:label,message:'parts[] tidak ditemukan.'});
      }else if(!item.parts.length){
        errors.push({scope:label,message:'Belum memiliki bagian/PDF.'});
      }else{
        item.parts.forEach((p,i)=>{
          const pLabel=`${label} → Bagian ${i+1}${p.title?` (${p.title})`:''}`;

          if(!p.id){
            errors.push({scope:pLabel,message:'ID bagian kosong.'});
          }else{
            if(topIds.has(p.id)){
              errors.push({scope:pLabel,message:`ID bagian sama dengan ID bacaan utama: ${p.id}`});
            }
            if(partIds.has(p.id)){
              errors.push({scope:pLabel,message:`ID bagian duplikat: ${p.id}`});
            }
            partIds.set(p.id,pLabel);
          }

          if(!String(p.title||'').trim()){
            errors.push({scope:pLabel,message:'Judul bagian kosong.'});
          }

          validateFile(pLabel,p.file,p.pages,errors,warnings,paths);
        });
      }
    }
  });

  for(const [path,labels] of paths.entries()){
    if(labels.length>1){
      warnings.push({
        scope:'PDF',
        message:`Path dipakai ${labels.length} kali: ${path}`
      });
    }
  }

  if(!errors.length){
    oks.push({scope:'Katalog',message:'Tidak ada error struktur yang terdeteksi.'});
  }

  return {errors,warnings,oks};
}

function validateFile(label,file,pages,errors,warnings,paths){
  const path=String(file||'').trim();

  if(!path){
    errors.push({scope:label,message:'Path PDF kosong.'});
  }else{
    if(!path.startsWith('assets/pdf-v2/')){
      errors.push({
        scope:label,
        message:'Path PDF harus diawali assets/pdf-v2/ agar pemetaan R2 konsisten.'
      });
    }

    if(!/\.pdf$/i.test(path)){
      warnings.push({scope:label,message:'Path tidak berakhiran .pdf.'});
    }

    const arr=paths.get(path)||[];
    arr.push(label);
    paths.set(path,arr);
  }

  const n=Number(pages);
  if(!Number.isInteger(n)||n<1){
    errors.push({scope:label,message:'Jumlah halaman harus bilangan bulat minimal 1.'});
  }
}

function validationForItem(item){
  const temp={version:data.version,categories:data.categories,items:[clone(item)]};
  const current=data;
  data=temp;
  const result=validateAll();
  data=current;
  return result;
}

function renderItemValidation(){
  const x=getSelected();
  const host=$('#itemValidation');
  if(!x||!host)return;

  const r=validationForItem(x);

  if(!r.errors.length&&!r.warnings.length){
    host.innerHTML='<div class="validation-entry ok"><b>✓</b><span>Item ini lolos pemeriksaan dasar.</span></div>';
    return;
  }

  host.innerHTML=[
    ...r.errors.map(e=>`<div class="validation-entry error"><b>!</b><span>${esc(e.message)}</span></div>`),
    ...r.warnings.map(w=>`<div class="validation-entry warning"><b>△</b><span>${esc(w.message)}</span></div>`)
  ].join('');
}

function openValidationDialog(forExport=false){
  const r=validateAll();

  $('#validationDialogTitle').textContent=
    forExport?'Preview sebelum Download':'Validasi books.json';

  $('#validationSummary').innerHTML=`
    <div class="validation-summary-card">
      <span><b>${data.items.length}</b><small>Bacaan</small></span>
      <span><b>${totalPdf()}</b><small>PDF</small></span>
      <span><b>${r.errors.length}</b><small>Error</small></span>
      <span><b>${r.warnings.length}</b><small>Peringatan</small></span>
    </div>
  `;

  const details=$('#validationDetails');
  const blocks=[];

  if(r.errors.length){
    blocks.push('<div class="validation-group-title">ERROR — WAJIB DIPERBAIKI</div>');
    blocks.push(...r.errors.map(e=>
      `<div class="validation-detail error"><b>${esc(e.scope)}</b><br>${esc(e.message)}</div>`
    ));
  }

  if(r.warnings.length){
    blocks.push('<div class="validation-group-title">PERINGATAN — PERLU DICEK</div>');
    blocks.push(...r.warnings.map(w=>
      `<div class="validation-detail warning"><b>${esc(w.scope)}</b><br>${esc(w.message)}</div>`
    ));
  }

  if(!r.errors.length){
    blocks.unshift(
      '<div class="validation-detail ok"><b>✓ Struktur aman untuk diekspor.</b><br>'+
      (r.warnings.length
        ? 'Ada peringatan, tetapi tidak memblokir download.'
        : 'Tidak ada error atau peringatan yang terdeteksi.')+
      '</div>'
    );
  }

  details.innerHTML=blocks.join('');
  $('#confirmExportBtn').classList.toggle('hidden',!forExport);
  $('#confirmExportBtn').disabled=r.errors.length>0;

  $('#validationDialog').showModal();
}

/* ===================== PREVIEW ===================== */
function showItemPreview(x){
  if(!x)return;

  const parts=x.type==='single'
    ? [{
        id:x.id,
        title:x.title,
        file:x.file,
        pages:x.pages
      }]
    : (x.parts||[]);

  $('#previewDialogContent').innerHTML=`
    <div class="preview-hero">
      <div class="preview-hero-icon">${esc(x.icon||'◈')}</div>
      <div>
        <small>${esc((x.category||'TANPA KATEGORI').toUpperCase())} • ${esc((x.type||'').toUpperCase())}</small>
        <h4>${esc(x.title||'(Tanpa judul)')}</h4>
        <p>${esc(x.coverText??x.title??'')}</p>
      </div>
    </div>

    <div class="preview-stats">
      <span><b>${parts.length}</b><small>${x.type==='single'?'PDF':'Bagian'}</small></span>
      <span><b>${parts.reduce((n,p)=>n+(Number(p.pages)||0),0)}</b><small>Total Hal.</small></span>
      <span><b>${esc(x.id)}</b><small>ID</small></span>
    </div>

    <div class="preview-parts">
      ${parts.map((p,i)=>`
        <div class="preview-part">
          <span>${String(i+1).padStart(2,'0')}</span>
          <span>
            <b>${esc(p.title||x.title||'(Tanpa judul)')}</b><br>
            <small>${esc(r2Key(p.file||''))}</small>
          </span>
          <small>${Math.max(1,Number(p.pages)||1)} hal.</small>
        </div>
      `).join('')}
    </div>
  `;

  $('#previewDialog').showModal();
}

/* ===================== EXPORT / IMPORT / RESET ===================== */
function exportJson(){
  const r=validateAll();
  if(r.errors.length){
    toast('Masih ada error. Perbaiki sebelum download.','error');
    return;
  }

  createBackup('Sebelum export books.json');
  normalizeExport();
  data.version='2.32-admin';

  downloadJson(data,'books.json');
  localStorage.removeItem(DRAFT_KEY);
  original=clone(data);
  dirty=false;

  $('#validationDialog').close();
  updateAllStatus(false,'books.json berhasil dibuat — replace file ini di GitHub');
  toast('books.json berhasil di-download.','ok');
}

function downloadJson(obj,filename){
  const blob=new Blob([JSON.stringify(obj,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}

async function importJson(e){
  const f=e.target.files?.[0];
  if(!f)return;

  try{
    const parsed=JSON.parse(await f.text());
    assertBooksShape(parsed);

    const ok=await confirmInternal(
      'Import books.json?',
      'Data editor saat ini akan diganti dengan file yang dipilih.\nBackup lokal akan dibuat terlebih dahulu.',
      'Import',
      'Batal'
    );

    if(!ok){
      e.target.value='';
      return;
    }

    createBackup('Sebelum import JSON');
    data=parsed;
    selectedId=null;
    dirty=true;

    refreshCategoryUI();
    renderList();
    showEmptyEditor();
    saveDraft('JSON di-import dan disimpan sebagai draft');
    updateAllStatus(true,'JSON berhasil di-import');

  }catch(err){
    toast(`File JSON tidak valid: ${err.message}`,'error');
  }

  e.target.value='';
}

async function undoAll(){
  if(!dirty){
    toast('Tidak ada perubahan yang perlu dibatalkan.','warn');
    return;
  }

  const ok=await confirmInternal(
    'Batalkan semua perubahan?',
    'Data editor akan kembali ke kondisi awal saat halaman Admin dibuka.\nBackup otomatis akan dibuat sebelum dibatalkan.',
    'Batalkan Semua',
    'Kembali'
  );
  if(!ok)return;

  createBackup('Sebelum Batalkan Semua');
  data=clone(original);
  selectedId=null;
  localStorage.removeItem(DRAFT_KEY);
  dirty=false;

  refreshCategoryUI();
  renderList();
  showEmptyEditor();
  updateAllStatus(false,'Semua perubahan dibatalkan');
}

async function reloadServer(){
  const ok=await confirmInternal(
    'Muat ulang dari server?',
    'Admin akan mengambil books.json terbaru dari GitHub Pages.\nPerubahan editor saat ini akan dibackup terlebih dahulu.',
    'Muat Ulang',
    'Batal'
  );
  if(!ok)return;

  if(data?.items)createBackup('Sebelum memuat ulang books.json server');

  try{
    const fresh=await fetchBooks();
    original=clone(fresh);
    data=clone(fresh);
    selectedId=null;
    dirty=false;

    localStorage.removeItem(DRAFT_KEY);
    refreshCategoryUI();
    renderList();
    showEmptyEditor();
    updateAllStatus(false,'books.json terbaru berhasil dimuat');
    toast('Data server berhasil dimuat ulang.','ok');
  }catch(err){
    toast(err.message,'error');
  }
}

/* ===================== CONFIRM / TOAST ===================== */
function confirmInternal(title,message,okText='Lanjutkan',cancelText='Batal'){
  $('#confirmTitle').textContent=title;
  $('#confirmMessage').textContent=message;
  $('#confirmOkBtn').textContent=okText;
  $('#confirmCancelBtn').textContent=cancelText;

  $('#confirmDialog').showModal();

  return new Promise(resolve=>{
    confirmResolver=resolve;
  });
}

function resolveConfirm(value){
  $('#confirmDialog').close();
  if(confirmResolver){
    const fn=confirmResolver;
    confirmResolver=null;
    fn(value);
  }
}

function toast(message,type='ok'){
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=message;
  $('#toastHost').appendChild(el);

  setTimeout(()=>{
    el.style.opacity='0';
    el.style.transform='translateY(5px)';
    setTimeout(()=>el.remove(),220);
  },2600);
}

function safeDateStamp(d){
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/* ===================== START ===================== */
boot().catch(err=>{
  document.body.innerHTML=`
    <div style="max-width:720px;margin:60px auto;padding:28px;font-family:system-ui;background:#fff;border-radius:18px">
      <h2>Admin Koleksi gagal dimuat</h2>
      <p>${esc(err.message)}</p>
      <p>Pastikan <b>admin.html</b>, <b>admin.css</b>, <b>admin.js</b>, dan <b>books.json</b> berada di root repository yang sama.</p>
    </div>
  `;
});
