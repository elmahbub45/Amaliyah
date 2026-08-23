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
let existingPartSourceId=null;
let undoStack=[];
let redoStack=[];
let historyCurrent=null;
let historyLocked=false;
let explorerCategory='';
let explorerItemId=null;
let explorerView=localStorage.getItem('amaliyah:admin:explorer:view')||'grid';

async function boot(){
  original=await fetchBooks();
  data=clone(original);

  // Bind seluruh kontrol lebih dulu. Dialog draft dapat muncul segera saat boot,
  // jadi tombol konfirmasi harus sudah aktif sebelum confirmInternal() dipanggil.
  bind();

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

  initHistory();
  refreshCategoryUI();
  explorerCategory='';
  explorerItemId=null;
  renderList();
  updateAllStatus(false,'books.json siap diedit');

  selectedId=null;
  showEmptyEditor();
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
  $('#categoryFilter').addEventListener('change',()=>{explorerCategory=$('#categoryFilter').value;explorerItemId=null;selectedId=null;showEmptyEditor();renderList();});
  $('#typeFilter').addEventListener('change',renderList);
  $('#gridViewBtn').onclick=()=>setExplorerView('grid');
  $('#listViewBtn').onclick=()=>setExplorerView('list');

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
  $('#batchFolderInput').onchange=handleBatchFolder;
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
  $('#singlePagesEditBtn').onclick=()=>{
    const d=$('#singleTechnicalDetails');
    if(d)d.open=true;
    setTimeout(()=>$('#singlePagesInput')?.focus(),20);
  };
  $('#editSinglePathBtn').onclick=()=>toggleTechnicalInput($('#singleFileInput'),$('#editSinglePathBtn'));

  $('#addPartBtn').onclick=()=>openPartDialog();
  $('#addExistingPartBtn').onclick=openExistingPartDialog;
  $('#closeExistingPartBtn').onclick=closeExistingPartDialog;
  $('#cancelExistingPartBtn').onclick=closeExistingPartDialog;
  $('#existingPartSearch').oninput=renderExistingPartList;
  $('#applyExistingPartBtn').onclick=applyExistingPart;
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

  $('#undoStepBtn').onclick=undoStep;
  $('#redoStepBtn').onclick=redoStep;
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
    const mod=e.ctrlKey||e.metaKey;
    const key=e.key.toLowerCase();
    const target=e.target;
    const typing=target && (target.matches?.('input,textarea,select') || target.isContentEditable);

    if(mod && key==='s'){
      e.preventDefault();
      saveDraft('Draft disimpan dengan Ctrl+S');
      return;
    }
    if(mod && key==='e'){
      e.preventDefault();
      openValidationDialog(true);
      return;
    }
    if(!typing && mod && key==='z' && !e.shiftKey){
      e.preventDefault();
      undoStep();
      return;
    }
    if(!typing && mod && ((key==='y') || (key==='z' && e.shiftKey))){
      e.preventDefault();
      redoStep();
    }
  });
}


/* ===================== UNDO / REDO SESSION ===================== */
function initHistory(){
  undoStack=[];
  redoStack=[];
  historyCurrent=clone(data);
  updateUndoRedoButtons();
}

function trackHistoryChange(){
  if(historyLocked || !data?.items)return;
  if(!historyCurrent){
    historyCurrent=clone(data);
    updateUndoRedoButtons();
    return;
  }
  const before=JSON.stringify(historyCurrent);
  const now=JSON.stringify(data);
  if(before===now)return;
  undoStack.push(clone(historyCurrent));
  if(undoStack.length>120)undoStack.shift();
  historyCurrent=clone(data);
  redoStack=[];
  updateUndoRedoButtons();
}

function updateUndoRedoButtons(){
  const u=$('#undoStepBtn');
  const r=$('#redoStepBtn');
  if(u)u.disabled=undoStack.length===0;
  if(r)r.disabled=redoStack.length===0;
}

function applyHistorySnapshot(snapshot,message){
  historyLocked=true;
  data=clone(snapshot);
  historyCurrent=clone(snapshot);
  if(selectedId && !data.items.some(x=>x.id===selectedId))selectedId=null;
  refreshCategoryUI();
  renderList();
  if(selectedId)selectItem(selectedId); else showEmptyEditor();
  dirty=JSON.stringify(data)!==JSON.stringify(original);
  if(dirty)scheduleAutosave(); else localStorage.removeItem(DRAFT_KEY);
  updateAllStatus(dirty,message);
  historyLocked=false;
  updateUndoRedoButtons();
}

function undoStep(){
  if(!undoStack.length){
    toast('Tidak ada langkah yang bisa di-Undo.','warn');
    return;
  }
  redoStack.push(clone(historyCurrent||data));
  const snapshot=undoStack.pop();
  applyHistorySnapshot(snapshot,'Undo satu langkah');
}

function redoStep(){
  if(!redoStack.length){
    toast('Tidak ada langkah yang bisa di-Redo.','warn');
    return;
  }
  undoStack.push(clone(historyCurrent||data));
  const snapshot=redoStack.pop();
  applyHistorySnapshot(snapshot,'Redo satu langkah');
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
  return data.items.reduce((n,x)=>{
    if(x.type==='single')return n+(x.file?1:0);
    return n+(x.parts||[]).filter(p=>!p.itemId&&p.file).length;
  },0);
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
  trackHistoryChange();
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
    pdf:snapshot.items.reduce((n,x)=>n+(x.type==='single'?(x.file?1:0):(x.parts||[]).filter(p=>!p.itemId&&p.file).length),0),
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
      trackHistoryChange();
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
function setExplorerView(view){
  explorerView=view==='list'?'list':'grid';
  localStorage.setItem('amaliyah:admin:explorer:view',explorerView);
  $('#gridViewBtn')?.classList.toggle('active',explorerView==='grid');
  $('#listViewBtn')?.classList.toggle('active',explorerView==='list');
  renderList();
}

function explorerParentMap(){
  const map=new Map();
  data.items.forEach(parent=>{
    if(parent.type==='group'){
      (parent.parts||[]).forEach(part=>{
        if(part.itemId)map.set(part.itemId,parent.id);
      });
    }
  });
  return map;
}

function explorerRoots(category){
  const parents=explorerParentMap();
  return data.items.filter(x=>
    !x.hidden && !parents.has(x.id) && (!category || x.category===category)
  );
}

function findExplorerParent(itemId){
  const pid=explorerParentMap().get(itemId);
  return pid?data.items.find(x=>x.id===pid)||null:null;
}

function renderExplorerBreadcrumb(){
  const host=$('#explorerBreadcrumb');
  if(!host)return;
  const crumbs=[{label:'Bacaan',kind:'root'}];
  if(explorerCategory)crumbs.push({label:explorerCategory,kind:'category'});
  if(explorerItemId){
    const chain=[];
    let current=data.items.find(x=>x.id===explorerItemId)||null;
    const guard=new Set();
    while(current && !guard.has(current.id)){
      guard.add(current.id);chain.unshift(current);current=findExplorerParent(current.id);
    }
    chain.forEach(item=>crumbs.push({label:item.title||item.id,kind:'item',id:item.id}));
  }
  host.innerHTML=crumbs.map((c,i)=>{
    const last=i===crumbs.length-1;
    return `${i?'<span class="crumb-sep">›</span>':''}<button type="button" class="crumb ${last?'current':''}" data-crumb-kind="${c.kind}" ${c.id?`data-crumb-id="${esc(c.id)}"`:''}>${esc(c.label)}</button>`;
  }).join('');
  $$('[data-crumb-kind]',host).forEach(btn=>btn.onclick=()=>{
    const kind=btn.dataset.crumbKind;
    if(kind==='root'){explorerCategory='';explorerItemId=null;$('#categoryFilter').value='';}
    else if(kind==='category'){explorerItemId=null;$('#categoryFilter').value=explorerCategory;}
    else explorerItemId=btn.dataset.crumbId;
    selectedId=null;showEmptyEditor();renderList();
  });
}

function openExplorerItem(id){
  const item=data.items.find(x=>x.id===id);
  if(!item)return;
  if(item.type==='single'){
    selectItem(id);
    return;
  }
  explorerItemId=id;
  selectedId=id;
  selectItem(id);
  renderList();
}

function explorerCardForItem(x,index){
  const isFolder=x.type!=='single';
  const count=x.type==='single'?`${Math.max(1,Number(x.pages)||1)} hal.`:`${(x.parts||[]).length} isi`;
  return `<div class="explorer-entry ${isFolder?'is-folder':'is-file'} ${x.id===selectedId?'active':''}" draggable="${!x.hidden}" data-id="${esc(x.id)}" data-main-index="${index}">
    <button class="explorer-open" type="button" data-open-explorer="${esc(x.id)}" title="${isFolder?'Buka folder':'Edit bacaan'}">
      <span class="explorer-icon">${isFolder?(x.type==='group'?'▰':'▣'):'▤'}</span>
      <span class="explorer-entry-copy"><b>${esc(x.title||'(Tanpa judul)')}</b><small>${esc(x.type)} • ${esc(count)}</small></span>
    </button>
    <div class="explorer-entry-actions">
      <button type="button" data-edit-explorer="${esc(x.id)}" title="Edit">✎</button>
      ${!x.hidden?`<button type="button" data-main-up="${index}" title="Naik">↑</button><button type="button" data-main-down="${index}" title="Turun">↓</button>`:''}
    </div>
  </div>`;
}

function explorerCardForPart(parent,p,i){
  if(p.itemId){
    const child=data.items.find(x=>x.id===p.itemId);
    return child?explorerCardForItem(child,data.items.indexOf(child)):'';
  }
  return `<div class="explorer-entry is-file part-file" data-part-index="${i}">
    <button class="explorer-open" type="button" data-edit-part-index="${i}">
      <span class="explorer-icon">▤</span>
      <span class="explorer-entry-copy"><b>${esc(p.title||'(Tanpa judul)')}</b><small>${Math.max(1,Number(p.pages)||1)} hal. • PDF</small></span>
    </button>
    <div class="explorer-entry-actions"><button type="button" data-edit-part-index="${i}" title="Edit">✎</button></div>
  </div>`;
}

function renderList(){
  const q=$('#searchInput').value.trim().toLowerCase();
  const catFilter=$('#categoryFilter').value;
  const type=$('#typeFilter').value;
  const list=$('#itemList');
  list.className=`item-list explorer-view explorer-${explorerView}`;
  $('#gridViewBtn')?.classList.toggle('active',explorerView==='grid');
  $('#listViewBtn')?.classList.toggle('active',explorerView==='list');

  if(catFilter && catFilter!==explorerCategory && !explorerItemId)explorerCategory=catFilter;
  renderExplorerBreadcrumb();

  let html='';
  if(!explorerCategory && !explorerItemId && !q && !type){
    const cats=categories();
    html=cats.map(c=>`<div class="explorer-entry is-folder category-folder"><button class="explorer-open" type="button" data-open-category="${esc(c)}"><span class="explorer-icon">▰</span><span class="explorer-entry-copy"><b>${esc(c)}</b><small>${explorerRoots(c).length} bacaan</small></span></button></div>`).join('');
  }else if(explorerItemId){
    const parent=data.items.find(x=>x.id===explorerItemId);
    if(!parent){explorerItemId=null;return renderList();}
    const entries=(parent.parts||[]).map((p,i)=>({p,i})).filter(({p})=>{
      const child=p.itemId?data.items.find(x=>x.id===p.itemId):null;
      const hay=[p.title,p.id,p.file,child?.title,child?.type].join(' ').toLowerCase();
      return (!q||hay.includes(q)) && (!type||child?.type===type || (!child && type==='single'));
    });
    html=entries.map(({p,i})=>explorerCardForPart(parent,p,i)).join('');
    if(!html)html='<div class="list-empty">Folder ini belum memiliki isi yang cocok.</div>';
  }else{
    const category=explorerCategory||catFilter;
    let roots=explorerRoots(category);
    roots=roots.filter(x=>{
      const hay=[x.title,x.id,x.category,x.type,...(x.parts||[]).flatMap(p=>[p.title,p.id,p.file])].join(' ').toLowerCase();
      return (!q||hay.includes(q)) && (!type||x.type===type);
    });
    html=roots.map(x=>explorerCardForItem(x,data.items.indexOf(x))).join('');
    if(!html)html='<div class="list-empty">Tidak ada bacaan yang cocok.</div>';
  }
  list.innerHTML=html;

  $$('[data-open-category]',list).forEach(btn=>btn.onclick=()=>{explorerCategory=btn.dataset.openCategory;explorerItemId=null;$('#categoryFilter').value=explorerCategory;selectedId=null;showEmptyEditor();renderList();});
  $$('[data-open-explorer]',list).forEach(btn=>btn.onclick=()=>openExplorerItem(btn.dataset.openExplorer));
  $$('[data-edit-explorer]',list).forEach(btn=>btn.onclick=e=>{e.stopPropagation();selectItem(btn.dataset.editExplorer);});
  $$('[data-edit-part-index]',list).forEach(btn=>btn.onclick=e=>{e.stopPropagation();const i=Number(btn.dataset.editPartIndex);const parent=data.items.find(x=>x.id===explorerItemId);if(parent){selectedId=parent.id;selectItem(parent.id);openPartDialog(i);}});

  // Double click folder = open; single click = select/edit.
  $$('.explorer-entry[data-id]',list).forEach(row=>{
    row.ondblclick=()=>{const id=row.dataset.id;const item=data.items.find(x=>x.id===id);if(item?.type!=='single')openExplorerItem(id);};
    if(row.getAttribute('draggable')==='true'){
      row.addEventListener('dragstart',e=>{mainDragIndex=Number(row.dataset.mainIndex);row.classList.add('dragging');try{e.dataTransfer.effectAllowed='move'}catch{}});
      row.addEventListener('dragend',()=>{mainDragIndex=null;row.classList.remove('dragging');});
      row.addEventListener('dragover',e=>{e.preventDefault();row.classList.add('drag-over');});
      row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
      row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('drag-over');const to=Number(row.dataset.mainIndex);if(mainDragIndex!==null&&mainDragIndex!==to)moveMainItem(mainDragIndex,to);});
    }
  });
  $$('[data-main-up]',list).forEach(btn=>btn.onclick=e=>{e.stopPropagation();moveMainItem(Number(btn.dataset.mainUp),Number(btn.dataset.mainUp)-1);});
  $$('[data-main-down]',list).forEach(btn=>btn.onclick=e=>{e.stopPropagation();moveMainItem(Number(btn.dataset.mainDown),Number(btn.dataset.mainDown)+1);});

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

  $('#singleFields').classList.toggle('hidden',x.type!=='single');
  $('#partsSection').classList.toggle('hidden',x.type==='single');
  $('#addExistingPartBtn').classList.toggle('hidden',x.type!=='collection');

  if(x.type==='single'){
    $('#singleFileInput').value=x.file||'';
    $('#singleFileInput').readOnly=true;
    $('#editSinglePathBtn').textContent='Edit teknis';
    $('#singlePagesInput').value=Math.max(1,Number(x.pages)||1);
    $('#singlePdfPicker').value='';
    $('#singlePdfName').textContent=x.file?basename(x.file):'Belum memilih PDF';
    $('#singlePageStatus').textContent=x.file
      ? `${Math.max(1,Number(x.pages)||1)} halaman tersimpan • akan diperbarui otomatis saat memilih PDF baru.`
      : 'Jumlah halaman akan dibaca otomatis dari PDF.';
    $('#singleTechnicalDetails').open=false;
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
  $('#singlePdfName').textContent=f.name;
  $('#singlePageStatus').textContent='Mendeteksi jumlah halaman…';
  x.file=file;
  updateSingleR2Key();

  const detected=await detectPdfPages(f);
  if(detected){
    $('#singlePagesInput').value=detected;
    x.pages=detected;
    $('#singlePageStatus').textContent=`${detected} halaman terdeteksi otomatis.`;
    $('#singleTechnicalDetails').open=false;
  }else{
    $('#singlePageStatus').textContent='Deteksi halaman gagal. Buka koreksi halaman lalu isi jumlah yang benar.';
    $('#singleTechnicalDetails').open=true;
    setTimeout(()=>$('#singlePagesInput')?.focus(),20);
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

  list.innerHTML=parts.map((p,i)=>{
    if(p.itemId){
      const child=data.items.find(x=>x.id===p.itemId);
      return `<div class="part-row nested-ref-row" data-part-index="${i}">
        <span class="drag-handle">▰</span>
        <span class="part-num">${String(i+1).padStart(2,'0')}</span>
        <span class="part-copy"><b>${esc(child?.title||p.title||'(Folder hilang)')}</b><small>${child?`${esc(child.type)} • folder Explorer`:'Referensi tidak ditemukan'}</small></span>
        <span class="part-actions"><button type="button" data-open-child="${esc(p.itemId)}">Buka</button><button type="button" data-delete-ref="${i}">Hapus Ref</button></span>
      </div>`;
    }
    return `
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
  `;}).join('');

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
  $$('[data-open-child]',list).forEach(btn=>btn.onclick=()=>{explorerItemId=btn.dataset.openChild;selectedId=btn.dataset.openChild;selectItem(btn.dataset.openChild);renderList();});
  $$('[data-delete-ref]',list).forEach(btn=>btn.onclick=async()=>{
    const i=Number(btn.dataset.deleteRef);
    const ref=x.parts?.[i];
    if(!ref)return;
    const ok=await confirmInternal('Hapus referensi folder?','Folder anak tetap ada di data, hanya tautannya dari Group ini yang dihapus.','Hapus Ref','Batal');
    if(!ok)return;
    x.parts.splice(i,1);markDirty('Referensi folder dihapus');renderParts();renderList();
  });
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
  $('#partPageStatus').textContent=p?.file
    ? `${Math.max(1,Number(p.pages)||1)} halaman tersimpan • otomatis saat memilih PDF baru.`
    : 'Jumlah halaman akan dibaca otomatis dari PDF.';
  $('#partTechnicalDetails').open=false;
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
  $('#partPdfName').textContent=f.name;
  $('#partPageStatus').textContent='Mendeteksi jumlah halaman…';

  if(!$('#partTitleInput').value.trim()){
    $('#partTitleInput').value=titleFromFilename(f.name);
  }

  if(editingPartIndex<0){
    $('#partIdInput').value=uniquePartId(slugify($('#partTitleInput').value));
  }

  const detected=await detectPdfPages(f);
  if(detected){
    $('#partPagesInput').value=detected;
    $('#partPageStatus').textContent=`${detected} halaman terdeteksi otomatis.`;
    $('#partTechnicalDetails').open=false;
  }else{
    $('#partPageStatus').textContent='Deteksi halaman gagal. Isi koreksi jumlah halaman pada Detail teknis.';
    $('#partTechnicalDetails').open=true;
    setTimeout(()=>$('#partPagesInput')?.focus(),20);
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


/* ===================== AMBIL DARI DAFTAR BACAAN ===================== */
function openExistingPartDialog(){
  const target=getSelected();
  if(!target || target.type!=='collection'){
    toast('Fitur ini digunakan saat mengedit Collection.','warn');
    return;
  }
  existingPartSourceId=null;
  $('#existingPartSearch').value='';
  $('#existingPartModeBox').classList.add('hidden');
  $('#applyExistingPartBtn').disabled=true;
  const moveRadio=document.querySelector('input[name="existingPartMode"][value="move"]');
  if(moveRadio)moveRadio.checked=true;
  renderExistingPartList();
  $('#existingPartDialog').showModal();
  setTimeout(()=>$('#existingPartSearch').focus(),40);
}

function closeExistingPartDialog(){
  existingPartSourceId=null;
  $('#existingPartDialog').close();
}

function eligibleExistingParts(){
  const target=getSelected();
  if(!target)return[];
  const q=$('#existingPartSearch').value.trim().toLowerCase();
  return data.items.filter(x=>
    x.id!==target.id &&
    x.type==='single' &&
    (!q || [x.title,x.id,x.category,x.file].join(' ').toLowerCase().includes(q))
  );
}

function renderExistingPartList(){
  const list=$('#existingPartList');
  const items=eligibleExistingParts();
  if(!items.length){
    list.innerHTML='<div class="existing-part-empty">Tidak ada bacaan Single yang cocok.</div>';
    return;
  }
  list.innerHTML=items.map(x=>`
    <button class="existing-part-row ${existingPartSourceId===x.id?'selected':''}" type="button" data-existing-id="${esc(x.id)}">
      <span class="existing-icon">${esc(x.icon||'◈')}</span>
      <span class="existing-copy">
        <b>${esc(x.title||'(Tanpa judul)')}</b>
        <small>${esc(x.category||'Tanpa kategori')} • ${esc(basename(x.file||''))} • ${Math.max(1,Number(x.pages)||1)} hal.</small>
      </span>
    </button>
  `).join('');
  $$('[data-existing-id]',list).forEach(btn=>{
    btn.onclick=()=>{
      existingPartSourceId=btn.dataset.existingId;
      const source=data.items.find(x=>x.id===existingPartSourceId);
      $('#existingPartSelectedTitle').textContent=source?.title||'—';
      $('#existingPartModeBox').classList.remove('hidden');
      $('#applyExistingPartBtn').disabled=!source;
      renderExistingPartList();
    };
  });
}

async function applyExistingPart(){
  const target=getSelected();
  const source=data.items.find(x=>x.id===existingPartSourceId);
  if(!target || target.type!=='collection' || !source || source.type!=='single')return;

  const mode=document.querySelector('input[name="existingPartMode"]:checked')?.value||'move';
  const action=mode==='move'?'Pindahkan':'Salin';
  const ok=await confirmInternal(
    `${action} ke Collection?`,
    mode==='move'
      ? `"${source.title}" akan dihapus dari daftar utama dan menjadi bagian dari "${target.title}". PDF tidak diunggah ulang.`
      : `"${source.title}" akan tetap berada di daftar utama dan salinannya menjadi bagian dari "${target.title}".`,
    action,
    'Batal'
  );
  if(!ok)return;

  createBackup(`Sebelum ${action.toLowerCase()} ${source.title} ke ${target.title}`);

  const partId=mode==='move'
    ? source.id
    : uniquePartId(`${source.id}-bagian`);

  target.parts=Array.isArray(target.parts)?target.parts:[];
  target.parts.push({
    id:partId,
    title:source.title,
    file:source.file||'',
    pages:Math.max(1,Number(source.pages)||1)
  });

  if(mode==='move'){
    data.items=data.items.filter(x=>x.id!==source.id);
    selectedId=target.id;
  }

  closeExistingPartDialog();
  refreshCategoryUI();
  markDirty(mode==='move'?'Bacaan dipindahkan ke Collection':'Bacaan disalin ke Collection');
  selectItem(target.id);
  toast(`${source.title} ${mode==='move'?'dipindahkan':'disalin'} ke ${target.title}.`,'ok');
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
  $('#batchTitleField').classList.toggle('hidden',mode==='singles'||mode==='folder-tree');
  $('#batchTitleInput').disabled=mode==='folder-tree';
}

async function handleBatchFolder(e){
  const files=[...(e.target.files||[])].filter(f=>/\.pdf$/i.test(f.name));
  if(!files.length){toast('Folder tidak berisi PDF.','warn');return;}
  $('#batchModeInput').value='folder-tree';
  updateBatchModeUI();
  batchEntries=files.map(f=>({
    file:f,
    filename:safePdfFilename(f.name),
    title:titleFromFilename(f.name),
    pages:null,
    detecting:true,
    detected:false,
    relativePath:(f.webkitRelativePath||f.name).replace(/\\/g,'/')
  })).sort((a,b)=>naturalCompare(a.relativePath,b.relativePath));
  const root=(batchEntries[0].relativePath.split('/')[0]||'Folder');
  $('#batchTitleInput').value=root.replace(/[_-]+/g,' ');
  renderBatchReview();
  e.target.value='';
  for(const entry of batchEntries){
    const detected=await detectPdfPages(entry.file);
    entry.detecting=false;
    if(detected){entry.pages=detected;entry.detected=true;}
    renderBatchReview();
  }
}

function folderTreePlan(){
  const root={name:'',path:'',folders:new Map(),files:[]};
  for(const entry of batchEntries){
    const parts=(entry.relativePath||entry.filename).split('/').filter(Boolean);
    const fileName=parts.pop();
    let node=root;
    for(const seg of parts){
      if(!node.folders.has(seg))node.folders.set(seg,{name:seg,path:node.path?`${node.path}/${seg}`:seg,folders:new Map(),files:[]});
      node=node.folders.get(seg);
    }
    node.files.push({...entry,filename:safePdfFilename(fileName)});
  }
  // webkitRelativePath includes selected root folder. Collapse technical root container only.
  const top=[...root.folders.values()];
  return top.length===1 && root.files.length===0 ? top[0] : root;
}

function treeNodeTitle(node){return String(node.name||'Bacaan').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()||'Bacaan';}

function applyFolderTreeImport(category){
  const tree=folderTreePlan();
  const created=[];
  const usedIds=new Set([...data.items.map(x=>x.id),...allPartIds()]);
  const folderBase=categoryFolder(category);

  function uniqueGlobal(base){let id=base||'folder';let n=2;while(usedIds.has(id))id=`${base}-${n++}`;usedIds.add(id);return id;}

  function build(node,parentGroupId=null,isRoot=false){
    const title=treeNodeTitle(node);
    let folderSegments=(node.path||title).split('/').map(slugify).filter(Boolean);
    if(folderSegments[0]===folderBase)folderSegments=folderSegments.slice(1);
    const folderPath=folderSegments.join('/')||slugify(title);
    const childFolders=[...node.folders.values()].sort((a,b)=>naturalCompare(a.name,b.name));
    const leaf=childFolders.length===0;
    const id=uniqueGlobal(slugify(node.path||title));
    const item={id,title,category,type:leaf?'collection':'group',icon:'◈',parts:[]};
    if(parentGroupId)item.hidden=true;

    if(leaf){
      const files=[...node.files].sort((a,b)=>naturalCompare(a.relativePath||a.filename,b.relativePath||b.filename));
      for(const entry of files){
        let pid=uniqueGlobal(`${id}-${slugify(entry.title)}`);
        item.parts.push({id:pid,title:entry.title.trim(),file:`assets/pdf-v2/${folderBase}/${folderPath}/${entry.filename}`,pages:Math.max(1,Math.floor(Number(entry.pages)||1))});
      }
    }else{
      // PDF langsung di folder bercabang: jadikan Single tersembunyi dan referensikan dari Group.
      for(const entry of [...node.files].sort((a,b)=>naturalCompare(a.filename,b.filename))){
        const sid=uniqueGlobal(`${id}-${slugify(entry.title)}`);
        const single={id:sid,title:entry.title.trim(),category,type:'single',icon:'◈',file:`assets/pdf-v2/${folderBase}/${folderPath}/${entry.filename}`,pages:Math.max(1,Math.floor(Number(entry.pages)||1)),hidden:true};
        data.items.push(single);created.push(single);
        item.parts.push({id:uniqueGlobal(`${id}-ref-${sid}`),title:single.title,itemId:sid});
      }
      for(const child of childFolders){
        const childItem=build(child,id,false);
        item.parts.push({id:uniqueGlobal(`${id}-ref-${childItem.id}`),title:childItem.title,itemId:childItem.id});
      }
    }
    data.items.push(item);created.push(item);
    return item;
  }

  const rootItem=build(tree,null,true);
  // Karena build child lebih dulu, root ditambahkan terakhir; tetap jadikan root terlihat.
  rootItem.hidden=false;
  return {rootItem,created};
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
    pages:null,
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

  if(mode==='folder-tree'){
    const rel=(entry.relativePath||entry.filename).split('/').filter(Boolean);
    if(rel.length>1)rel.shift();
    return `assets/pdf-v2/${folder}/${rel.map((seg,i)=>i===rel.length-1?safePdfFilename(seg):slugify(seg)).join('/')}`;
  }

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
    const k=(($('#batchModeInput').value==='folder-tree'?(e.relativePath||e.filename):e.filename)).toLowerCase();
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
          <small>${esc(entry.relativePath||entry.filename)}${duplicate?' • Nama file duplikat':''}${entry.detecting?' • mendeteksi halaman…':entry.detected?` • ${entry.pages} hal. otomatis`:' • deteksi halaman gagal'}</small>
          <code>${esc(r2Key(batchPathFor(entry,i)))}</code>
        </div>
        ${(!entry.detecting&&!entry.detected)?`<label class="batch-pages batch-pages-manual">
          <span>Koreksi hal.</span>
          <input type="number" min="1" value="${Number(entry.pages)||''}" data-batch-pages="${i}" placeholder="1">
        </label>`:''}
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
      if(batchEntries[i]){
        const n=Math.floor(Number(input.value));
        batchEntries[i].pages=Number.isInteger(n)&&n>0?n:null;
      }
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
    toast('Ada PDF yang belum memiliki judul atau jumlah halaman. Jika deteksi gagal, isi koreksi halaman pada baris tersebut.','error');
    return;
  }

  createBackup('Sebelum Batch Import PDF');

  if(mode==='folder-tree'){
    const result=applyFolderTreeImport(category);
    selectedId=result.rootItem?.id||null;
    explorerCategory=category;
    explorerItemId=null;
    refreshCategoryUI();
    markDirty(`${batchEntries.length} PDF diimpor sebagai struktur folder otomatis`);
    closeBatchDialog();
    renderList();
    if(selectedId)selectItem(selectedId);
    toast('Struktur folder dibuat otomatis: folder bercabang = Group, folder paling bawah = Collection.','ok');
    return;
  }

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
    icon
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
  data.items.forEach(parent=>{
    if(parent.type==='group'&&Array.isArray(parent.parts)){
      parent.parts=parent.parts.filter(p=>p.itemId!==x.id);
    }
  });
  trackHistoryChange();
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

          if(p.itemId){
            if(!data.items.some(x=>x.id===p.itemId)){
              errors.push({...meta,scope:pLabel,message:`Referensi folder tidak ditemukan: ${p.itemId}`,fix:'Hapus referensi ini atau pulihkan item anak yang hilang.',field:'part-ref'});
            }
          }else{
            validateFile(pLabel,p.file,p.pages,errors,warnings,paths,meta);
          }
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
    trackHistoryChange();
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
  initHistory();
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
    initHistory();
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
