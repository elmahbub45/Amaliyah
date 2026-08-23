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
let batchEntries=[];
let batchDragIndex=null;

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

  $('#workspaceStatusBtn').onclick=()=>openValidationDialog(false);
  $('#metricErrorsBtn').onclick=()=>openValidationDialog(false);
  $('#metricWarningsBtn').onclick=()=>openValidationDialog(false);

  $('#addItemBtn').onclick=openItemDialog;
  $('#createItemBtn').onclick=createItem;
  $('#itemForm').onsubmit=e=>{e.preventDefault();createItem();};
  $('#closeItemDialogBtn').onclick=()=>$('#itemDialog').close();
  $('#cancelItemBtn').onclick=()=>$('#itemDialog').close();

  $('#batchImportBtn').onclick=openBatchDialog;
  $('#closeBatchBtn').onclick=closeBatchDialog;
  $('#cancelBatchBtn').onclick=closeBatchDialog;
  $('#batchChooseFilesBtn').onclick=()=>$('#batchFilesInput').click();
  $('#batchChooseFolderBtn').onclick=()=>$('#batchFolderInput').click();
  $('#batchFilesInput').onchange=handleBatchFiles;
  $('#batchFolderInput').onchange=handleBatchFiles;
  $('#batchModeInput').onchange=()=>{
    updateBatchModeUI();
    renderBatchReview();
  };
  $('#batchCategoryInput').oninput=renderBatchReview;
  $('#batchTitleInput').oninput=renderBatchReview;
  $('#applyBatchBtn').onclick=applyBatchImport;

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
  $('#singlePdfChooseBtn').onclick=()=>$('#singlePdfPicker').click();
  $('#singlePdfPicker').onchange=handleSinglePdfPicker;
  $('#editSinglePathBtn').onclick=()=>toggleTechnicalInput($('#singleFileInput'),$('#editSinglePathBtn'));

  $('#addPartBtn').onclick=()=>openPartDialog();
  $('#savePartBtn').onclick=savePart;
  $('#partForm').onsubmit=e=>{e.preventDefault();savePart();};
  $('#partTitleInput').oninput=onPartTitleInput;
  $('#partFileInput').oninput=updatePartR2Key;
  $('#partPdfChooseBtn').onclick=()=>$('#partPdfPicker').click();
  $('#partPdfPicker').onchange=handlePartPdfPicker;
  $('#editPartPathBtn').onclick=()=>toggleTechnicalInput($('#partFileInput'),$('#editPartPathBtn'));
  $('#closePartDialogBtn').onclick=closePartDialog;
  $('#cancelPartBtn').onclick=closePartDialog;

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

function safePdfFilename(name=''){
  const raw=String(name||'').split(/[\\/]/).pop().trim();
  const cleaned=raw
    .replace(/[\u0000-\u001f\u007f]/g,'')
    .replace(/[\\/:*?"<>|]/g,'-')
    .replace(/\s+/g,' ')
    .trim();
  const base=cleaned.replace(/\.pdf$/i,'')||'bacaan';
  return `${base}.pdf`;
}

function titleFromFilename(name=''){
  const title=safePdfFilename(name)
    .replace(/\.pdf$/i,'')
    .replace(/^\s*\d+[\s._-]*/,'')
    .replace(/[_-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim() || 'Bacaan';

  return title.charAt(0).toLocaleUpperCase('id-ID')+title.slice(1);
}

function basename(path=''){
  return String(path).split('/').filter(Boolean).pop()||'';
}

function naturalCompare(a,b){
  return String(a).localeCompare(String(b),'id',{numeric:true,sensitivity:'base'});
}

function categoryFolder(category=''){
  const key=String(category).trim();
  return {
    "Al-Qur'an":'quran',
    "Al-Qur’an":'quran',
    Quran:'quran',
    Wirid:'wirid',
    Doa:'doa',
    Maulid:'maulid',
    Dalail:'dalail',
    Syair:'syair',
    Khutbah:'khutbah'
  }[key]||slugify(key||'doa');
}

function toggleTechnicalInput(input,button){
  const willEdit=input.readOnly;
  input.readOnly=!willEdit;
  button.textContent=willEdit?'Kunci kembali':'Edit teknis';
  if(willEdit){
    input.focus();
    input.select();
  }
}

function showFormError(host,message=''){
  host.textContent=message;
  host.classList.toggle('hidden',!message);
}

async function detectPdfPages(file){
  try{
    if(!file || !/\.pdf$/i.test(file.name||''))return null;
    const buffer=await file.arrayBuffer();
    const text=new TextDecoder('latin1').decode(buffer);
    const pageMatches=text.match(/\/Type\s*\/Page\b/g);
    if(pageMatches?.length)return pageMatches.length;

    const counts=[...text.matchAll(/\/Count\s+(\d+)/g)]
      .map(m=>Number(m[1]))
      .filter(n=>Number.isInteger(n)&&n>0&&n<20000);
    return counts.length?Math.max(...counts):null;
  }catch{
    return null;
  }
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

  $('#workspaceStatusBtn').classList.toggle('has-issue',validation.errors.length>0||validation.warnings.length>0);
  $('#workspaceStatusBtn').title=validation.errors.length
    ? `Klik untuk melihat ${validation.errors.length} error`
    : validation.warnings.length
      ? `Klik untuk melihat ${validation.warnings.length} peringatan`
      : 'Klik untuk melihat kesehatan data';
  $('#metricErrorsBtn').classList.toggle('has-error',validation.errors.length>0);
  $('#metricWarningsBtn').classList.toggle('has-warning',validation.warnings.length>0);

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
          <span class="item-copy">
            <b>${esc(x.title||'(Tanpa judul)')}</b>
            <small>${esc(x.category||'Tanpa kategori')} <i>•</i> ${esc(x.type)}</small>
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
    $('#singleFileInput').readOnly=true;
    $('#editSinglePathBtn').textContent='Edit teknis';
    $('#singlePagesInput').value=Math.max(1,Number(x.pages)||1);
    $('#singlePdfPicker').value='';
    $('#singlePdfName').textContent=x.file?basename(x.file):'Belum memilih PDF';
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

async function handleSinglePdfPicker(){
  const f=$('#singlePdfPicker').files?.[0];
  const x=getSelected();
  if(!f||!x)return;

  const current=$('#singleFileInput').value.trim();
  const folder=current.includes('/')
    ? current.slice(0,current.lastIndexOf('/')+1)
    : suggestFolderPath(x);
  const base=folder.endsWith('/')?folder:`${folder}/`;
  const file=`${base}${safePdfFilename(f.name)}`;

  $('#singleFileInput').value=file;
  $('#singlePdfName').textContent=`${f.name} • mendeteksi halaman…`;
  x.file=file;
  updateSingleR2Key();

  const detected=await detectPdfPages(f);
  if(detected){
    $('#singlePagesInput').value=detected;
    x.pages=detected;
    $('#singlePdfName').textContent=`${f.name} • ${detected} halaman`;
  }else{
    $('#singlePdfName').textContent=f.name;
  }
  markDirty(detected?'PDF & jumlah halaman diperbarui':'PDF bacaan diperbarui');
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
  $('#partIdInput').readOnly=true;
  $('#partFileInput').value=p?.file||'';
  $('#partFileInput').readOnly=true;
  $('#editPartPathBtn').textContent='Edit teknis';
  $('#partPagesInput').value=Math.max(1,Number(p?.pages)||1);
  $('#partPdfPicker').value='';
  $('#partPdfName').textContent=p?.file?basename(p.file):'Belum memilih PDF';
  showFormError($('#partFormError'),'');
  updatePartR2Key();

  $('#partDialog').showModal();
  setTimeout(()=>$('#partTitleInput').focus(),40);
}

function closePartDialog(){
  showFormError($('#partFormError'),'');
  $('#partDialog').close();
}

function onPartTitleInput(){
  if(editingPartIndex<0){
    const title=$('#partTitleInput').value.trim();
    $('#partIdInput').value=title?uniquePartId(slugify(title)):'';
  }
}

function suggestFolderPath(x){
  const folder=categoryFolder(x.category);
  const sub=x.type==='single'?'':`${slugify(x.id||x.title)}/`;
  return `assets/pdf-v2/${folder}/${sub}`;
}

function updatePartR2Key(){
  $('#partR2Key').textContent=`R2 key: ${r2Key($('#partFileInput').value)||'—'}`;
}

async function handlePartPdfPicker(){
  const f=$('#partPdfPicker').files?.[0];
  const x=getSelected();
  if(!f||!x)return;

  const current=$('#partFileInput').value.trim();
  const folder=current.includes('/')
    ? current.slice(0,current.lastIndexOf('/')+1)
    : suggestFolderPath(x);
  const base=folder.endsWith('/')?folder:`${folder}/`;

  $('#partFileInput').value=`${base}${safePdfFilename(f.name)}`;
  $('#partPdfName').textContent=`${f.name} • mendeteksi halaman…`;

  if(!$('#partTitleInput').value.trim()){
    $('#partTitleInput').value=titleFromFilename(f.name);
  }

  if(editingPartIndex<0){
    $('#partIdInput').value=uniquePartId(slugify($('#partTitleInput').value));
  }

  const detected=await detectPdfPages(f);
  if(detected){
    $('#partPagesInput').value=detected;
    $('#partPdfName').textContent=`${f.name} • ${detected} halaman`;
  }else{
    $('#partPdfName').textContent=f.name;
  }

  showFormError($('#partFormError'),'');
  updatePartR2Key();
}

function savePart(){
  const x=getSelected();
  if(!x)return;

  const title=$('#partTitleInput').value.trim();
  let id=$('#partIdInput').value.trim();
  const file=$('#partFileInput').value.trim();
  const rawPages=Number($('#partPagesInput').value);
  const pages=Math.floor(rawPages);

  showFormError($('#partFormError'),'');

  if(!title){
    showFormError($('#partFormError'),'Judul Bagian belum diisi.');
    $('#partTitleInput').focus();
    return;
  }

  if(!file || !/\.pdf$/i.test(file)){
    showFormError($('#partFormError'),'Pilih PDF bacaan terlebih dahulu.');
    $('#partPdfChooseBtn').focus();
    return;
  }

  if(!Number.isInteger(pages)||pages<1){
    showFormError($('#partFormError'),'Jumlah halaman harus minimal 1.');
    $('#partPagesInput').focus();
    return;
  }

  if(editingPartIndex<0){
    id=id||uniquePartId(slugify(title));

    const used=new Set([
      ...data.items.map(it=>it.id),
      ...data.items.flatMap(it=>(it.parts||[]).map(p=>p.id))
    ]);

    if(used.has(id))id=uniquePartId(id);
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

/* ===================== BATCH IMPORT PDF ===================== */
function openBatchDialog(){
  batchEntries=[];
  $('#batchModeInput').value='singles';
  $('#batchCategoryInput').value=categories()[0]||'Doa';
  $('#batchTitleInput').value='';
  $('#batchFilesInput').value='';
  $('#batchFolderInput').value='';
  updateBatchModeUI();
  renderBatchReview();
  $('#batchDialog').showModal();
}

function closeBatchDialog(){
  batchEntries=[];
  $('#batchDialog').close();
}

function updateBatchModeUI(){
  const mode=$('#batchModeInput').value;
  $('#batchTitleField').classList.toggle('hidden',mode==='singles');
}

async function handleBatchFiles(e){
  const files=[...(e.target.files||[])]
    .filter(f=>/\.pdf$/i.test(f.name))
    .sort((a,b)=>naturalCompare(a.webkitRelativePath||a.name,b.webkitRelativePath||b.name));

  if(!files.length){
    toast('Tidak ada file PDF yang dipilih.','warn');
    return;
  }

  batchEntries=files.map(f=>({
    file:f,
    filename:safePdfFilename(f.name),
    title:titleFromFilename(f.name),
    pages:1,
    detecting:true,
    detected:false
  }));

  const mode=$('#batchModeInput').value;
  if(mode!=='singles' && !$('#batchTitleInput').value.trim()){
    const firstPath=files[0].webkitRelativePath||'';
    const folderName=firstPath.includes('/')?firstPath.split('/')[0]:'';
    if(folderName)$('#batchTitleInput').value=folderName.replace(/[_-]+/g,' ');
  }

  renderBatchReview();
  e.target.value='';

  for(let i=0;i<batchEntries.length;i++){
    const entry=batchEntries[i];
    const detected=await detectPdfPages(entry.file);
    entry.detecting=false;
    if(detected){
      entry.pages=detected;
      entry.detected=true;
    }
    renderBatchReview();
  }
}

function batchTargetId(){
  const title=$('#batchTitleInput').value.trim()||'koleksi-baru';
  return uniqueItemId(slugify(title));
}

function batchPathFor(entry,index){
  const category=$('#batchCategoryInput').value.trim()||'Lainnya';
  const folder=categoryFolder(category);
  const mode=$('#batchModeInput').value;

  if(mode==='singles'){
    return `assets/pdf-v2/${folder}/${entry.filename}`;
  }

  const collectionId=batchTargetId();
  return `assets/pdf-v2/${folder}/${collectionId}/${entry.filename}`;
}

function renderBatchReview(){
  const host=$('#batchReviewList');
  $('#batchFileCount').textContent=batchEntries.length;
  $('#applyBatchBtn').disabled=!batchEntries.length;

  if(!batchEntries.length){
    host.innerHTML='<div class="batch-empty">Belum ada PDF dipilih.</div>';
    return;
  }

  const duplicateNames=new Set();
  const seen=new Set();
  batchEntries.forEach(e=>{
    const k=e.filename.toLowerCase();
    if(seen.has(k))duplicateNames.add(k);
    seen.add(k);
  });

  host.innerHTML=batchEntries.map((entry,i)=>{
    const duplicate=duplicateNames.has(entry.filename.toLowerCase());
    return `
      <div class="batch-row ${duplicate?'batch-row-error':''}" draggable="true" data-batch-index="${i}">
        <button class="batch-drag" type="button" title="Drag">☰</button>
        <span class="batch-num">${String(i+1).padStart(2,'0')}</span>
        <div class="batch-row-main">
          <input class="batch-title-input" data-batch-title="${i}" value="${esc(entry.title)}" aria-label="Judul PDF ${i+1}">
          <small>${esc(entry.filename)}${duplicate?' • Nama file duplikat':''}${entry.detecting?' • mendeteksi halaman…':entry.detected?` • ${entry.pages} hal. terdeteksi`:''}</small>
          <code>${esc(r2Key(batchPathFor(entry,i)))}</code>
        </div>
        <label class="batch-pages">
          <span>Hal.</span>
          <input type="number" min="1" value="${Math.max(1,Number(entry.pages)||1)}" data-batch-pages="${i}">
        </label>
        <span class="batch-order-actions">
          <button type="button" data-batch-up="${i}" title="Naik">↑</button>
          <button type="button" data-batch-down="${i}" title="Turun">↓</button>
        </span>
      </div>`;
  }).join('');

  $$('[data-batch-title]',host).forEach(input=>{
    input.oninput=()=>{
      const i=Number(input.dataset.batchTitle);
      if(batchEntries[i])batchEntries[i].title=input.value;
    };
  });

  $$('[data-batch-pages]',host).forEach(input=>{
    input.oninput=()=>{
      const i=Number(input.dataset.batchPages);
      if(batchEntries[i])batchEntries[i].pages=Math.max(1,Math.floor(Number(input.value)||1));
    };
  });

  $$('[data-batch-up]',host).forEach(btn=>btn.onclick=()=>moveBatchEntry(Number(btn.dataset.batchUp),Number(btn.dataset.batchUp)-1));
  $$('[data-batch-down]',host).forEach(btn=>btn.onclick=()=>moveBatchEntry(Number(btn.dataset.batchDown),Number(btn.dataset.batchDown)+1));

  $$('.batch-row',host).forEach(row=>{
    row.addEventListener('dragstart',e=>{
      batchDragIndex=Number(row.dataset.batchIndex);
      row.classList.add('dragging');
      try{e.dataTransfer.effectAllowed='move'}catch{}
    });
    row.addEventListener('dragend',()=>{
      batchDragIndex=null;
      row.classList.remove('dragging');
      $$('.drag-over',host).forEach(el=>el.classList.remove('drag-over'));
    });
    row.addEventListener('dragover',e=>{
      e.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
    row.addEventListener('drop',e=>{
      e.preventDefault();
      row.classList.remove('drag-over');
      const to=Number(row.dataset.batchIndex);
      if(batchDragIndex===null||batchDragIndex===to)return;
      moveBatchEntry(batchDragIndex,to);
    });
  });

  $('#applyBatchBtn').disabled=duplicateNames.size>0;
}

function moveBatchEntry(from,to){
  if(from<0||to<0||from>=batchEntries.length||to>=batchEntries.length||from===to)return;
  const [entry]=batchEntries.splice(from,1);
  batchEntries.splice(to,0,entry);
  renderBatchReview();
}

function applyBatchImport(){
  if(!batchEntries.length)return;

  const mode=$('#batchModeInput').value;
  const category=$('#batchCategoryInput').value.trim()||'Lainnya';
  const invalid=batchEntries.find(e=>!e.title.trim()||!Number.isInteger(Number(e.pages))||Number(e.pages)<1);
  if(invalid){
    toast('Periksa judul dan jumlah halaman pada daftar PDF.','error');
    return;
  }

  createBackup('Sebelum Batch Import PDF');

  if(mode==='singles'){
    const created=[];
    for(const entry of batchEntries){
      const title=entry.title.trim();
      const id=uniqueItemId(slugify(title));
      const item={
        id,
        title,
        category,
        type:'single',
        icon:'◈',
        coverText:title,
        file:batchPathFor(entry,0),
        pages:Math.max(1,Math.floor(Number(entry.pages)||1))
      };
      data.items.push(item);
      created.push(item);
    }
    selectedId=created[0]?.id||null;
  }else{
    const title=$('#batchTitleInput').value.trim();
    if(!title){
      toast('Judul Collection / Group belum diisi.','error');
      $('#batchTitleInput').focus();
      return;
    }

    const id=uniqueItemId(slugify(title));
    const used=new Set([
      ...data.items.map(x=>x.id),
      ...data.items.flatMap(x=>(x.parts||[]).map(p=>p.id))
    ]);
    const parts=[];

    for(const entry of batchEntries){
      const partTitle=entry.title.trim();
      let partId=`${id}-${slugify(partTitle)}`;
      let n=2;
      while(used.has(partId))partId=`${id}-${slugify(partTitle)}-${n++}`;
      used.add(partId);
      const folder=categoryFolder(category);
      parts.push({
        id:partId,
        title:partTitle,
        file:`assets/pdf-v2/${folder}/${id}/${entry.filename}`,
        pages:Math.max(1,Math.floor(Number(entry.pages)||1))
      });
    }

    data.items.push({
      id,
      title,
      category,
      type:mode,
      icon:'◈',
      coverText:title,
      parts
    });
    selectedId=id;
  }

  refreshCategoryUI();
  markDirty(`${batchEntries.length} PDF ditambahkan melalui Batch Import`);
  const id=selectedId;
  closeBatchDialog();
  if(id)selectItem(id);
  toast('Batch Import selesai. Jangan lupa unggah PDF fisik ke R2 sesuai key yang dibuat.','ok');
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
    item.file='';
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
    errors.push({scope:'Root',message:'items[] tidak ditemukan.',fix:'Muat ulang books.json yang valid.',field:'root'});
    return {errors,warnings,oks};
  }

  const topIds=new Map();
  const partIds=new Map();
  const paths=new Map();

  data.items.forEach((item,index)=>{
    const label=item.title||`Item #${index+1}`;
    const base={itemId:item.id||'',itemIndex:index};

    if(!item.id){
      errors.push({...base,scope:label,message:'ID bacaan kosong.',fix:'Buat ulang bacaan atau muat data yang benar. ID normalnya dibuat otomatis.',field:'id'});
    }else{
      if(topIds.has(item.id)){
        errors.push({...base,scope:label,message:`ID bacaan duplikat: ${item.id}`,fix:'Ada dua bacaan dengan ID teknis yang sama. Periksa hasil import JSON atau buat ulang item duplikat.',field:'id'});
      }
      topIds.set(item.id,index);
    }

    if(!String(item.title||'').trim()){
      errors.push({...base,scope:label,message:'Judul tampilan kosong.',fix:'Isi Judul Tampilan.',field:'title'});
    }

    if(!String(item.category||'').trim()){
      errors.push({...base,scope:label,message:'Kategori kosong.',fix:'Pilih atau isi kategori bacaan.',field:'category'});
    }

    if(!VALID_TYPES.has(item.type)){
      errors.push({...base,scope:label,message:`Tipe tidak valid: ${item.type||'(kosong)'}`,fix:'Pilih Single, Collection, atau Group.',field:'type'});
    }

    if(!String(item.icon||'').trim()){
      warnings.push({...base,scope:label,message:'Icon kartu kosong.',fix:'Isi icon jika ingin kartu aplikasi memiliki tanda visual.',field:'icon'});
    }

    if(!String(item.coverText??'').trim()){
      warnings.push({...base,scope:label,message:'Teks cover/kartu kosong.',fix:'Isi teks kartu jika diperlukan.',field:'cover'});
    }

    if(item.type==='single'){
      validateFile(label,item.file,item.pages,errors,warnings,paths,{...base,field:'single-file'});
    }else if(VALID_TYPES.has(item.type)){
      if(!Array.isArray(item.parts)){
        errors.push({...base,scope:label,message:'parts[] tidak ditemukan.',fix:'Ubah tipe lalu kembalikan, atau buat ulang struktur bagian.',field:'parts'});
      }else if(!item.parts.length){
        errors.push({...base,scope:label,message:'Belum memiliki bagian/PDF.',fix:'Klik “+ Tambah Bagian” atau gunakan Batch Import PDF.',field:'parts'});
      }else{
        item.parts.forEach((p,i)=>{
          const pLabel=`${label} → Bagian ${i+1}${p.title?` (${p.title})`:''}`;
          const meta={...base,partIndex:i,field:'part'};

          if(!p.id){
            errors.push({...meta,scope:pLabel,message:'ID bagian kosong.',fix:'Buka bagian ini lalu simpan ulang. ID baru dibuat otomatis.',field:'part-id'});
          }else{
            if(topIds.has(p.id)){
              errors.push({...meta,scope:pLabel,message:`ID bagian sama dengan ID bacaan utama: ${p.id}`,fix:'ID teknis bentrok. Buat ulang bagian ini agar ID otomatis dibuat baru.',field:'part-id'});
            }
            if(partIds.has(p.id)){
              errors.push({...meta,scope:pLabel,message:`ID bagian duplikat: ${p.id}`,fix:'Ada dua bagian dengan ID sama. Buat ulang salah satu bagian.',field:'part-id'});
            }
            partIds.set(p.id,pLabel);
          }

          if(!String(p.title||'').trim()){
            errors.push({...meta,scope:pLabel,message:'Judul bagian kosong.',fix:'Buka bagian ini dan isi Judul Bagian.',field:'part-title'});
          }

          validateFile(pLabel,p.file,p.pages,errors,warnings,paths,meta);
        });
      }
    }
  });

  for(const [path,entries] of paths.entries()){
    if(entries.length>1){
      const first=entries[0];
      warnings.push({
        ...first.meta,
        scope:'PDF',
        message:`Path dipakai ${entries.length} kali: ${path}`,
        fix:'Pastikan memang ingin beberapa bacaan memakai file PDF yang sama.'
      });
    }
  }

  if(!errors.length){
    oks.push({scope:'Katalog',message:'Tidak ada error struktur yang terdeteksi.'});
  }

  return {errors,warnings,oks};
}

function validateFile(label,file,pages,errors,warnings,paths,meta={}){
  const path=String(file||'').trim();

  if(!path){
    errors.push({...meta,scope:label,message:'PDF belum dipilih.',fix:'Pilih PDF bacaan. Path dan R2 key akan dibuat otomatis.',field:meta.partIndex>=0?'part-file':'single-file'});
  }else{
    if(!path.startsWith('assets/pdf-v2/')){
      errors.push({...meta,scope:label,message:'Alamat PDF tidak memakai struktur assets/pdf-v2/.',fix:'Pilih ulang PDF atau buka Detail Teknis jika memang perlu memperbaiki path lama.',field:meta.partIndex>=0?'part-file':'single-file'});
    }

    if(!/\.pdf$/i.test(path)){
      warnings.push({...meta,scope:label,message:'Alamat PDF tidak berakhiran .pdf.',fix:'Pilih ulang file PDF yang benar.',field:meta.partIndex>=0?'part-file':'single-file'});
    }

    const arr=paths.get(path)||[];
    arr.push({label,meta});
    paths.set(path,arr);
  }

  const n=Number(pages);
  if(!Number.isInteger(n)||n<1){
    errors.push({...meta,scope:label,message:'Jumlah halaman belum valid.',fix:'Isi jumlah halaman minimal 1.',field:meta.partIndex>=0?'part-pages':'single-pages'});
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
    ...r.errors.map((e,i)=>`<button class="validation-entry error validation-jump" type="button" data-local-error="${i}"><b>!</b><span><strong>${esc(e.message)}</strong><small>${esc(e.fix||'Klik untuk melihat bagian terkait.')}</small></span><i>›</i></button>`),
    ...r.warnings.map((w,i)=>`<button class="validation-entry warning validation-jump" type="button" data-local-warning="${i}"><b>△</b><span><strong>${esc(w.message)}</strong><small>${esc(w.fix||'Klik untuk melihat bagian terkait.')}</small></span><i>›</i></button>`)
  ].join('');

  $$('[data-local-error]',host).forEach(btn=>btn.onclick=()=>focusIssue(r.errors[Number(btn.dataset.localError)]));
  $$('[data-local-warning]',host).forEach(btn=>btn.onclick=()=>focusIssue(r.warnings[Number(btn.dataset.localWarning)]));
}

function openValidationDialog(forExport=false){
  const r=validateAll();

  $('#validationDialogTitle').textContent=
    forExport?'Preview sebelum Download':'Kesehatan Data';

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
    blocks.push(...r.errors.map((e,i)=>
      `<button class="validation-detail error actionable" type="button" data-global-error="${i}">
        <span><b>${esc(e.scope)}</b><strong>${esc(e.message)}</strong><small>${esc(e.fix||'Klik untuk menuju bagian yang bermasalah.')}</small></span><i>Perbaiki ›</i>
      </button>`
    ));
  }

  if(r.warnings.length){
    blocks.push('<div class="validation-group-title">PERINGATAN — PERLU DICEK</div>');
    blocks.push(...r.warnings.map((w,i)=>
      `<button class="validation-detail warning actionable" type="button" data-global-warning="${i}">
        <span><b>${esc(w.scope)}</b><strong>${esc(w.message)}</strong><small>${esc(w.fix||'Klik untuk menuju bagian terkait.')}</small></span><i>Lihat ›</i>
      </button>`
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
  $$('[data-global-error]',details).forEach(btn=>btn.onclick=()=>focusIssue(r.errors[Number(btn.dataset.globalError)],true));
  $$('[data-global-warning]',details).forEach(btn=>btn.onclick=()=>focusIssue(r.warnings[Number(btn.dataset.globalWarning)],true));

  $('#confirmExportBtn').classList.toggle('hidden',!forExport);
  $('#confirmExportBtn').disabled=r.errors.length>0;

  $('#validationDialog').showModal();
}

function focusIssue(issue,closeValidation=false){
  if(!issue)return;
  if(closeValidation && $('#validationDialog').open)$('#validationDialog').close();

  const item=issue.itemId
    ? data.items.find(x=>x.id===issue.itemId)
    : Number.isInteger(issue.itemIndex)
      ? data.items[issue.itemIndex]
      : null;

  if(!item){
    toast(issue.fix||issue.message,'warn');
    return;
  }

  selectItem(item.id);

  setTimeout(()=>{
    if(Number.isInteger(issue.partIndex)){
      openPartDialog(issue.partIndex);
      const target={
        'part-title':'#partTitleInput',
        'part-file':'#partPdfChooseBtn',
        'part-pages':'#partPagesInput',
        'part-id':'#partTitleInput'
      }[issue.field]||'#partTitleInput';
      $(target)?.focus();
      if(issue.fix)showFormError($('#partFormError'),issue.fix);
      return;
    }

    const selector={
      title:'#titleInput',
      category:'#categoryInput',
      type:'#typeInput',
      icon:'#iconInput',
      cover:'#coverTextInput',
      'single-file':'#singlePdfChooseBtn',
      'single-pages':'#singlePagesInput',
      parts:'#addPartBtn'
    }[issue.field];

    const el=selector?$(selector):$('#editorContent');
    el?.scrollIntoView({behavior:'smooth',block:'center'});
    el?.focus?.();
    if(issue.fix)toast(issue.fix,issue.message?.includes('belum')?'warn':'ok');
  },60);
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
  data.version='2.33-admin-comfort';

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
