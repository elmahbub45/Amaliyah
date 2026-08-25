const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const clone=o=>JSON.parse(JSON.stringify(o));
const DRAFT_KEY='amaliyah:admin:draft:v32';
const BACKUP_KEY='amaliyah:admin:backups:v32';
const MAX_BACKUPS=10;
const VALID_TYPES=new Set(['single','collection','group']);
const CATEGORY_ICON_OPTIONS=window.AMALIYAH_CATEGORY_ICON_OPTIONS||[];
const VALID_CATEGORY_ICONS=new Set(CATEGORY_ICON_OPTIONS.map(option=>option.key));

let original=null;
let data=null;
let selectedId=null;
let editingPartIndex=-1;
let dirty=false;
let mainDragIndex=null;
let partDragIndex=null;
let explorerDragPayload=null;
let workspaceResizeTimer=null;
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
let selectedPartRef=null;
let explorerView=localStorage.getItem('amaliyah:admin:explorer:view:v2361')||'list';
let rebuildEntries=[];
let rebuildPlan=null;
let rebuildCleanupKeys=[];
let rebuildScanToken=0;
let rebuildIgnoredCount=0;
let explorerSelection=new Set();
let explorerSelectionAnchor=null;
let explorerVisibleKeys=[];

// V2.47.0 — Pre-Release Health Check
const HEALTH_PDF_WORKER='https://amaliyah-pdf.elmahbub45.workers.dev';
const HEALTH_QURAN_BASE='https://quran.islam-db.com/data/pages/quranpages_1024/images/';
let healthAbortController=null;
let healthLastReport=null;

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
  selectedPartRef=null;
  renderList();
  updateAllStatus(false,'books.json siap diedit');

  selectedId=null;
  showEmptyEditor();
  requestAnimationFrame(syncWorkspaceHeight);
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
  $('#categoryFilter').addEventListener('change',()=>{resetExplorerSelection();explorerCategory=$('#categoryFilter').value;explorerItemId=null;selectedId=null;showEmptyEditor();renderList();});
  $('#categoryRootBtn').onclick=()=>{resetExplorerSelection();explorerCategory='';explorerItemId=null;selectedId=null;$('#categoryFilter').value='';showEmptyEditor();renderList();};
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

  $('#newFolderBtn').onclick=openNewFolderDialog;
  $('#closeNewFolderBtn').onclick=closeNewFolderDialog;
  $('#cancelNewFolderBtn').onclick=closeNewFolderDialog;
  $('#createNewFolderBtn').onclick=createNewFolder;
  $('#newFolderForm').onsubmit=e=>{e.preventDefault();createNewFolder();};
  $('#renameCategoryBtn').onclick=renameSelectedCategory;
  $('#deleteCategoryBtn').onclick=deleteSelectedCategory;
  $('#categoryNameInput').oninput=()=>showFormError($('#categoryInspectorError'),'');
  $('#categoryIconPicker').onclick=event=>{
    const button=event.target.closest('[data-category-icon]');
    if(button)setSelectedCategoryIcon(button.dataset.categoryIcon);
  };
  $('#categoryIconSearch').oninput=()=>renderCategoryIconPicker(selectedExplorerCategory());

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
  $('#batchTargetInput').onchange=()=>{updateBatchModeUI();renderBatchReview();};
  $('#batchTitleInput').oninput=renderBatchReview;
  $('#applyBatchBtn').onclick=applyBatchImport;

  $('#rebuildCatalogBtn').onclick=openRebuildDialog;
  $('#healthCheckBtn').onclick=openHealthCheckDialog;
  $('#closeHealthCheckBtn').onclick=closeHealthCheckDialog;
  $('#startHealthCheckBtn').onclick=runHealthCheck;
  $('#cancelHealthCheckBtn').onclick=cancelHealthCheck;
  $('#downloadHealthReportBtn').onclick=downloadHealthReport;
  $('#closeRebuildBtn').onclick=closeRebuildDialog;
  $('#cancelRebuildBtn').onclick=closeRebuildDialog;
  $('#rebuildChooseFolderBtn').onclick=()=>$('#rebuildFolderInput').click();
  $('#rebuildFolderInput').onchange=handleRebuildFolder;
  $('#downloadUploadManifestBtn').onclick=downloadRebuildUploadManifest;
  $('#downloadCleanupManifestBtn').onclick=downloadRebuildCleanupManifest;
  $('#downloadRefreshPlanBtn').onclick=downloadRebuildRefreshPlan;
  $('#downloadTechnicalReportBtn').onclick=downloadRebuildTechnicalReport;
  $('#applyRebuildBtn').onclick=applyRebuildCatalog;

  $('#deleteItemBtn').onclick=deleteItem;
  $('#previewBtn').onclick=()=>showItemPreview(getSelected());
  $('#closePreviewBtn').onclick=()=>$('#previewDialog').close();

  $('#titleInput').oninput=()=>patchSelected('title',$('#titleInput').value);
  $('#categoryInput').oninput=()=>patchSelected('category',$('#categoryInput').value);
  $('#locationInput').onchange=moveSelectedByLocation;
  $('#typeInput').onchange=changeType;

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
  $('#partInspectorEditBtn').onclick=()=>{
    const ref=selectedPartRef;
    const parent=ref?data.items.find(x=>x.id===ref.parentId):null;
    if(!parent||!parent.parts?.[ref.index])return;
    selectedId=parent.id;
    openPartDialog(ref.index);
  };

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

  window.addEventListener('resize',()=>{
    clearTimeout(workspaceResizeTimer);
    workspaceResizeTimer=setTimeout(syncWorkspaceHeight,60);
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



function syncWorkspaceHeight(){
  if(window.innerWidth<=1040){
    document.documentElement.style.removeProperty('--admin-workspace-height');
    return;
  }
  const layout=$('.layout');
  const footer=$('.bottom-actions');
  if(!layout||!footer)return;
  const top=Math.max(0,layout.getBoundingClientRect().top);
  const footerHeight=Math.max(64,footer.getBoundingClientRect().height||0);
  const available=Math.max(470,Math.floor(window.innerHeight-top-footerHeight-12));
  document.documentElement.style.setProperty('--admin-workspace-height',`${available}px`);
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
  const drafts=(data.draftCategories||[]).map(x=>String(x||'').trim()).filter(Boolean);
  const used=(data.items||[]).map(x=>String(x.category||'').trim()).filter(Boolean);
  return [...new Set([...declared,...drafts,...used])].sort((a,b)=>a.localeCompare(b,'id'));
}

function inferredCategoryIcon(category=''){
  const text=String(category).toLocaleLowerCase('id-ID');
  if(text.includes('qur'))return 'quran';
  if(text.includes('wirid'))return 'wirid';
  if(text.includes('doa'))return 'doa';
  if(text.includes('maulid'))return 'maulid';
  if(text.includes('dalail'))return 'dalail';
  if(text.includes('syair'))return 'syair';
  if(text.includes('khutbah'))return 'khutbah';
  return 'other';
}

function selectedCategoryIcon(category=''){
  const configured=String(data?.categoryIcons?.[category]||'').toLocaleLowerCase('id-ID');
  return VALID_CATEGORY_ICONS.has(configured)?configured:inferredCategoryIcon(category);
}

function categoryIconSvg(key){
  const option=CATEGORY_ICON_OPTIONS.find(entry=>entry.key===key)||CATEGORY_ICON_OPTIONS[CATEGORY_ICON_OPTIONS.length-1];
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${option.svg}</svg>`;
}

function renderCategoryIconPicker(category=''){
  const picker=$('#categoryIconPicker');
  const preview=$('#categoryIconPreview');
  if(!picker)return;
  const active=selectedCategoryIcon(category);
  const query=String($('#categoryIconSearch')?.value||'').trim().toLocaleLowerCase('id-ID');
  const visible=CATEGORY_ICON_OPTIONS.filter(option=>{
    const haystack=`${option.label} ${option.key} ${option.keywords||''}`.toLocaleLowerCase('id-ID');
    return !query||haystack.includes(query);
  });
  picker.innerHTML=visible.map(option=>`
    <button class="category-icon-choice ${option.key===active?'active':''}" type="button" data-category-icon="${option.key}" aria-pressed="${option.key===active}" title="${esc(option.label)}">
      <span>${categoryIconSvg(option.key)}</span><small>${esc(option.label)}</small>
    </button>`).join('');
  if(preview)preview.innerHTML=categoryIconSvg(active);
  $('#categoryIconEmpty')?.classList.toggle('hidden',visible.length>0);
}

function setSelectedCategoryIcon(key){
  const category=selectedExplorerCategory();
  if(!category||!VALID_CATEGORY_ICONS.has(key))return;
  const previous=selectedCategoryIcon(category);
  if(previous===key && data.categoryIcons?.[category]===key)return;
  if(!data.categoryIcons||typeof data.categoryIcons!=='object'||Array.isArray(data.categoryIcons)){
    data.categoryIcons={};
  }
  data.categoryIcons[category]=key;
  renderCategoryIconPicker(category);
  markDirty(`Ikon kategori “${category}” diubah`);
  toast(`Ikon kategori “${category}” diperbarui.`,'ok');
}

function draftCategoryNames(){
  return [...new Set((data.draftCategories||[]).map(x=>String(x||'').trim()).filter(Boolean))];
}

function isDraftCategory(category){
  const needle=String(category||'').trim().toLocaleLowerCase('id');
  return draftCategoryNames().some(name=>name.toLocaleLowerCase('id')===needle);
}

function refreshDraftCategoryStates(){
  const used=new Set((data.items||[])
    .map(item=>String(item.category||'').trim().toLocaleLowerCase('id'))
    .filter(Boolean));
  const remaining=draftCategoryNames().filter(name=>!used.has(name.toLocaleLowerCase('id')));
  if(remaining.length)data.draftCategories=remaining;
  else delete data.draftCategories;
}

function refreshCategoryUI(){
  const cats=categories();
  $('#categoryFilter').innerHTML=
    '<option value="">Semua kategori</option>'+
    cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');

  $('#categoryOptions').innerHTML=
    cats.map(c=>`<option value="${esc(c)}"></option>`).join('');
}

function renderCategoryTree(){
  const host=$('#categoryTree');
  const root=$('#categoryRootBtn');
  if(!host || !root || !data)return;

  root.classList.toggle('active',!explorerCategory && !explorerItemId);
  const rootCount=$('#categoryRootCount');
  if(rootCount)rootCount.textContent=String((data.items||[]).filter(x=>!x.hidden).length);

  const chain=[];
  if(explorerItemId){
    let current=data.items.find(x=>x.id===explorerItemId)||null;
    const guard=new Set();
    while(current && !guard.has(current.id)){
      guard.add(current.id);
      chain.unshift(current);
      current=findExplorerParent(current.id);
    }
  }

  host.innerHTML=categories().map(category=>{
    const active=category===explorerCategory;
    const roots=explorerRoots(category);
    const nested=active && chain.length
      ? `<div class="tree-branch">${chain.map((item,i)=>`
          <button type="button" class="category-tree-row tree-child ${item.id===explorerItemId?'active':''}" data-tree-item="${esc(item.id)}" data-drop-item="${esc(item.id)}" style="--tree-depth:${i+1}">
            <span class="tree-folder ${item.type==='single'?'tree-file':item.type==='collection'?'tree-collection':''}" aria-hidden="true"></span>
            <span class="tree-label"><b>${esc(item.title||item.id)}</b><small>${esc(item.type)}</small></span>
          </button>`).join('')}</div>`
      : '';
    const draft=isDraftCategory(category);
    return `<div class="tree-category-wrap">
      <button type="button" class="category-tree-row ${draft?'is-draft-category':''} ${active&&!explorerItemId?'active':''}" data-tree-category="${esc(category)}" data-drop-category="${esc(category)}">
        <span class="tree-folder" aria-hidden="true"></span>
        <span class="tree-label"><b>${esc(category)}</b>${draft?'<small>Draft kosong</small>':''}</span>
        <span class="tree-count" aria-label="${roots.length} item">${roots.length}</span>
      </button>${nested}
    </div>`;
  }).join('');

  $$('[data-tree-category]',host).forEach(btn=>btn.onclick=()=>{
    resetExplorerSelection();
    explorerCategory=btn.dataset.treeCategory;
    explorerItemId=null;
    selectedId=null;
    $('#categoryFilter').value=explorerCategory;
    showEmptyEditor();
    renderList();
  });

  $$('[data-tree-item]',host).forEach(btn=>btn.onclick=()=>{
    resetExplorerSelection();
    explorerItemId=btn.dataset.treeItem;
    selectedId=null;
    showEmptyEditor();
    renderList();
  });

  bindExplorerDropTarget(root,{kind:'root'});
  $$('[data-drop-category]',host).forEach(btn=>bindExplorerDropTarget(btn,{kind:'category',category:btn.dataset.dropCategory}));
  $$('[data-drop-item]',host).forEach(btn=>bindExplorerDropTarget(btn,{kind:'item',itemId:btn.dataset.dropItem}));
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

function refreshDraftFolderType(item){
  if(!item?.draftFolder)return;
  const parts=Array.isArray(item.parts)?item.parts:[];
  if(!parts.length){
    item.type='group';
    return;
  }
  item.type=parts.some(part=>part.itemId)?'group':'collection';
  delete item.draftFolder;
}

function refreshDraftFolderTypes(){
  (data?.items||[]).forEach(refreshDraftFolderType);
}

function normalizeExport(){
  refreshDraftFolderTypes();
  data.items.forEach(item=>{
    delete item.draftFolder;
    delete item.icon;
    (item.parts||[]).forEach(part=>delete part.icon);
  });
  delete data.draftCategories;
  syncCategoriesForExport();
  const activeCategories=new Set((data.categories||[]).filter(category=>category&&category!=='Semua'));
  const normalizedIcons={};
  Object.entries(data.categoryIcons||{}).forEach(([category,key])=>{
    if(activeCategories.has(category)&&VALID_CATEGORY_ICONS.has(key))normalizedIcons[category]=key;
  });
  if(Object.keys(normalizedIcons).length)data.categoryIcons=normalizedIcons;
  else delete data.categoryIcons;
  const normalizedAliases={};
  Object.entries(data.categoryAliases||{}).forEach(([previous,current])=>{
    const from=String(previous||'').trim();
    const to=String(current||'').trim();
    if(from&&to&&from!==to&&activeCategories.has(to))normalizedAliases[from]=to;
  });
  if(Object.keys(normalizedAliases).length)data.categoryAliases=normalizedAliases;
  else delete data.categoryAliases;
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
  refreshDraftFolderTypes();
  refreshDraftCategoryStates();
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
function itemSelectionKey(id){return `item:${id}`;}
function partSelectionKey(parentId,index){return `part:${parentId}:${index}`;}
function categorySelectionKey(category){return `category:${category}`;}

function resetExplorerSelection(){
  explorerSelection.clear();
  explorerSelectionAnchor=null;
  explorerVisibleKeys=[];
}

function parseExplorerSelectionKey(key=''){
  if(key.startsWith('item:'))return {kind:'item',id:key.slice(5)};
  if(key.startsWith('category:'))return {kind:'category',category:key.slice(9)};
  if(key.startsWith('part:')){
    const rest=key.slice(5);
    const split=rest.lastIndexOf(':');
    return {kind:'part',parentId:rest.slice(0,split),index:Number(rest.slice(split+1))};
  }
  return {kind:'unknown'};
}

function stableExplorerSelectionEntry(key){
  const ref=parseExplorerSelectionKey(key);
  if(ref.kind==='item')return {kind:'item',itemId:ref.id};
  if(ref.kind==='part'){
    const parent=data.items.find(x=>x.id===ref.parentId);
    const part=parent?.parts?.[ref.index];
    if(part&&!part.itemId)return {
      kind:'part',parentId:ref.parentId,partId:part.id,partIndex:ref.index
    };
  }
  return null;
}

function explorerPayloadForDrag(selectionKey,fallback){
  if(!explorerSelection.has(selectionKey)){
    explorerSelection.clear();
    explorerSelection.add(selectionKey);
    explorerSelectionAnchor=selectionKey;
    syncExplorerSelectionVisuals();
  }
  const entries=[...explorerSelection]
    .map(stableExplorerSelectionEntry)
    .filter(Boolean);
  return entries.length>1?{kind:'multi',entries}:fallback;
}

function currentPartIndex(payload){
  const parent=data.items.find(x=>x.id===payload?.parentId);
  if(!parent||!Array.isArray(parent.parts))return -1;
  if(payload.partId){
    const found=parent.parts.findIndex(part=>part.id===payload.partId);
    if(found>=0)return found;
  }
  return Number(payload.partIndex);
}

function showExplorerSelectionSummary(){
  selectedId=null;
  selectedPartRef=null;
  $('#editorContent').classList.add('hidden');
  $('#partInspector')?.classList.add('hidden');
  $('#categoryInspector')?.classList.add('hidden');
  const empty=$('#emptyEditor');
  empty.classList.remove('hidden');
  const count=explorerSelection.size;
  $('.empty-ornament',empty).textContent=count>1?String(count):'✓';
  $('h2',empty).textContent=count>1?`${count} item dipilih`:'Folder dipilih';
  $('p',empty).textContent=count>1
    ? 'Gunakan Ctrl untuk menambah atau mengurangi pilihan, dan Shift untuk memilih satu rentang.'
    : 'Klik dua kali folder untuk membukanya. Gunakan Ctrl atau Shift untuk memilih beberapa item.';
}

function syncExplorerSelectionVisuals(){
  const list=$('#itemList');
  if(!list)return;
  $$('[data-selection-key]',list).forEach(row=>{
    row.classList.toggle('active',explorerSelection.has(row.dataset.selectionKey));
  });
  const countNode=$('#explorerItemCount');
  if(countNode){
    const total=explorerVisibleKeys.length;
    countNode.textContent=explorerSelection.size
      ? `${total} item • ${explorerSelection.size} dipilih`
      : `${total} item`;
  }
}

function applyExplorerSelection(){
  if(explorerSelection.size!==1){
    showExplorerSelectionSummary();
    return;
  }
  const key=[...explorerSelection][0];
  const ref=parseExplorerSelectionKey(key);
  if(ref.kind==='item'){
    selectItem(ref.id,{preserveExplorerSelection:true,skipListRender:true});
    return;
  }
  if(ref.kind==='part'){
    const parent=data.items.find(x=>x.id===ref.parentId);
    if(parent?.parts?.[ref.index]){
      showPartInspector(parent,ref.index,{preserveExplorerSelection:true,skipListRender:true});
      return;
    }
  }
  if(ref.kind==='category'){
    showCategoryInspector(ref.category);
    return;
  }
  showExplorerSelectionSummary();
}

function handleExplorerSelectionClick(row,event){
  const key=row?.dataset.selectionKey;
  if(!key)return;
  const ctrl=event.ctrlKey||event.metaKey;
  const shift=event.shiftKey;
  const visible=explorerVisibleKeys;

  const rangeAnchor=explorerSelectionAnchor&&visible.includes(explorerSelectionAnchor)
    ? explorerSelectionAnchor
    : visible.find(value=>explorerSelection.has(value));

  if(shift && rangeAnchor && visible.includes(rangeAnchor)){
    const from=visible.indexOf(rangeAnchor);
    const to=visible.indexOf(key);
    if(!ctrl)explorerSelection.clear();
    visible.slice(Math.min(from,to),Math.max(from,to)+1).forEach(value=>explorerSelection.add(value));
    explorerSelectionAnchor=rangeAnchor;
  }else if(ctrl){
    if(explorerSelection.has(key))explorerSelection.delete(key);
    else explorerSelection.add(key);
    explorerSelectionAnchor=key;
  }else{
    explorerSelection.clear();
    explorerSelection.add(key);
    explorerSelectionAnchor=key;
  }

  if(!explorerSelection.size){
    explorerSelectionAnchor=null;
    selectedId=null;
    showEmptyEditor();
    syncExplorerSelectionVisuals();
    return;
  }
  applyExplorerSelection();
  syncExplorerSelectionVisuals();
}

function setExplorerView(view){
  explorerView=view==='list'?'list':'grid';
  localStorage.setItem('amaliyah:admin:explorer:view:v2361',explorerView);
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

function detachItemFromGroups(itemId){
  let changed=false;
  data.items.forEach(parent=>{
    if(parent.type!=='group'||!Array.isArray(parent.parts))return;
    const before=parent.parts.length;
    parent.parts=parent.parts.filter(p=>p.itemId!==itemId);
    if(parent.parts.length!==before)changed=true;
  });
  return changed;
}

function isExplorerDescendant(candidateId,ancestorId){
  let current=findExplorerParent(candidateId);
  const guard=new Set();
  while(current && !guard.has(current.id)){
    if(current.id===ancestorId)return true;
    guard.add(current.id);
    current=findExplorerParent(current.id);
  }
  return false;
}

function explorerDragStart(payload,row,e){
  explorerDragPayload=payload;
  row?.classList.add('drag-source');
  document.body.classList.add('explorer-dragging');
  try{
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',JSON.stringify(payload));
  }catch{}
}

function explorerDragEnd(){
  explorerDragPayload=null;
  document.body.classList.remove('explorer-dragging');
  $$('.drag-source,.drop-target,.drop-invalid').forEach(el=>el.classList.remove('drag-source','drop-target','drop-invalid'));
}

function canDropOnCategory(payload){
  if(payload?.kind==='multi')return payload.entries?.length>0&&payload.entries.every(canDropOnCategory);
  return !!payload && (payload.kind==='item'||payload.kind==='part');
}

function canDropOnRoot(payload){
  if(payload?.kind==='multi')return false;
  return !!payload && payload.kind==='item';
}

function canDropOnItem(payload,target){
  if(!payload||!target)return false;
  if(payload.kind==='multi')return false;
  if(payload.kind==='item'){
    if(payload.itemId===target.id)return false;
    const source=data.items.find(x=>x.id===payload.itemId);
    if(!source)return false;
    if(target.type==='collection')return source.type==='single';
    if(target.type==='group'){
      if(source.type==='group' && isExplorerDescendant(target.id,source.id))return false;
      return true;
    }
    return !findExplorerParent(source.id) && !findExplorerParent(target.id);
  }
  if(payload.kind==='part'){
    if(target.type==='single')return false;
    return true;
  }
  return false;
}

function bindExplorerDropTarget(el,descriptor){
  if(!el)return;
  if(el.dataset.explorerDropBound==='1')return;
  el.dataset.explorerDropBound='1';
  const targetItem=descriptor.itemId?data.items.find(x=>x.id===descriptor.itemId):null;
  const allowed=()=>descriptor.kind==='category'
    ?canDropOnCategory(explorerDragPayload)
    :descriptor.kind==='root'
      ?canDropOnRoot(explorerDragPayload)
      :canDropOnItem(explorerDragPayload,targetItem);

  el.addEventListener('dragenter',e=>{
    if(!explorerDragPayload)return;
    if(allowed()){
      e.preventDefault();
      el.classList.add('drop-target');
    }else{
      el.classList.add('drop-invalid');
    }
  });
  el.addEventListener('dragover',e=>{
    if(!explorerDragPayload)return;
    if(allowed()){
      e.preventDefault();
      try{e.dataTransfer.dropEffect='move'}catch{}
      el.classList.add('drop-target');
      el.classList.remove('drop-invalid');
    }
  });
  el.addEventListener('dragleave',e=>{
    if(el.contains(e.relatedTarget))return;
    el.classList.remove('drop-target','drop-invalid');
  });
  el.addEventListener('drop',async e=>{
    if(!explorerDragPayload)return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drop-target','drop-invalid');
    const payload=clone(explorerDragPayload);
    if(descriptor.kind==='category')await dropExplorerOnCategory(payload,descriptor.category);
    else if(descriptor.kind==='root')await dropExplorerOnRoot(payload);
    else await dropExplorerOnItem(payload,descriptor.itemId);
    explorerDragEnd();
  });
}

async function dropExplorerOnCategory(payload,category){
  if(!canDropOnCategory(payload)){
    toast('Item tersebut tidak dapat dipindahkan ke folder ini.','warn');
    return;
  }

  if(payload.kind==='multi'){
    await dropExplorerMultipleOnCategory(payload.entries,category);
    return;
  }

  // File PDF/part yang dikeluarkan dari Collection/Group menjadi Single.
  if(payload.kind==='part'){
    const sourceParent=data.items.find(x=>x.id===payload.parentId);
    const sourceIndex=currentPartIndex(payload);
    const part=sourceParent?.parts?.[sourceIndex];
    if(!sourceParent||!part||part.itemId){
      toast('Folder referensi tidak dapat diubah menjadi Single dengan cara ini.','warn');
      return;
    }
    const ok=await confirmInternal(
      'Keluarkan menjadi Single?',
      `"${part.title}" akan dikeluarkan dari "${sourceParent.title}" dan menjadi bacaan Single di folder "${category}". PDF tidak diunggah ulang.`,
      'Pindahkan',
      'Batal'
    );
    if(!ok)return;
    createBackup(`Sebelum mengeluarkan ${part.title} dari ${sourceParent.title}`);
    const moved=removeDirectPart(sourceParent,sourceIndex);
    if(!moved)return;
    let newId=String(moved.id||slugify(moved.title));
    if(data.items.some(x=>x.id===newId))newId=uniqueItemId(newId);
    const {itemId:_ignoredItemId,...partData}=moved;
    const single={
      ...partData,
      id:newId,
      title:moved.title||newId,
      category,
      type:'single',
      file:moved.file||'',
      pages:Math.max(1,Number(moved.pages)||1)
    };
    data.items.push(single);
    explorerCategory=category;
    explorerItemId=null;
    selectedPartRef=null;
    selectedId=single.id;
    $('#categoryFilter').value=category;
    markDirty(`${single.title} dikeluarkan menjadi Single di ${category}`);
    renderList();
    selectItem(single.id);
    toast(`${single.title} sekarang menjadi Single di ${category}.`,'ok');
    return;
  }

  const item=data.items.find(x=>x.id===payload.itemId);
  if(!item)return;
  const oldParent=findExplorerParent(item.id);
  const same=!oldParent && !item.hidden && item.category===category;
  if(same)return;

  detachItemFromGroups(item.id);
  item.hidden=false;
  item.category=category;
  explorerCategory=category;
  explorerItemId=null;
  $('#categoryFilter').value=category;
  markDirty(`"${item.title}" dipindahkan ke kategori ${category}`);
  renderList();
  selectItem(item.id);
  toast(`${item.title} dipindahkan ke ${category}.`,'ok');
}

async function dropExplorerMultipleOnCategory(entries,category){
  const movable=(entries||[]).filter(entry=>canDropOnCategory(entry));
  if(!movable.length)return;

  const ok=await confirmInternal(
    'Pindahkan beberapa item?',
    `${movable.length} item yang dipilih akan dipindahkan ke folder kategori “${category}”. PDF dari dalam Collection/Group akan menjadi bacaan Single tanpa mengunggah ulang file.`,
    `Pindahkan ${movable.length} Item`,
    'Batal'
  );
  if(!ok)return;

  createBackup(`Sebelum memindahkan ${movable.length} item ke ${category}`);
  const movedIds=[];

  for(const entry of movable){
    if(entry.kind==='item'){
      const item=data.items.find(x=>x.id===entry.itemId);
      if(!item)continue;
      detachItemFromGroups(item.id);
      item.hidden=false;
      item.category=category;
      movedIds.push(item.id);
      continue;
    }

    if(entry.kind==='part'){
      const sourceParent=data.items.find(x=>x.id===entry.parentId);
      const sourceIndex=currentPartIndex(entry);
      const part=sourceParent?.parts?.[sourceIndex];
      if(!sourceParent||!part||part.itemId)continue;
      const moved=removeDirectPart(sourceParent,sourceIndex);
      if(!moved)continue;
      let newId=String(moved.id||slugify(moved.title));
      if(data.items.some(x=>x.id===newId))newId=uniqueItemId(newId);
      const {itemId:_ignoredItemId,icon:_ignoredIcon,...partData}=moved;
      const single={
        ...partData,
        id:newId,
        title:moved.title||newId,
        category,
        type:'single',
        file:moved.file||'',
        pages:Math.max(1,Number(moved.pages)||1)
      };
      data.items.push(single);
      movedIds.push(single.id);
    }
  }

  if(!movedIds.length){
    toast('Tidak ada item yang dapat dipindahkan.','warn');
    return;
  }

  explorerCategory=category;
  explorerItemId=null;
  selectedId=null;
  selectedPartRef=null;
  $('#categoryFilter').value=category;
  explorerSelection.clear();
  movedIds.forEach(id=>explorerSelection.add(itemSelectionKey(id)));
  explorerSelectionAnchor=itemSelectionKey(movedIds[0]);
  markDirty(`${movedIds.length} item dipindahkan ke kategori ${category}`);
  renderList();
  applyExplorerSelection();
  syncExplorerSelectionVisuals();
  toast(`${movedIds.length} item berhasil dipindahkan ke ${category}.`,'ok');
}

async function dropExplorerOnRoot(payload){
  if(!canDropOnCategory(payload))return;
  const item=data.items.find(x=>x.id===payload.itemId);
  if(!item)return;
  const parent=findExplorerParent(item.id);
  if(!parent&&!item.hidden)return;
  detachItemFromGroups(item.id);
  item.hidden=false;
  explorerItemId=null;
  markDirty(`"${item.title}" dilepas dari folder induk`);
  renderList();
  selectItem(item.id);
  toast(`${item.title} kembali menjadi bacaan utama.`,'ok');
}

function removeDirectPart(parent,index){
  if(!parent||!Array.isArray(parent.parts)||index<0||index>=parent.parts.length)return null;
  return parent.parts.splice(index,1)[0]||null;
}

async function dropExplorerOnItem(payload,targetId){
  const target=data.items.find(x=>x.id===targetId);
  if(!target||!canDropOnItem(payload,target)){
    toast('Item tersebut tidak dapat diletakkan di folder ini.','warn');
    return;
  }

  if(payload.kind==='item'){
    const source=data.items.find(x=>x.id===payload.itemId);
    if(!source)return;

    // Folder kosong mengikuti isi pertamanya: PDF -> Collection, folder -> Group.
    const targetType=target.draftFolder && !(target.parts||[]).length
      ? (source.type==='single'?'collection':'group')
      : target.type;

    if(targetType==='collection'){
      const ok=await confirmInternal(
        'Pindahkan menjadi Bagian?',
        `"${source.title}" akan menjadi bagian dari Collection "${target.title}". PDF tidak diunggah ulang dan ID bagian tetap dipertahankan.`,
        'Pindahkan',
        'Batal'
      );
      if(!ok)return;
      createBackup(`Sebelum drag ${source.title} ke ${target.title}`);
      target.type='collection';
      delete target.draftFolder;
      detachItemFromGroups(source.id);
      target.parts=Array.isArray(target.parts)?target.parts:[];
      target.parts.push({id:source.id,title:source.title,file:source.file||'',pages:Math.max(1,Number(source.pages)||1)});
      data.items=data.items.filter(x=>x.id!==source.id);
      explorerCategory=target.category||explorerCategory;
      explorerItemId=target.id;
      selectedId=target.id;
      markDirty(`${source.title} dipindahkan menjadi bagian ${target.title}`);
      selectItem(target.id);
      renderList();
      toast(`${source.title} sekarang menjadi bagian ${target.title}.`,'ok');
      return;
    }

    if(targetType==='group'){
      const oldParent=findExplorerParent(source.id);
      if(oldParent?.id===target.id)return;
      const ok=await confirmInternal(
        'Pindahkan ke folder?',
        `"${source.title}" akan dipindahkan ke dalam Group "${target.title}". Struktur PDF tidak berubah.`,
        'Pindahkan',
        'Batal'
      );
      if(!ok)return;
      createBackup(`Sebelum drag ${source.title} ke Group ${target.title}`);
      target.type='group';
      delete target.draftFolder;
      detachItemFromGroups(source.id);
      source.hidden=true;
      source.category=target.category||source.category;
      target.parts=Array.isArray(target.parts)?target.parts:[];
      if(!target.parts.some(p=>p.itemId===source.id)){
        target.parts.push({id:uniqueGlobal(`${target.id}-ref-${source.id}`),title:source.title,itemId:source.id});
      }
      explorerCategory=target.category||explorerCategory;
      explorerItemId=target.id;
      selectedId=target.id;
      markDirty(`${source.title} dipindahkan ke Group ${target.title}`);
      selectItem(target.id);
      renderList();
      toast(`${source.title} dipindahkan ke ${target.title}.`,'ok');
      return;
    }

    // Drop onto another document keeps the familiar reorder behavior.
    const from=data.items.indexOf(source);
    const to=data.items.indexOf(target);
    if(from>=0&&to>=0)moveMainItem(from,to);
    return;
  }

  if(payload.kind==='part'){
    const sourceParent=data.items.find(x=>x.id===payload.parentId);
    if(!sourceParent||!Array.isArray(sourceParent.parts))return;
    const part=sourceParent.parts[payload.partIndex];
    if(!part||part.itemId){
      toast('Folder referensi dipindahkan sebagai folder, bukan sebagai PDF bagian.','warn');
      return;
    }
    if(sourceParent.id===target.id)return;
    const ok=await confirmInternal(
      'Pindahkan bagian?',
      `"${part.title}" akan dipindahkan dari "${sourceParent.title}" ke "${target.title}".`,
      'Pindahkan',
      'Batal'
    );
    if(!ok)return;
    createBackup(`Sebelum drag bagian ${part.title}`);
    if(target.draftFolder && !(target.parts||[]).length){
      target.type='collection';
      delete target.draftFolder;
    }
    const moved=removeDirectPart(sourceParent,payload.partIndex);
    if(!moved)return;
    target.parts=Array.isArray(target.parts)?target.parts:[];
    target.parts.push(moved);
    explorerCategory=target.category||explorerCategory;
    explorerItemId=target.id;
    selectedId=target.id;
    markDirty(`${moved.title} dipindahkan ke ${target.title}`);
    selectItem(target.id);
    renderList();
    toast(`${moved.title} dipindahkan ke ${target.title}.`,'ok');
  }
}

function bindExplorerPartReorder(list){
  $$('.part-file[data-part-index]',list).forEach(row=>{
    row.draggable=true;
    row.addEventListener('dragstart',e=>{
      const parent=data.items.find(x=>x.id===explorerItemId);
      if(!parent)return;
      const partIndex=Number(row.dataset.partIndex);
      const part=parent.parts?.[partIndex];
      const key=row.dataset.selectionKey||partSelectionKey(parent.id,partIndex);
      explorerDragStart(explorerPayloadForDrag(key,{
        kind:'part',parentId:parent.id,partId:part?.id,partIndex
      }),row,e);
    });
    row.addEventListener('dragend',explorerDragEnd);
    row.addEventListener('dragover',e=>{
      if(explorerDragPayload?.kind!=='part'||explorerDragPayload.parentId!==explorerItemId)return;
      e.preventDefault();row.classList.add('drop-target');
    });
    row.addEventListener('dragleave',()=>row.classList.remove('drop-target'));
    row.addEventListener('drop',e=>{
      if(explorerDragPayload?.kind!=='part'||explorerDragPayload.parentId!==explorerItemId)return;
      e.preventDefault();e.stopPropagation();row.classList.remove('drop-target');
      const parent=data.items.find(x=>x.id===explorerItemId);
      const from=Number(explorerDragPayload.partIndex),to=Number(row.dataset.partIndex);
      if(parent&&from!==to&&from>=0&&to>=0){
        const [moved]=parent.parts.splice(from,1);parent.parts.splice(to,0,moved);
        if(selectedPartRef?.parentId===parent.id){
          if(selectedPartRef.index===from)selectedPartRef.index=to;
          else if(from<selectedPartRef.index&&to>=selectedPartRef.index)selectedPartRef.index-=1;
          else if(from>selectedPartRef.index&&to<=selectedPartRef.index)selectedPartRef.index+=1;
        }
        markDirty('Urutan bagian di Explorer diubah');renderList();renderParts();
      }
      explorerDragEnd();
    });
  });
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
    resetExplorerSelection();
    const kind=btn.dataset.crumbKind;
    if(kind==='root'){explorerCategory='';explorerItemId=null;$('#categoryFilter').value='';}
    else if(kind==='category'){explorerItemId=null;$('#categoryFilter').value=explorerCategory;}
    else explorerItemId=btn.dataset.crumbId;
    selectedId=null;showEmptyEditor();renderList();
  });
  $$('[data-crumb-kind]',host).forEach(btn=>{
    const kind=btn.dataset.crumbKind;
    if(kind==='root')bindExplorerDropTarget(btn,{kind:'root'});
    else if(kind==='category')bindExplorerDropTarget(btn,{kind:'category',category:explorerCategory});
    else bindExplorerDropTarget(btn,{kind:'item',itemId:btn.dataset.crumbId});
  });
  renderCategoryTree();
}

function openExplorerItem(id){
  const item=data.items.find(x=>x.id===id);
  if(!item)return;
  if(item.type==='single'){
    selectItem(id);
    return;
  }
  resetExplorerSelection();
  explorerItemId=id;
  selectedId=id;
  selectItem(id);
  renderList();
}

function explorerCardForItem(x,index){
  const isFolder=x.type!=='single';
  const iconClass=x.type==='collection'?'collection-icon':isFolder?'folder-icon':'file-icon';
  const selectionKey=itemSelectionKey(x.id);
  const active=explorerSelection.size?explorerSelection.has(selectionKey):x.id===selectedId;
  const countValue=x.type==='single'?Math.max(1,Number(x.pages)||1):(x.parts||[]).length;
  const countLabel=x.type==='single'?'hal.':'isi';
  const typeLabel=x.draftFolder?'Folder':x.type==='group'?'Group':x.type==='collection'?'Collection':'Single';
  return `<div class="explorer-entry ${isFolder?'is-folder':'is-file'} ${x.type==='collection'?'is-collection':''} ${active?'active':''}" draggable="true" data-id="${esc(x.id)}" data-selection-key="${esc(selectionKey)}" data-main-index="${index}">
    <button class="explorer-open" type="button" data-open-explorer="${esc(x.id)}" title="${isFolder?'Klik dua kali untuk membuka folder':'Klik dua kali untuk mengedit PDF'}">
      <span class="explorer-icon ${iconClass}" aria-hidden="true"></span>
      <span class="explorer-entry-copy"><b>${esc(x.title||'(Tanpa judul)')}</b><small>${x.type==='collection'?'Koleksi PDF':isFolder?'Folder bacaan':'Dokumen PDF'}</small></span>
    </button>
    <span class="explorer-col explorer-col-type"><small>${esc(typeLabel)}</small></span>
    <span class="explorer-col explorer-col-count"><b>${countValue}</b><small>${countLabel}</small></span>
    <div class="explorer-entry-actions">
      <button type="button" class="icon-action edit-action" data-edit-explorer="${esc(x.id)}" title="Edit bacaan" aria-label="Edit bacaan"></button>
      ${!x.hidden?`<button type="button" data-main-up="${index}" title="Naik">↑</button><button type="button" data-main-down="${index}" title="Turun">↓</button>`:''}
    </div>
  </div>`;
}

function explorerCardForPart(parent,p,i){
  if(p.itemId){
    const child=data.items.find(x=>x.id===p.itemId);
    return child?explorerCardForItem(child,data.items.indexOf(child)):'';
  }
  const selectionKey=partSelectionKey(parent.id,i);
  const active=explorerSelection.size
    ? explorerSelection.has(selectionKey)
    : selectedPartRef?.parentId===parent.id&&selectedPartRef?.index===i;
  return `<div class="explorer-entry is-file part-file ${active?'active':''}" draggable="true" data-part-index="${i}" data-selection-key="${esc(selectionKey)}">
    <button class="explorer-open" type="button" data-select-part-index="${i}" title="Klik dua kali untuk mengedit PDF">
      <span class="explorer-icon file-icon" aria-hidden="true"></span>
      <span class="explorer-entry-copy"><b>${esc(p.title||'(Tanpa judul)')}</b><small>Dokumen PDF</small></span>
    </button>
    <span class="explorer-col explorer-col-type"><small>PDF</small></span>
    <span class="explorer-col explorer-col-count"><b>${Math.max(1,Number(p.pages)||1)}</b><small>hal.</small></span>
    <div class="explorer-entry-actions"><button type="button" class="icon-action edit-action" data-edit-part-index="${i}" title="Edit Bagian" aria-label="Edit Bagian"></button></div>
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
  renderCategoryTree();
  $('#explorerListHead')?.classList.toggle('hidden',explorerView!=='list');

  let html='';
  if(!explorerCategory && !explorerItemId && !q && !type){
    const cats=categories();
    html=cats.map(c=>{const key=categorySelectionKey(c);const draft=isDraftCategory(c);return `<div class="explorer-entry is-folder category-folder ${draft?'is-draft-category':''} ${explorerSelection.has(key)?'active':''}" data-selection-key="${esc(key)}" data-drop-category-entry="${esc(c)}"><button class="explorer-open" type="button" data-open-category="${esc(c)}" title="Klik dua kali untuk membuka folder"><span class="explorer-icon folder-icon" aria-hidden="true"></span><span class="explorer-entry-copy"><b>${esc(c)}</b><small>${draft?'Kategori Draft • kosong':'Folder kategori'}</small></span></button><span class="explorer-col explorer-col-type"><small>${draft?'Draft':'Kategori'}</small></span><span class="explorer-col explorer-col-count"><b>${explorerRoots(c).length}</b><small>item</small></span><div class="explorer-entry-actions"></div></div>`}).join('');
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
  const visibleCount=list.querySelectorAll('.explorer-entry').length;
  explorerVisibleKeys=$$('[data-selection-key]',list).map(row=>row.dataset.selectionKey);
  const visibleSet=new Set(explorerVisibleKeys);
  [...explorerSelection].forEach(key=>{if(!visibleSet.has(key))explorerSelection.delete(key);});
  if(explorerSelectionAnchor&&!visibleSet.has(explorerSelectionAnchor))explorerSelectionAnchor=null;
  syncExplorerSelectionVisuals();

  $$('[data-drop-category-entry]',list).forEach(row=>bindExplorerDropTarget(row,{kind:'category',category:row.dataset.dropCategoryEntry}));
  $$('[data-edit-explorer]',list).forEach(btn=>btn.onclick=e=>{e.stopPropagation();selectItem(btn.dataset.editExplorer);});
  $$('[data-edit-part-index]',list).forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const i=Number(btn.dataset.editPartIndex);
    const parent=data.items.find(x=>x.id===explorerItemId);
    if(parent){selectedPartRef={parentId:parent.id,index:i};selectedId=parent.id;openPartDialog(i);}
  });

  $$('[data-selection-key]',list).forEach(row=>{
    row.onclick=e=>{
      if(e.target.closest('.explorer-entry-actions'))return;
      handleExplorerSelectionClick(row,e);
    };
  });

  $$('.category-folder',list).forEach(row=>{
    row.ondblclick=e=>{
      e.preventDefault();
      e.stopPropagation();
      const category=$('[data-open-category]',row)?.dataset.openCategory;
      if(!category)return;
      resetExplorerSelection();
      explorerCategory=category;
      explorerItemId=null;
      $('#categoryFilter').value=category;
      selectedId=null;
      showEmptyEditor();
      renderList();
    };
  });

  // Klik sekali memilih; double-click membuka folder atau editor PDF.
  $$('.explorer-entry[data-id]',list).forEach(row=>{
    row.ondblclick=e=>{
      e.preventDefault();
      e.stopPropagation();
      const id=row.dataset.id;
      const item=data.items.find(x=>x.id===id);
      if(!item)return;
      if(item.type==='single'){
        selectItem(id);
        setTimeout(()=>$('#titleInput')?.focus(),20);
      }else openExplorerItem(id);
    };
    row.addEventListener('dragstart',e=>{
      const id=row.dataset.id;
      const item=data.items.find(x=>x.id===id);
      if(!item)return;
      mainDragIndex=Number(row.dataset.mainIndex);
      const key=row.dataset.selectionKey||itemSelectionKey(id);
      explorerDragStart(explorerPayloadForDrag(key,{kind:'item',itemId:id}),row,e);
    });
    row.addEventListener('dragend',()=>{mainDragIndex=null;explorerDragEnd();});
    bindExplorerDropTarget(row,{kind:'item',itemId:row.dataset.id});
  });
  $$('.part-file[data-part-index]',list).forEach(row=>{
    row.ondblclick=e=>{
      e.preventDefault();
      const i=Number(row.dataset.partIndex);
      const parent=data.items.find(x=>x.id===explorerItemId);
      if(parent){selectedPartRef={parentId:parent.id,index:i};selectedId=parent.id;openPartDialog(i);}
    };
  });
  bindExplorerPartReorder(list);
  $$('[data-main-up]',list).forEach(btn=>btn.onclick=e=>{e.stopPropagation();moveMainItem(Number(btn.dataset.mainUp),Number(btn.dataset.mainUp)-1);});
  $$('[data-main-down]',list).forEach(btn=>btn.onclick=e=>{e.stopPropagation();moveMainItem(Number(btn.dataset.mainDown),Number(btn.dataset.mainDown)+1);});

  list.onclick=e=>{
    if(e.target.closest('.explorer-entry'))return;
    resetExplorerSelection();
    selectedId=null;
    showEmptyEditor();
    syncExplorerSelectionVisuals();
  };

  updateAllStatus(dirty);
}

function explorerPathForItem(item){
  if(!item)return 'Bacaan';
  const chain=[];
  const guard=new Set();
  let current=item;
  while(current && !guard.has(current.id)){
    guard.add(current.id);
    chain.unshift(current.title||current.id);
    current=findExplorerParent(current.id);
  }
  if(item.category)chain.unshift(item.category);
  chain.unshift('Bacaan');
  return chain.join(' › ');
}

function locationValueForItem(item){
  const parent=findExplorerParent(item.id);
  return parent?`item::${parent.id}`:`category::${item.category||''}`;
}

function buildLocationOptions(item){
  const select=$('#locationInput');
  if(!select||!item)return;
  const current=locationValueForItem(item);
  const opts=[];
  categories().forEach(cat=>opts.push({value:`category::${cat}`,label:`Kategori — ${cat}`}));
  data.items.forEach(target=>{
    if(target.id===item.id||target.type==='single')return;
    if(!canDropOnItem({kind:'item',itemId:item.id},target))return;
    const prefix=target.type==='collection'?'Collection':'Group';
    opts.push({value:`item::${target.id}`,label:`${prefix} — ${explorerPathForItem(target).replace(/^Bacaan › /,'')}`});
  });
  if(!opts.some(o=>o.value===current)){
    const parent=findExplorerParent(item.id);
    opts.unshift({value:current,label:parent?`${parent.type==='collection'?'Collection':'Group'} — ${explorerPathForItem(parent).replace(/^Bacaan › /,'')}`:`Kategori — ${item.category||'Tanpa kategori'}`});
  }
  select.innerHTML=opts.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  select.value=current;
  $('#locationPathText').textContent=`Lokasi saat ini: ${explorerPathForItem(item)}`;
}

async function moveSelectedByLocation(){
  const item=getSelected();
  const select=$('#locationInput');
  if(!item||!select)return;
  const chosen=select.value;
  const current=locationValueForItem(item);
  if(!chosen||chosen===current)return;
  const payload={kind:'item',itemId:item.id};
  if(chosen.startsWith('category::')){
    const category=chosen.slice('category::'.length);
    await dropExplorerOnCategory(payload,category);
  }else if(chosen.startsWith('item::')){
    const targetId=chosen.slice('item::'.length);
    await dropExplorerOnItem(payload,targetId);
  }
  const still=data.items.find(x=>x.id===item.id);
  if(still && selectedId===still.id)buildLocationOptions(still);
}

function showPartInspector(parent,index,{preserveExplorerSelection=false,skipListRender=false}={}){
  const part=parent?.parts?.[index];
  if(!parent||!part||part.itemId)return;
  if(!preserveExplorerSelection){
    const key=partSelectionKey(parent.id,index);
    explorerSelection.clear();
    explorerSelection.add(key);
    explorerSelectionAnchor=key;
  }
  selectedPartRef={parentId:parent.id,index};
  selectedId=parent.id;
  $('#emptyEditor').classList.add('hidden');
  $('#editorContent').classList.add('hidden');
  $('#categoryInspector')?.classList.add('hidden');
  $('#partInspector').classList.remove('hidden');
  $('#partInspectorTitle').textContent=part.title||'(Tanpa judul)';
  $('#partInspectorPath').textContent=`${explorerPathForItem(parent)} › ${part.title||part.id||'Bagian'}`;
  $('#partInspectorParent').textContent=parent.title||parent.id;
  $('#partInspectorPages').textContent=`${Math.max(1,Number(part.pages)||1)} halaman`;
  $('#partInspectorFile').textContent=part.file||'—';
  $('#partInspectorId').textContent=part.id||'—';
  $('#partInspectorR2').textContent=r2Key(part.file)||'—';
  if(!skipListRender)renderList();
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
function selectItem(id,{preserveExplorerSelection=false,skipListRender=false}={}){
  if(!preserveExplorerSelection){
    explorerSelection.clear();
    explorerSelection.add(itemSelectionKey(id));
    explorerSelectionAnchor=itemSelectionKey(id);
  }
  selectedPartRef=null;
  selectedId=id;
  if(!skipListRender)renderList();

  const x=getSelected();
  if(!x)return;

  $('#emptyEditor').classList.add('hidden');
  $('#partInspector')?.classList.add('hidden');
  $('#categoryInspector')?.classList.add('hidden');
  $('#editorContent').classList.remove('hidden');

  $('#editorHeading').textContent=x.title||'Edit Bacaan';
  $('#editorTypeBadge').textContent=x.draftFolder?'folder':(x.type||'');
  $('#editorCategoryBadge').textContent=x.category||'Tanpa kategori';
  $('#editorMeta').textContent=`ID: ${x.id}`;

  $('#titleInput').value=x.title||'';
  $('#categoryInput').value=x.category||'';
  $('#typeInput').value=x.type||'single';
  $('#idInput').value=x.id||'';
  buildLocationOptions(x);

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
  selectedPartRef=null;
  $('#editorContent').classList.add('hidden');
  $('#partInspector')?.classList.add('hidden');
  $('#categoryInspector')?.classList.add('hidden');
  const empty=$('#emptyEditor');
  empty.classList.remove('hidden');
  $('.empty-ornament',empty).textContent='✦';
  $('h2',empty).textContent='Pilih file atau folder';
  $('p',empty).textContent='Klik sekali untuk memilih. Klik dua kali untuk membuka folder atau mengedit PDF.';
}

function selectedExplorerCategory(){
  if(explorerSelection.size!==1)return '';
  const ref=parseExplorerSelectionKey([...explorerSelection][0]);
  return ref.kind==='category'?ref.category:'';
}

function categoryNameError(name,current=''){
  const value=String(name||'').trim();
  if(!value)return 'Nama kategori wajib diisi.';
  if(value==='.'||value==='..'||/[\\/\u0000-\u001f]/.test(value))return 'Nama kategori tidak boleh memakai /, \\, atau karakter kontrol.';
  if(['semua','bacaan'].includes(value.toLocaleLowerCase('id')))return `Nama “${value}” dipakai oleh sistem dan tidak dapat digunakan.`;
  const currentKey=String(current||'').trim().toLocaleLowerCase('id');
  const duplicate=categories().some(category=>{
    const key=category.toLocaleLowerCase('id');
    return key===value.toLocaleLowerCase('id')&&key!==currentKey;
  });
  return duplicate?'Nama kategori tersebut sudah ada. Gunakan nama lain.':'';
}

function showCategoryInspector(category){
  if(!category||!categories().includes(category)){
    showEmptyEditor();
    return;
  }
  selectedId=null;
  selectedPartRef=null;
  $('#emptyEditor').classList.add('hidden');
  $('#editorContent').classList.add('hidden');
  $('#partInspector')?.classList.add('hidden');
  const panel=$('#categoryInspector');
  panel.classList.remove('hidden');
  const items=(data.items||[]).filter(item=>item.category===category);
  const draft=isDraftCategory(category);
  $('#categoryInspectorTitle').textContent=category;
  $('#categoryInspectorMeta').textContent=`Bacaan › ${category}`;
  $('#categoryInspectorBadge').textContent=draft?'Kategori Draft':'Kategori';
  $('#categoryInspectorBadge').classList.toggle('draft',draft);
  $('#categoryInspectorCount').textContent=`${items.length} bacaan • ${explorerRoots(category).length} item utama`;
  $('#categoryInspectorHelp').textContent=draft
    ?'Kategori masih kosong dan belum akan dimasukkan ke books.json.'
    :'Kategori sudah aktif karena memiliki isi.';
  $('#categoryNameInput').value=category;
  renderCategoryIconPicker(category);
  $('#deleteCategoryBtn').disabled=items.length>0;
  $('#deleteCategoryBtn').title=items.length?'Pindahkan atau hapus seluruh isi sebelum menghapus kategori.':'Hapus kategori kosong';
  showFormError($('#categoryInspectorError'),'');
}

async function renameSelectedCategory(){
  const current=selectedExplorerCategory();
  if(!current)return;
  const next=$('#categoryNameInput').value.trim().replace(/\s+/g,' ');
  const error=categoryNameError(next,current);
  if(error){
    showFormError($('#categoryInspectorError'),error);
    $('#categoryNameInput').focus();
    return;
  }
  if(next===current){
    toast('Nama kategori tidak berubah.','warn');
    return;
  }

  const affected=(data.items||[]).filter(item=>item.category===current).length;
  if(affected){
    const ok=await confirmInternal(
      'Rename kategori?',
      `${affected} bacaan akan dipindahkan dari kategori “${current}” ke “${next}”. Path PDF dan object R2 tidak diubah otomatis; buat ulang manifest jika struktur folder lokal juga diganti.`,
      'Rename Kategori',
      'Batal'
    );
    if(!ok)return;
  }

  createBackup(`Sebelum rename kategori ${current}`);
  data.categories=(data.categories||[]).map(category=>category===current?next:category);
  data.draftCategories=(data.draftCategories||[]).map(category=>category===current?next:category);
  data.items.forEach(item=>{if(item.category===current)item.category=next;});
  if(data.categoryIcons?.[current]){
    data.categoryIcons[next]=data.categoryIcons[current];
    delete data.categoryIcons[current];
  }
  if(!data.categoryAliases||typeof data.categoryAliases!=='object'||Array.isArray(data.categoryAliases)){
    data.categoryAliases={};
  }
  Object.entries(data.categoryAliases).forEach(([previous,target])=>{
    if(target===current)data.categoryAliases[previous]=next;
  });
  data.categoryAliases[current]=next;
  if(explorerCategory===current)explorerCategory=next;
  explorerSelection.clear();
  explorerSelection.add(categorySelectionKey(next));
  explorerSelectionAnchor=categorySelectionKey(next);
  refreshCategoryUI();
  $('#categoryFilter').value=explorerCategory||'';
  markDirty(`Kategori “${current}” diubah menjadi “${next}”`);
  renderList();
  showCategoryInspector(next);
  toast(`Kategori berhasil diubah menjadi “${next}”.`,'ok');
}

async function deleteSelectedCategory(){
  const category=selectedExplorerCategory();
  if(!category)return;
  const count=(data.items||[]).filter(item=>item.category===category).length;
  if(count){
    showFormError($('#categoryInspectorError'),`Kategori masih memiliki ${count} bacaan. Pindahkan atau hapus seluruh isinya terlebih dahulu.`);
    return;
  }
  const ok=await confirmInternal(
    'Hapus kategori kosong?',
    `Kategori “${category}” akan dihapus dari draft. Tidak ada PDF atau object R2 yang dihapus.`,
    'Hapus Kategori',
    'Batal'
  );
  if(!ok)return;

  createBackup(`Sebelum menghapus kategori ${category}`);
  data.categories=(data.categories||[]).filter(name=>name!==category);
  data.draftCategories=(data.draftCategories||[]).filter(name=>name!==category);
  if(data.categoryIcons)delete data.categoryIcons[category];
  if(data.categoryAliases){
    delete data.categoryAliases[category];
    Object.entries(data.categoryAliases).forEach(([previous,target])=>{
      if(target===category)delete data.categoryAliases[previous];
    });
  }
  resetExplorerSelection();
  explorerCategory='';
  explorerItemId=null;
  selectedId=null;
  refreshCategoryUI();
  $('#categoryFilter').value='';
  markDirty(`Kategori kosong “${category}” dihapus`);
  showEmptyEditor();
  toast(`Kategori “${category}” dihapus.`,'ok');
}

function patchSelected(key,value){
  const x=getSelected();
  if(!x)return;
  x[key]=value;

  if(key==='title')$('#editorHeading').textContent=value||'Edit Bacaan';
  if(key==='category'){
    $('#editorCategoryBadge').textContent=value||'Tanpa kategori';
    buildLocationOptions(x);
  }

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
  if(selectedPartRef?.parentId===x.id){
    if(selectedPartRef.index===from)selectedPartRef.index=to;
    else if(from<selectedPartRef.index&&to>=selectedPartRef.index)selectedPartRef.index-=1;
    else if(from>selectedPartRef.index&&to<=selectedPartRef.index)selectedPartRef.index+=1;
  }
  markDirty('Urutan bagian diubah');
  renderParts();
  renderList();
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
  if(selectedPartRef?.parentId===x.id){
    if(selectedPartRef.index===i){selectedPartRef=null;selectItem(x.id);}
    else if(selectedPartRef.index>i)selectedPartRef.index-=1;
  }
  markDirty('Bagian dihapus dari data');
  renderParts();
  renderList();
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

  const savedIndex=editingPartIndex<0?x.parts.length-1:editingPartIndex;
  $('#partDialog').close();
  markDirty(editingPartIndex<0?'Bagian baru ditambahkan':'Bagian diperbarui');
  renderParts();
  renderList();
  if(selectedPartRef?.parentId===x.id&&selectedPartRef.index===savedIndex){
    showPartInspector(x,savedIndex);
  }
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


function explorerFolderSlugPath(item){
  if(!item)return '';
  const chain=[];
  const guard=new Set();
  let current=item;
  while(current && !guard.has(current.id)){
    guard.add(current.id);
    chain.unshift(slugify(current.title||current.id));
    current=findExplorerParent(current.id);
  }
  return chain.filter(Boolean).join('/');
}

function batchFolderDestinations(){
  const opts=[];
  categories().forEach(category=>{
    opts.push({
      value:`category::${category}`,
      label:`Bacaan › ${category}`,
      kind:'category',
      category
    });
  });
  data.items
    .filter(x=>x.type==='group'||x.type==='collection')
    .forEach(item=>{
      opts.push({
        value:`item::${item.id}`,
        label:`${explorerPathForItem(item)}${item.type==='collection'?'  • Collection':'  • Group'}`,
        kind:'item',
        category:item.category||'',
        item
      });
    });
  return opts.sort((a,b)=>naturalCompare(a.label,b.label));
}

function batchDestination(){
  const raw=$('#batchTargetInput')?.value||'';
  if(raw.startsWith('item::')){
    const item=data.items.find(x=>x.id===raw.slice('item::'.length))||null;
    if(item)return {kind:'item',item,category:item.category||'Lainnya'};
  }
  if(raw.startsWith('category::')){
    const category=raw.slice('category::'.length)||'Lainnya';
    return {kind:'category',item:null,category};
  }
  const category=explorerCategory||categories()[0]||'Lainnya';
  return {kind:'category',item:null,category};
}

function populateBatchTargetOptions(){
  const select=$('#batchTargetInput');
  if(!select)return;
  const old=select.value;
  const opts=batchFolderDestinations();
  select.innerHTML=opts.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');

  let preferred='';
  if(explorerItemId){
    const current=data.items.find(x=>x.id===explorerItemId);
    if(current&&(current.type==='group'||current.type==='collection'))preferred=`item::${current.id}`;
  }
  if(!preferred&&explorerCategory)preferred=`category::${explorerCategory}`;
  if(!preferred&&old&&opts.some(o=>o.value===old))preferred=old;
  if(!preferred&&opts.length)preferred=opts[0].value;
  select.value=preferred;
}

function batchDestinationBaseFolder(dest=batchDestination()){
  const folder=categoryFolder(dest.category||'Lainnya');
  const categoryBase=`assets/pdf-v2/${folder}`;
  if(!dest.item)return categoryBase;

  if(dest.item.type==='collection'){
    const direct=(dest.item.parts||[]).find(p=>!p.itemId&&p.file)?.file||'';
    if(direct.includes('/'))return direct.slice(0,direct.lastIndexOf('/'));
  }

  const nested=explorerFolderSlugPath(dest.item);
  return nested?`${categoryBase}/${nested}`:categoryBase;
}

function attachItemToBatchGroup(item,group){
  if(!item||!group||group.type!=='group')return;
  item.category=group.category||item.category;
  item.hidden=true;
  group.parts=Array.isArray(group.parts)?group.parts:[];
  if(!group.parts.some(p=>p.itemId===item.id)){
    group.parts.push({
      id:uniquePartId(`${group.id}-ref-${item.id}`),
      title:item.title,
      itemId:item.id
    });
  }
}

/* ===================== BATCH IMPORT PDF ===================== */
function openBatchDialog(){
  batchEntries=[];
  $('#batchModeInput').value='singles';
  populateBatchTargetOptions();
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
  const modeInput=$('#batchModeInput');
  const dest=batchDestination();
  const targetCollection=dest.item?.type==='collection'||
    (dest.item?.draftFolder && modeInput.value!=='folder-tree');

  if(targetCollection){
    if(modeInput.value!=='parts')modeInput.dataset.previousMode=modeInput.value||'singles';
    modeInput.value='parts';
    modeInput.disabled=true;
    $('#batchTitleField').classList.add('hidden');
    $('#batchTitleInput').disabled=true;
    $('#batchTargetHint').textContent=`PDF akan langsung menjadi bagian dari Collection “${dest.item.title}”.`;
    return;
  }

  if(modeInput.value==='parts')modeInput.value=modeInput.dataset.previousMode||'singles';
  modeInput.disabled=false;
  const mode=modeInput.value;
  $('#batchTitleField').classList.toggle('hidden',mode==='singles'||mode==='folder-tree');
  $('#batchTitleInput').disabled=mode==='folder-tree';
  $('#batchTargetHint').textContent=dest.item?.type==='group'
    ? `Hasil import akan ditempatkan di dalam Group “${dest.item.title}”.`
    : `Hasil import akan ditempatkan di folder “${dest.category}”.`;
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

function applyFolderTreeImport(category,baseFolder=""){
  const tree=folderTreePlan();
  const created=[];
  const usedIds=new Set([...data.items.map(x=>x.id),...allPartIds()]);
  const folderBase=categoryFolder(category);
  const virtualBase=String(baseFolder||`assets/pdf-v2/${folderBase}`).replace(/\/$/,'');

  function uniqueGlobal(base){let id=base||'folder';let n=2;while(usedIds.has(id))id=`${base}-${n++}`;usedIds.add(id);return id;}

  function build(node,parentGroupId=null,isRoot=false){
    const title=treeNodeTitle(node);
    let folderSegments=(node.path||title).split('/').map(slugify).filter(Boolean);
    if(folderSegments[0]===folderBase)folderSegments=folderSegments.slice(1);
    const folderPath=folderSegments.join('/')||slugify(title);
    const childFolders=[...node.folders.values()].sort((a,b)=>naturalCompare(a.name,b.name));
    const leaf=childFolders.length===0;
    const id=uniqueGlobal(slugify(node.path||title));
    const item={id,title,category,type:leaf?'collection':'group',parts:[]};
    if(parentGroupId)item.hidden=true;

    if(leaf){
      const files=[...node.files].sort((a,b)=>naturalCompare(a.relativePath||a.filename,b.relativePath||b.filename));
      for(const entry of files){
        let pid=uniqueGlobal(`${id}-${slugify(entry.title)}`);
        item.parts.push({id:pid,title:entry.title.trim(),file:`${virtualBase}/${folderPath}/${entry.filename}`,pages:Math.max(1,Math.floor(Number(entry.pages)||1))});
      }
    }else{
      // PDF langsung di folder bercabang: jadikan Single tersembunyi dan referensikan dari Group.
      for(const entry of [...node.files].sort((a,b)=>naturalCompare(a.filename,b.filename))){
        const sid=uniqueGlobal(`${id}-${slugify(entry.title)}`);
        const single={id:sid,title:entry.title.trim(),category,type:'single',file:`${virtualBase}/${folderPath}/${entry.filename}`,pages:Math.max(1,Math.floor(Number(entry.pages)||1)),hidden:true};
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
  const dest=batchDestination();
  const mode=$('#batchModeInput').value;
  const base=batchDestinationBaseFolder(dest);

  // Jika folder tujuan adalah Collection, semua PDF berada di folder Collection tersebut.
  if(dest.item?.type==='collection'){
    return `${base}/${entry.filename}`;
  }

  if(mode==='folder-tree'){
    const rel=(entry.relativePath||entry.filename).split('/').filter(Boolean);
    const suffix=rel.map((seg,i)=>i===rel.length-1?safePdfFilename(seg):slugify(seg)).join('/');
    return `${base}/${suffix}`;
  }

  if(mode==='singles'){
    return `${base}/${entry.filename}`;
  }

  const collectionId=batchTargetId();
  return `${base}/${collectionId}/${entry.filename}`;
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
  const dest=batchDestination();
  const category=dest.category||'Lainnya';
  const invalid=batchEntries.find(e=>!e.title.trim()||!Number.isInteger(Number(e.pages))||Number(e.pages)<1);
  if(invalid){
    toast('Ada PDF yang belum memiliki judul atau jumlah halaman. Jika deteksi gagal, isi koreksi halaman pada baris tersebut.','error');
    return;
  }

  createBackup('Sebelum Batch Import PDF');

  // Folder tujuan Collection: PDF langsung menjadi bagian Collection tersebut.
  if(dest.item?.type==='collection'||(dest.item?.draftFolder&&mode!=='folder-tree')){
    const target=dest.item;
    target.type='collection';
    delete target.draftFolder;
    target.parts=Array.isArray(target.parts)?target.parts:[];
    const used=new Set([
      ...data.items.map(x=>x.id),
      ...data.items.flatMap(x=>(x.parts||[]).map(p=>p.id))
    ]);
    for(let i=0;i<batchEntries.length;i++){
      const entry=batchEntries[i];
      const title=entry.title.trim();
      let id=`${target.id}-${slugify(title)}`;
      let n=2;
      while(used.has(id))id=`${target.id}-${slugify(title)}-${n++}`;
      used.add(id);
      target.parts.push({
        id,
        title,
        file:batchPathFor(entry,i),
        pages:Math.max(1,Math.floor(Number(entry.pages)||1))
      });
    }
    explorerCategory=target.category||category;
    explorerItemId=target.id;
    selectedId=target.id;
    refreshCategoryUI();
    markDirty(`${batchEntries.length} PDF ditambahkan sebagai bagian ${target.title}`);
    closeBatchDialog();
    renderList();
    selectItem(target.id);
    toast(`${batchEntries.length} PDF ditambahkan ke Collection ${target.title}.`,'ok');
    return;
  }

  if(mode==='folder-tree'){
    const result=applyFolderTreeImport(category,batchDestinationBaseFolder(dest));
    if(dest.item?.type==='group')attachItemToBatchGroup(result.rootItem,dest.item);
    selectedId=result.rootItem?.id||null;
    explorerCategory=category;
    explorerItemId=dest.item?.type==='group'?dest.item.id:null;
    refreshCategoryUI();
    markDirty(`${batchEntries.length} PDF diimpor sebagai struktur folder otomatis`);
    closeBatchDialog();
    renderList();
    if(selectedId)selectItem(selectedId);
    toast(dest.item?.type==='group'
      ? `Struktur folder ditambahkan ke Group ${dest.item.title}.`
      : 'Struktur folder dibuat otomatis: folder bercabang = Group, folder paling bawah = Collection.','ok');
    return;
  }

  if(mode==='singles'){
    const created=[];
    for(let i=0;i<batchEntries.length;i++){
      const entry=batchEntries[i];
      const title=entry.title.trim();
      const id=uniqueItemId(slugify(title));
      const item={
        id,
        title,
        category,
        type:'single',
        file:batchPathFor(entry,i),
        pages:Math.max(1,Math.floor(Number(entry.pages)||1))
      };
      data.items.push(item);
      if(dest.item?.type==='group')attachItemToBatchGroup(item,dest.item);
      created.push(item);
    }
    selectedId=created[0]?.id||null;
    explorerItemId=dest.item?.type==='group'?dest.item.id:null;
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

    for(let i=0;i<batchEntries.length;i++){
      const entry=batchEntries[i];
      const partTitle=entry.title.trim();
      let partId=`${id}-${slugify(partTitle)}`;
      let n=2;
      while(used.has(partId))partId=`${id}-${slugify(partTitle)}-${n++}`;
      used.add(partId);
      parts.push({
        id:partId,
        title:partTitle,
        file:batchPathFor(entry,i),
        pages:Math.max(1,Math.floor(Number(entry.pages)||1))
      });
    }

    const item={
      id,
      title,
      category,
      type:mode,
      parts
    };
    data.items.push(item);
    if(dest.item?.type==='group')attachItemToBatchGroup(item,dest.item);
    selectedId=id;
    explorerItemId=dest.item?.type==='group'?dest.item.id:null;
  }

  explorerCategory=category;
  refreshCategoryUI();
  markDirty(`${batchEntries.length} PDF ditambahkan melalui Batch Import`);
  const id=selectedId;
  closeBatchDialog();
  renderList();
  if(id)selectItem(id);
  toast('Batch Import selesai. Jangan lupa unggah PDF fisik ke R2 sesuai key yang dibuat.','ok');
}


/* ===================== V2.47.0 PRE-RELEASE HEALTH CHECK ===================== */
function openHealthCheckDialog(){
  $('#healthCheckDialog').showModal();
}
function closeHealthCheckDialog(){
  if(healthAbortController)cancelHealthCheck();
  $('#healthCheckDialog').close();
}
function cancelHealthCheck(){
  healthAbortController?.abort();
  healthAbortController=null;
  $('#cancelHealthCheckBtn').classList.add('hidden');
  $('#startHealthCheckBtn').disabled=false;
  $('#startHealthCheckBtn').textContent='Periksa Lagi';
  $('#healthProgressText').textContent='Pemeriksaan dihentikan.';
}
function healthFlattenPdf(catalog){
  const rows=[];
  const walk=(item,parentTitle='')=>{
    if(!item)return;
    if(item.type==='single'){
      rows.push({id:item.id||'',title:item.title||item.id||'Tanpa judul',file:item.file||'',parent:parentTitle});
      return;
    }
    if(Array.isArray(item.parts))item.parts.forEach(part=>rows.push({id:part.id||'',title:part.title||part.id||'Tanpa judul',file:part.file||'',parent:item.title||parentTitle}));
    if(Array.isArray(item.items))item.items.forEach(child=>walk(child,item.title||parentTitle));
  };
  (catalog?.items||[]).forEach(item=>walk(item));
  return rows;
}
function healthR2Key(row){
  // Legacy ini sengaja sama dengan reader.js agar hasil pemeriksaan sesuai aplikasi yang benar-benar berjalan.
  if(row.id==='wirdul-latif')return '05 Wirdul Latif.pdf';
  return String(row.file||'').replace(/^\.?\//,'').replace(/^assets\/pdf-v2\//,'');
}
function healthAddResult(list,status,title,detail='',key=''){
  list.push({status,title,detail,key});
}
function healthEscape(text=''){
  return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function renderHealthResults(report){
  const list=$('#healthCheckList');
  const rows=report.results||[];
  list.innerHTML=rows.map(x=>`<div class="health-result ${x.status}"><span class="health-result-icon">${x.status==='ok'?'✓':x.status==='warn'?'!':'×'}</span><span><b>${healthEscape(x.title)}</b><small>${healthEscape(x.detail)}</small>${x.key?`<code>${healthEscape(x.key)}</code>`:''}</span></div>`).join('')||'<div class="health-empty"><b>Tidak ada hasil.</b></div>';
  const ok=rows.filter(x=>x.status==='ok').length;
  const warn=rows.filter(x=>x.status==='warn').length;
  const error=rows.filter(x=>x.status==='error').length;
  $('#healthOkCount').textContent=String(ok);
  $('#healthWarnCount').textContent=String(warn);
  $('#healthErrorCount').textContent=String(error);
  const score=$('#healthSummary .health-score');
  score.className='health-score '+(error?'bad':warn?'warn':'good');
  $('#healthScoreIcon').textContent=error?'×':warn?'!':'✓';
  $('#healthScoreTitle').textContent=error?'Belum siap rilis':warn?'Hampir siap':'Siap dari pemeriksaan ini';
  $('#healthScoreText').textContent=error?`${error} masalah perlu diperbaiki sebelum rilis.`:warn?`${warn} hal perlu kamu periksa sebelum rilis.`:'Tidak ditemukan masalah dari pemeriksaan otomatis.';
}
function setHealthProgress(done,total,label){
  const pct=total?Math.round(done/total*100):0;
  $('#healthProgressText').textContent=label||`${done} dari ${total} diperiksa`;
  $('#healthProgressPercent').textContent=`${pct}%`;
  $('#healthProgressBar').style.width=`${pct}%`;
}
async function healthCheckPdf(row,signal){
  const key=healthR2Key(row);
  if(!key)return {status:'error',title:row.title,detail:'Path PDF kosong atau tidak valid.',key:''};
  try{
    const tokenRes=await fetch(`${HEALTH_PDF_WORKER}/token?key=${encodeURIComponent(key)}`,{cache:'no-store',credentials:'omit',signal});
    if(!tokenRes.ok){
      return {status:'error',title:row.title,detail:tokenRes.status===404?'File tidak ditemukan di R2.':`Worker PDF menjawab HTTP ${tokenRes.status}.`,key};
    }
    const token=await tokenRes.json();
    if(!token?.url)return {status:'error',title:row.title,detail:'Worker tidak memberikan URL PDF sementara.',key};
    // Coba Range kecil agar tidak mengunduh seluruh PDF. Bila storage mengabaikan Range, batalkan body secepatnya.
    const pdfRes=await fetch(token.url,{method:'GET',headers:{Range:'bytes=0-1023'},cache:'no-store',credentials:'omit',signal});
    if(!pdfRes.ok && pdfRes.status!==206)return {status:'error',title:row.title,detail:`Object R2 tidak dapat dibaca (HTTP ${pdfRes.status}).`,key};
    try{await pdfRes.body?.cancel();}catch{}
    return {status:'ok',title:row.title,detail:'PDF tersedia dan dapat diakses.',key};
  }catch(err){
    if(err?.name==='AbortError')throw err;
    return {status:'error',title:row.title,detail:`Tidak dapat diperiksa: ${err?.message||'koneksi gagal'}.`,key};
  }
}
async function healthCheckUrl(url,signal){
  try{
    const r=await fetch(url,{method:'GET',headers:{Range:'bytes=0-255'},cache:'no-store',signal});
    if(!r.ok && r.status!==206)return false;
    try{await r.body?.cancel();}catch{}
    return true;
  }catch(err){if(err?.name==='AbortError')throw err;return false;}
}
async function runHealthCheck(){
  if(healthAbortController)return;
  const controller=new AbortController();healthAbortController=controller;
  const signal=controller.signal;
  const results=[];
  $('#startHealthCheckBtn').disabled=true;
  $('#startHealthCheckBtn').textContent='Sedang Memeriksa…';
  $('#cancelHealthCheckBtn').classList.remove('hidden');
  $('#downloadHealthReportBtn').disabled=true;
  $('#healthProgressWrap').classList.remove('hidden');
  $('#healthCheckList').innerHTML='<div class="health-empty"><span class="health-spinner"></span><b>Sedang memeriksa…</b><small>Jangan tutup halaman Admin sampai selesai.</small></div>';
  try{
    let catalog;
    try{catalog=await fetchBooks();healthAddResult(results,'ok','books.json','Katalog berhasil dibaca dari server.');}
    catch(err){healthAddResult(results,'error','books.json',err.message||'Katalog gagal dibaca.');throw new Error('catalog-stop');}
    const pdfs=healthFlattenPdf(catalog);
    $('#healthTotalPdf').textContent=String(pdfs.length);

    // Pemeriksaan struktur lokal.
    const seenIds=new Map(),seenFiles=new Map();
    for(const row of pdfs){
      if(!row.id)healthAddResult(results,'error',row.title,'ID bacaan/bagian kosong.');
      else if(seenIds.has(row.id))healthAddResult(results,'error',row.title,`ID duplikat dengan “${seenIds.get(row.id)}”.`,row.id);
      else seenIds.set(row.id,row.title);
      if(!row.title)healthAddResult(results,'error',row.id||'Bacaan','Judul kosong.');
      if(!row.file)healthAddResult(results,'error',row.title,'Path PDF kosong.');
      else if(seenFiles.has(row.file))healthAddResult(results,'error',row.title,`Path PDF sama dengan “${seenFiles.get(row.file)}”.`,row.file);
      else seenFiles.set(row.file,row.title);
    }
    if(!results.some(x=>x.status==='error' && /duplikat|kosong/i.test(x.detail)))healthAddResult(results,'ok','Struktur katalog','Tidak ditemukan ID/path duplikat atau data wajib yang kosong.');
    if(pdfs.some(x=>x.id==='wirdul-latif'))healthAddResult(results,'warn','Wirdul Latif memakai key R2 lama','Aplikasi masih memakai object “05 Wirdul Latif.pdf”. Aman untuk saat ini, tetapi sebaiknya dimigrasikan ke struktur R2 final.','05 Wirdul Latif.pdf');

    // File inti yang harus satu origin dengan Admin.
    const coreFiles=['./index.html','./style.css','./app.js','./reader.html','./reader.js','./reader.css','./quran.html','./quran.js','./quran.css','./quran-config.js','./manifest.webmanifest','./sw.js'];
    let coreOk=true;
    for(const file of coreFiles){
      try{const r=await fetch(file,{cache:'no-store',signal});if(!r.ok){coreOk=false;healthAddResult(results,'error',file,`File inti tidak dapat dibuka (HTTP ${r.status}).`);}}
      catch(err){if(err?.name==='AbortError')throw err;coreOk=false;healthAddResult(results,'error',file,'File inti gagal dimuat.');}
    }
    if(coreOk)healthAddResult(results,'ok','File inti aplikasi',`${coreFiles.length} file inti tersedia.`);

    // Quran sample checks, bukan 604 halaman agar audit tetap ringan.
    const quranPages=['page001.png','page302.png','page604.png'];
    let quranOk=true;
    for(const page of quranPages){if(!(await healthCheckUrl(HEALTH_QURAN_BASE+page,signal))){quranOk=false;healthAddResult(results,'warn','Sumber halaman Qur\'an',`${page} tidak dapat diperiksa dari perangkat ini.`);}}
    if(quranOk)healthAddResult(results,'ok','Sumber halaman Qur\'an','Sampel halaman 1, 302, dan 604 dapat diakses.');

    // R2 worker and PDFs. Concurrency dibatasi agar tidak membebani koneksi.
    const total=pdfs.length;let done=0;let cursor=0;
    setHealthProgress(0,total,'Memeriksa PDF di R2…');
    const workers=Array.from({length:Math.min(5,total||1)},async()=>{
      while(true){
        const i=cursor++;if(i>=total)return;
        const result=await healthCheckPdf(pdfs[i],signal);
        if(result.status!=='ok')results.push(result);
        done++;setHealthProgress(done,total,`Memeriksa PDF di R2 • ${done} / ${total}`);
      }
    });
    await Promise.all(workers);
    const pdfErrors=results.filter(x=>x.status==='error' && x.key).length;
    if(!pdfErrors)healthAddResult(results,'ok','Semua PDF katalog',`${total} PDF berhasil ditemukan dan dapat diakses dari R2.`);
    else healthAddResult(results,'error','Pemeriksaan PDF',`${pdfErrors} PDF perlu diperbaiki. Lihat daftar di bawah.`);

    healthLastReport={createdAt:new Date().toISOString(),pdfCount:total,results};
    renderHealthResults(healthLastReport);
    setHealthProgress(total,total,'Pemeriksaan selesai.');
    $('#downloadHealthReportBtn').disabled=false;
  }catch(err){
    if(err?.name==='AbortError'){
      healthAddResult(results,'warn','Pemeriksaan dihentikan','Pemeriksaan dibatalkan sebelum seluruh file selesai dicek.');
      healthLastReport={createdAt:new Date().toISOString(),pdfCount:+($('#healthTotalPdf').textContent||0),results};
      renderHealthResults(healthLastReport);
      $('#downloadHealthReportBtn').disabled=false;
    }else if(err?.message!=='catalog-stop'){
      healthAddResult(results,'error','Pemeriksaan tidak selesai',err?.message||'Terjadi kesalahan yang tidak diketahui.');
      healthLastReport={createdAt:new Date().toISOString(),pdfCount:0,results};renderHealthResults(healthLastReport);
      $('#downloadHealthReportBtn').disabled=false;
    }else{
      healthLastReport={createdAt:new Date().toISOString(),pdfCount:0,results};renderHealthResults(healthLastReport);$('#downloadHealthReportBtn').disabled=false;
    }
  }finally{
    healthAbortController=null;
    $('#cancelHealthCheckBtn').classList.add('hidden');
    $('#startHealthCheckBtn').disabled=false;
    $('#startHealthCheckBtn').textContent='Periksa Lagi';
  }
}
function downloadHealthReport(){
  if(!healthLastReport)return;
  const rows=healthLastReport.results||[];
  const ok=rows.filter(x=>x.status==='ok').length,warn=rows.filter(x=>x.status==='warn').length,error=rows.filter(x=>x.status==='error').length;
  const lines=[
    'HASIL PEMERIKSAAN KESEHATAN APLIKASI AMALIYAH','',
    `Waktu: ${new Date(healthLastReport.createdAt).toLocaleString('id-ID')}`,
    `PDF katalog: ${healthLastReport.pdfCount}`,
    `Aman: ${ok} | Perlu dicek: ${warn} | Bermasalah: ${error}`,'',
    error?'STATUS: BELUM SIAP RILIS':warn?'STATUS: HAMPIR SIAP — PERIKSA CATATAN':'STATUS: SIAP DARI PEMERIKSAAN OTOMATIS','',
    'RINCIAN:'
  ];
  rows.forEach((x,i)=>{lines.push(`${i+1}. [${x.status==='ok'?'AMAN':x.status==='warn'?'PERLU DICEK':'BERMASALAH'}] ${x.title}`);if(x.detail)lines.push(`   ${x.detail}`);if(x.key)lines.push(`   R2: ${x.key}`);});
  lines.push('','Catatan: pemeriksaan otomatis membantu menemukan masalah teknis umum. Tetap lakukan uji singkat di HP sebelum rilis.');
  downloadText(lines.join('\n'),'HASIL-PERIKSA-APLIKASI.txt','text/plain;charset=utf-8');
}

/* ===================== REBUILD CATALOG + R2 REFRESH ===================== */
function catalogPdfKeys(snapshot=data){
  if(!snapshot?.items)return [];
  const keys=[];
  snapshot.items.forEach(item=>{
    if(item.type==='single' && item.file)keys.push(r2Key(item.file));
    (item.parts||[]).forEach(part=>{
      if(!part.itemId && part.file)keys.push(r2Key(part.file));
    });
  });
  return [...new Set(keys.filter(Boolean))].sort(naturalCompare);
}

function resetRebuildDialog(){
  rebuildScanToken++;
  rebuildEntries=[];
  rebuildPlan=null;
  rebuildIgnoredCount=0;
  rebuildCleanupKeys=catalogPdfKeys(data);
  $('#rebuildFolderInput').value='';
  $('#rebuildRootName').textContent='Belum ada folder dipilih';
  $('#rebuildScanStatus').textContent='Pilih satu folder utama yang isinya sama dengan struktur yang akan diunggah ke R2.';
  $('#rebuildTree').innerHTML='<div class="rebuild-empty">Pilih folder utama untuk melihat struktur katalog baru.</div>';
  $('#rebuildIssues').innerHTML='<div class="rebuild-empty compact">Belum ada hasil pemeriksaan.</div>';
  $('#rebuildPdfCount').textContent='0';
  $('#rebuildGroupCount').textContent='0';
  $('#rebuildCollectionCount').textContent='0';
  $('#rebuildIssueCount').textContent='0';
  $('#downloadUploadManifestBtn').disabled=true;
  $('#downloadCleanupManifestBtn').disabled=true;
  $('#downloadRefreshPlanBtn').disabled=true;
  $('#downloadTechnicalReportBtn').disabled=true;
  $('#applyRebuildBtn').disabled=true;
  $('#applyRebuildBtn').textContent='Gunakan sebagai Katalog Baru';
}

function openRebuildDialog(){
  resetRebuildDialog();
  $('#rebuildDialog').showModal();
}

function closeRebuildDialog(){
  rebuildScanToken++;
  $('#rebuildDialog').close();
}

function displayFolderTitle(name=''){
  const cleaned=String(name)
    .replace(/^\s*\d+[\s._-]*/,'')
    .replace(/[_-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()||'Bacaan';
  return cleaned.charAt(0).toLocaleUpperCase('id-ID')+cleaned.slice(1);
}

function categoryTitleFromFolder(name=''){
  const title=displayFolderTitle(name);
  const key=slugify(title);
  return {
    quran:"Al-Qur'an",
    'al-quran':"Al-Qur'an",
    wirid:'Wirid',
    doa:'Doa',
    maulid:'Maulid',
    dalail:'Dalail',
    syair:'Syair',
    khutbah:'Khutbah'
  }[key]||title;
}

function makeRebuildTree(entries){
  const root={name:'',path:'',folders:new Map(),files:[]};
  entries.forEach(entry=>{
    const segments=entry.r2Key.split('/').filter(Boolean);
    const filename=segments.pop();
    let node=root;
    segments.forEach(segment=>{
      if(!node.folders.has(segment)){
        node.folders.set(segment,{
          name:segment,
          path:node.path?`${node.path}/${segment}`:segment,
          folders:new Map(),
          files:[]
        });
      }
      node=node.folders.get(segment);
    });
    node.files.push({...entry,filename:safePdfFilename(filename)});
  });
  return root;
}

function buildRebuildPlan(entries,rootName){
  const tree=makeRebuildTree(entries);
  const errors=[];
  const warnings=[];
  const seenKeys=new Map();

  entries.forEach(entry=>{
    const lower=entry.r2Key.toLocaleLowerCase('id-ID');
    if(seenKeys.has(lower)){
      errors.push(`R2 key duplikat: ${entry.r2Key}`);
    }else seenKeys.set(lower,entry.localPath);
    if(entry.r2Key.split('/').filter(Boolean).length<2){
      errors.push(`PDF harus berada di dalam folder kategori/Collection: ${entry.localPath}`);
    }
    if(!entry.pagesDetected){
      warnings.push(`Jumlah halaman tidak terdeteksi dan sementara diisi 1: ${entry.localPath}`);
    }
  });

  if(rebuildIgnoredCount){
    warnings.push(`${rebuildIgnoredCount} file non-PDF diabaikan. Hanya PDF yang masuk katalog dan manifest.`);
  }
  if(tree.files.length){
    tree.files.forEach(file=>errors.push(`PDF tidak boleh langsung berada di folder utama: ${file.localPath}`));
  }
  if(!tree.folders.size){
    errors.push('Folder utama belum memiliki folder kategori yang berisi PDF.');
  }

  function inspectNode(node){
    if(node.folders.size && node.files.length){
      errors.push(`Folder bercabang tidak boleh berisi PDF langsung: ${node.path}. Pindahkan PDF ke leaf folder.`);
    }
    [...node.folders.values()].forEach(inspectNode);
  }
  [...tree.folders.values()].forEach(inspectNode);

  const items=[];
  const categories=[];
  const usedIds=new Set();
  let groupCount=0;
  let collectionCount=0;

  function uniqueId(base){
    const seed=base||'bacaan';
    let id=seed,n=2;
    while(usedIds.has(id))id=`${seed}-${n++}`;
    usedIds.add(id);
    return id;
  }

  function buildNode(node,category,isTop=false){
    const children=[...node.folders.values()].sort((a,b)=>naturalCompare(a.name,b.name));
    const leaf=children.length===0;
    const title=displayFolderTitle(node.name);
    const id=uniqueId(slugify(node.path||title));
    const item={id,title,category,type:leaf?'collection':'group',parts:[]};
    if(!isTop)item.hidden=true;

    if(leaf){
      collectionCount++;
      [...node.files]
        .sort((a,b)=>naturalCompare(a.r2Key,b.r2Key))
        .forEach(entry=>{
          item.parts.push({
            id:uniqueId(`${id}-${slugify(entry.title)}`),
            title:entry.title,
            file:`assets/pdf-v2/${entry.r2Key}`,
            pages:Math.max(1,Math.floor(Number(entry.pages)||1))
          });
        });
    }else{
      groupCount++;
      children.forEach(child=>{
        const childItem=buildNode(child,category,false);
        item.parts.push({
          id:uniqueId(`${id}-ref-${childItem.id}`),
          title:childItem.title,
          itemId:childItem.id
        });
      });
    }

    items.push(item);
    return item;
  }

  [...tree.folders.values()]
    .sort((a,b)=>naturalCompare(a.name,b.name))
    .forEach(categoryNode=>{
      const category=categoryTitleFromFolder(categoryNode.name);
      if(!categories.includes(category))categories.push(category);
      buildNode(categoryNode,category,true);
    });

  const books={...clone(data)};
  books.version='2.40.2-category-rename-routing';
  books.categories=['Semua',...categories];
  books.items=items;

  return {
    rootName,
    tree,
    books,
    errors:[...new Set(errors)],
    warnings:[...new Set(warnings)],
    groupCount,
    collectionCount
  };
}

function rebuildTreeMarkup(node,depth=0){
  const children=[...node.folders.values()].sort((a,b)=>naturalCompare(a.name,b.name));
  const leaf=children.length===0;
  const rows=[];
  if(node.name){
    rows.push(`<div class="rebuild-tree-row folder-row" style="--depth:${depth}">
      <span class="${leaf?'rebuild-collection-icon':'rebuild-folder-icon'}" aria-hidden="true"></span>
      <span><b>${esc(displayFolderTitle(node.name))}</b><small>${esc(node.path)}</small></span>
      <em class="${leaf?'collection-badge':'group-badge'}">${leaf?'Collection':'Group'}</em>
    </div>`);
  }
  [...node.files].sort((a,b)=>naturalCompare(a.r2Key,b.r2Key)).forEach(file=>{
    rows.push(`<div class="rebuild-tree-row pdf-row ${children.length?'invalid-row':''}" style="--depth:${depth+(node.name?1:0)}">
      <span class="rebuild-pdf-icon">PDF</span>
      <span><b>${esc(file.title)}</b><small>${esc(file.r2Key)}</small></span>
      <em>${Math.max(1,Number(file.pages)||1)} hal.</em>
    </div>`);
  });
  children.forEach(child=>rows.push(rebuildTreeMarkup(child,depth+(node.name?1:0))));
  return rows.join('');
}

function renderRebuildPlan(){
  const plan=rebuildPlan;
  if(!plan)return;
  const issueCount=plan.errors.length+plan.warnings.length;
  $('#rebuildPdfCount').textContent=String(rebuildEntries.length);
  $('#rebuildGroupCount').textContent=String(plan.groupCount);
  $('#rebuildCollectionCount').textContent=String(plan.collectionCount);
  $('#rebuildIssueCount').textContent=String(issueCount);
  $('#rebuildTree').innerHTML=rebuildTreeMarkup(plan.tree)||'<div class="rebuild-empty">Tidak ada struktur PDF yang dapat dibangun.</div>';

  const issues=[];
  if(!plan.errors.length&&!plan.warnings.length){
    issues.push('<div class="rebuild-issue ok"><b>✓ Struktur siap</b><small>Folder dan R2 key sudah konsisten.</small></div>');
  }
  plan.errors.forEach(message=>issues.push(`<div class="rebuild-issue error"><b>!</b><span><strong>Error</strong><small>${esc(message)}</small></span></div>`));
  plan.warnings.forEach(message=>issues.push(`<div class="rebuild-issue warning"><b>△</b><span><strong>Perlu dicek</strong><small>${esc(message)}</small></span></div>`));
  $('#rebuildIssues').innerHTML=issues.join('');

  $('#downloadUploadManifestBtn').disabled=plan.errors.length>0;
  $('#downloadCleanupManifestBtn').disabled=plan.errors.length>0;
  $('#downloadRefreshPlanBtn').disabled=plan.errors.length>0;
  $('#downloadTechnicalReportBtn').disabled=plan.errors.length>0;
  $('#applyRebuildBtn').disabled=plan.errors.length>0;
  $('#applyRebuildBtn').textContent='Gunakan sebagai Katalog Baru';
}

async function handleRebuildFolder(e){
  const allFiles=[...(e.target.files||[])];
  const files=allFiles.filter(file=>/\.pdf$/i.test(file.name));
  rebuildIgnoredCount=allFiles.length-files.length;
  e.target.value='';
  if(!files.length){
    toast('Folder utama tidak berisi PDF.','warn');
    return;
  }

  const token=++rebuildScanToken;
  const firstPath=(files[0].webkitRelativePath||files[0].name).replace(/\\/g,'/');
  const rootName=firstPath.split('/')[0]||'Folder Utama';
  rebuildCleanupKeys=catalogPdfKeys(data);
  rebuildEntries=files.map(file=>{
    const localPath=(file.webkitRelativePath||file.name).replace(/\\/g,'/');
    const segments=localPath.split('/').filter(Boolean);
    if(segments[0]===rootName)segments.shift();
    const key=segments.join('/');
    return {
      file,
      localPath,
      relativePath:key,
      r2Key:key,
      filename:safePdfFilename(file.name),
      title:titleFromFilename(file.name),
      pages:1,
      pagesDetected:false,
      size:Number(file.size)||0,
      lastModified:Number(file.lastModified)||0
    };
  }).sort((a,b)=>naturalCompare(a.r2Key,b.r2Key));

  $('#rebuildRootName').textContent=rootName;
  $('#rebuildScanStatus').textContent=`Membaca struktur dan jumlah halaman 0/${rebuildEntries.length} PDF…`;
  rebuildPlan=buildRebuildPlan(rebuildEntries,rootName);
  renderRebuildPlan();
  $('#downloadUploadManifestBtn').disabled=true;
  $('#downloadCleanupManifestBtn').disabled=true;
  $('#downloadRefreshPlanBtn').disabled=true;
  $('#downloadTechnicalReportBtn').disabled=true;
  $('#applyRebuildBtn').disabled=true;

  let cursor=0;
  let completed=0;
  async function worker(){
    while(token===rebuildScanToken){
      const index=cursor++;
      if(index>=rebuildEntries.length)return;
      const entry=rebuildEntries[index];
      const pages=await detectPdfPages(entry.file);
      if(token!==rebuildScanToken)return;
      if(pages){entry.pages=pages;entry.pagesDetected=true;}
      completed++;
      $('#rebuildScanStatus').textContent=`Membaca struktur dan jumlah halaman ${completed}/${rebuildEntries.length} PDF…`;
    }
  }

  await Promise.all(Array.from({length:Math.min(4,rebuildEntries.length)},worker));
  if(token!==rebuildScanToken)return;
  rebuildPlan=buildRebuildPlan(rebuildEntries,rootName);
  renderRebuildPlan();
  $('#rebuildScanStatus').textContent=rebuildPlan.errors.length
    ? `Pemindaian selesai • ${rebuildPlan.errors.length} error wajib diperbaiki di folder lokal.`
    : `Pemindaian selesai • ${rebuildEntries.length} PDF siap menjadi katalog dan object R2.`;
}

function rebuildUploadManifest(){
  const generatedAt=new Date().toISOString();
  return {
    schemaVersion:1,
    kind:'amaliyah-r2-upload-manifest',
    generatedAt,
    sourceOfTruth:'local-folder',
    rootFolder:rebuildPlan?.rootName||'',
    target:'cloudflare-r2',
    objectCount:rebuildEntries.length,
    totalBytes:rebuildEntries.reduce((sum,entry)=>sum+entry.size,0),
    objects:rebuildEntries.map(entry=>({
      localPath:entry.localPath,
      relativePath:entry.relativePath,
      r2Key:entry.r2Key,
      contentType:'application/pdf',
      sizeBytes:entry.size,
      lastModified:entry.lastModified?new Date(entry.lastModified).toISOString():null
    }))
  };
}

function rebuildCleanupManifest(){
  const generatedAt=new Date().toISOString();
  const expectedKeys=rebuildEntries.map(entry=>entry.r2Key).sort(naturalCompare);
  const expectedSet=new Set(expectedKeys);
  const obsoleteKeys=rebuildCleanupKeys.filter(key=>!expectedSet.has(key)).sort(naturalCompare);
  return {
    schemaVersion:2,
    kind:'amaliyah-r2-safe-cleanup-manifest',
    generatedAt,
    strategy:'delete-obsolete-after-upload-and-verification',
    safety:'Default cleanup only deletes keys that are absent from the rebuilt catalog.',
    source:'books.json loaded before rebuild',
    previousCatalogCount:rebuildCleanupKeys.length,
    replacementCount:expectedKeys.length,
    deleteCount:obsoleteKeys.length,
    deleteKeys:obsoleteKeys,
    expectedKeys,
    retainedKeys:rebuildCleanupKeys.filter(key=>expectedSet.has(key)).sort(naturalCompare)
  };
}

function rebuildRefreshPlan(){
  const generatedAt=new Date().toISOString();
  const upload=rebuildUploadManifest();
  const safeCleanup=rebuildCleanupManifest();
  return {
    schemaVersion:1,
    kind:'amaliyah-r2-full-refresh-plan',
    generatedAt,
    sourceOfTruth:'local-folder',
    warning:'Full refresh deletes every object key referenced by the previous catalog. Verify bucket/prefix and keep a backup before deleting.',
    recommendedOrder:[
      'backup-current-r2-or-confirm-recoverability',
      'download-and-publish-books-json',
      'upload-all-objects-from-upload-manifest',
      'verify-random-reader-samples',
      'run-safe-cleanup-for-obsolete-keys'
    ],
    fullRefreshAlternative:{
      useOnlyWhenIntentional:true,
      order:['backup','delete-fullRefreshDeleteKeys','upload-all-objects','verify-reader'],
      deleteCount:rebuildCleanupKeys.length,
      fullRefreshDeleteKeys:[...rebuildCleanupKeys]
    },
    uploadManifest:upload,
    safeCleanupManifest:safeCleanup
  };
}

function humanDateTime(){
  return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date());
}

function simpleUploadText(){
  const rows=rebuildEntries.map((entry,index)=>`${index+1}. ${entry.localPath}\n   → R2: ${entry.r2Key}`);
  return [
    'AMALIYAH — DAFTAR FILE YANG PERLU DIUPLOAD',
    '===========================================',
    `Dibuat: ${humanDateTime()}`,
    `Folder utama: ${rebuildPlan?.rootName||'-'}`,
    `Jumlah PDF: ${rebuildEntries.length}`,
    '',
    'CARA PAKAI:',
    '1. Upload setiap PDF ke Cloudflare R2.',
    '2. Pastikan alamat/key di R2 sama persis dengan yang tertulis setelah tanda “→ R2:”.',
    '3. Setelah selesai, coba buka beberapa bacaan dari aplikasi.',
    '4. Jangan hapus file lama sebelum file baru sudah berhasil dibuka.',
    '',
    'DAFTAR FILE:',
    rows.length?rows.join('\n\n'):'Tidak ada PDF yang perlu diupload.',
    '',
    'Catatan: file TXT ini hanya panduan. Tidak perlu diupload ke R2.'
  ].join('\n');
}

function simpleCleanupText(){
  const cleanup=rebuildCleanupManifest();
  const rows=cleanup.deleteKeys.map((key,index)=>`${index+1}. ${key}`);
  return [
    'AMALIYAH — FILE LAMA YANG AMAN DIHAPUS',
    '=======================================',
    `Dibuat: ${humanDateTime()}`,
    `Jumlah file yang aman dihapus: ${cleanup.deleteCount}`,
    '',
    'KAPAN DIPAKAI?',
    'Gunakan SETELAH PDF terbaru selesai diupload ke R2 dan sudah kamu cek dari aplikasi.',
    '',
    'CARA PAKAI:',
    '1. Buka Cloudflare R2.',
    '2. Cari file dengan key/path yang tercantum di bawah.',
    '3. Hapus HANYA file yang ada di daftar ini.',
    '4. File yang tidak ada di daftar ini jangan dihapus.',
    '',
    cleanup.deleteCount?'FILE YANG AMAN DIHAPUS:':'HASIL PEMERIKSAAN:',
    rows.length?rows.join('\n'):'Tidak ada file lama yang perlu dihapus. R2 sudah bersih terhadap katalog lama yang diketahui.',
    '',
    'Catatan: file TXT ini hanya panduan. Tidak perlu diupload ke R2.'
  ].join('\n');
}

function simpleRefreshText(){
  const plan=rebuildRefreshPlan();
  const deleteKeys=plan.fullRefreshAlternative.fullRefreshDeleteKeys||[];
  const uploadRows=rebuildEntries.map((entry,index)=>`${index+1}. ${entry.localPath}\n   → R2: ${entry.r2Key}`);
  return [
    'AMALIYAH — RENCANA BERSIHKAN & UPLOAD ULANG SEMUA',
    '=================================================',
    `Dibuat: ${humanDateTime()}`,
    '',
    '⚠ PERINGATAN PENTING',
    'Ini BUKAN langkah maintenance rutin. Gunakan hanya jika kamu memang ingin melakukan reset besar isi R2.',
    'Simpan backup terlebih dahulu dan pastikan kamu berada pada bucket/folder R2 yang benar.',
    '',
    'URUTAN YANG DISARANKAN:',
    '1. Backup file lama atau pastikan semua PDF lokal terbaru lengkap.',
    '2. Hapus file lama yang tercantum pada BAGIAN A.',
    '3. Upload semua PDF pada BAGIAN B ke alamat R2 yang tertulis.',
    '4. Ganti books.json di GitHub dengan hasil terbaru.',
    '5. Coba buka beberapa bacaan di aplikasi sebelum menganggap pekerjaan selesai.',
    '',
    `BAGIAN A — FILE LAMA YANG AKAN DIHAPUS (${deleteKeys.length})`,
    deleteKeys.length?deleteKeys.map((key,index)=>`${index+1}. ${key}`).join('\n'):'Tidak ada key katalog lama yang tercatat.',
    '',
    `BAGIAN B — FILE YANG HARUS DIUPLOAD ULANG (${rebuildEntries.length})`,
    uploadRows.length?uploadRows.join('\n\n'):'Tidak ada PDF.',
    '',
    'Catatan: file TXT ini hanya panduan. Tidak perlu diupload ke R2.'
  ].join('\n');
}

function downloadRebuildUploadManifest(){
  if(!rebuildPlan||rebuildPlan.errors.length)return;
  downloadText(simpleUploadText(),'DAFTAR-FILE-UNTUK-DIUPLOAD.txt');
  toast('Daftar file untuk diupload sudah dibuat. Isinya TXT sederhana.','ok');
}

function downloadRebuildCleanupManifest(){
  if(!rebuildPlan||rebuildPlan.errors.length)return;
  downloadText(simpleCleanupText(),'FILE-LAMA-AMAN-DIHAPUS.txt');
  toast('Daftar file lama yang aman dihapus sudah dibuat.','ok');
}

async function downloadRebuildRefreshPlan(){
  if(!rebuildPlan||rebuildPlan.errors.length)return;
  const ok=await confirmInternal(
    'Buat rencana reset besar R2?',
    'Fitur ini untuk kondisi khusus ketika kamu ingin membersihkan file katalog lama dan mengupload ulang semuanya. Untuk maintenance biasa, gunakan “File Lama Aman Dihapus”.',
    'Ya, Buat Rencana',
    'Batal'
  );
  if(!ok)return;
  downloadText(simpleRefreshText(),'RENCANA-BERSIHKAN-DAN-UPLOAD-ULANG-SEMUA.txt');
  toast('Rencana reset besar sudah dibuat. Baca bagian PERINGATAN sebelum digunakan.','ok');
}

function downloadRebuildTechnicalReport(){
  if(!rebuildPlan||rebuildPlan.errors.length)return;
  downloadJson({
    keterangan:'Laporan teknis lengkap. Untuk penggunaan harian, gunakan file TXT sederhana dari tombol lain.',
    upload:rebuildUploadManifest(),
    safeCleanup:rebuildCleanupManifest(),
    fullRefresh:rebuildRefreshPlan()
  },'LAPORAN-TEKNIS-R2.json');
  toast('Laporan teknis JSON sudah dibuat. File ini opsional.','ok');
}

async function applyRebuildCatalog(){
  if(!rebuildPlan||rebuildPlan.errors.length)return;
  const ok=await confirmInternal(
    'Ganti seluruh katalog?',
    `Seluruh struktur katalog editor saat ini akan diganti oleh hasil folder “${rebuildPlan.rootName}”. Backup lokal dibuat terlebih dahulu. PDF fisik di R2 belum disentuh.`,
    'Ya, Ganti Katalog',
    'Batal'
  );
  if(!ok)return;

  createBackup('Sebelum Rebuild Catalog from Folder');
  data=clone(rebuildPlan.books);
  selectedId=null;
  explorerCategory='';
  explorerItemId=null;
  selectedPartRef=null;
  refreshCategoryUI();
  markDirty('Katalog dibangun ulang dari folder lokal');
  renderList();
  showEmptyEditor();
  $('#applyRebuildBtn').disabled=true;
  $('#applyRebuildBtn').textContent='Katalog Baru Sudah Digunakan';
  $('#rebuildScanStatus').textContent='Katalog baru sudah masuk ke editor. Download kedua manifest, lalu Preview & Download books.json.';
  toast('Rebuild selesai. Download manifest R2 dan books.json.','ok');
}

/* ===================== CREATE / DELETE ITEM ===================== */
function newFolderDestinations(){
  const rootDestination={
    value:'root::',
    label:'Bacaan  •  Kategori Baru',
    category:'',
    item:null,
    root:true
  };
  const destinations=categories().map(category=>({
    value:`category::${category}`,
    label:`Bacaan › ${category}`,
    category,
    item:null
  }));

  data.items.forEach(item=>{
    const parts=Array.isArray(item.parts)?item.parts:[];
    const canContainFolder=item.type==='group'||parts.length===0;
    if(!canContainFolder)return;
    destinations.push({
      value:`item::${item.id}`,
      label:explorerPathForItem(item),
      category:item.category||'Lainnya',
      item
    });
  });

  return [rootDestination,...destinations.sort((a,b)=>naturalCompare(a.label,b.label))];
}

function populateNewFolderLocations(){
  const select=$('#newFolderLocationInput');
  const destinations=newFolderDestinations();
  select.innerHTML=destinations.map(destination=>
    `<option value="${esc(destination.value)}">${esc(destination.label)}</option>`
  ).join('');

  let preferred='';
  if(explorerItemId && destinations.some(x=>x.value===`item::${explorerItemId}`)){
    preferred=`item::${explorerItemId}`;
  }else if(explorerCategory && destinations.some(x=>x.value===`category::${explorerCategory}`)){
    preferred=`category::${explorerCategory}`;
  }else{
    preferred='root::';
  }
  select.value=preferred||destinations[0]?.value||'';
  return destinations;
}

function openNewFolderDialog(){
  const destinations=populateNewFolderLocations();
  if(!destinations.length){
    toast('Belum ada kategori yang dapat menjadi lokasi Folder Baru.','warn');
    return;
  }
  $('#newFolderNameInput').value='Folder Baru';
  showFormError($('#newFolderFormError'),'');
  $('#newFolderDialog').showModal();
  setTimeout(()=>{$('#newFolderNameInput').focus();$('#newFolderNameInput').select();},30);
}

function closeNewFolderDialog(){
  $('#newFolderDialog').close();
}

function createNewFolder(){
  const title=$('#newFolderNameInput').value.trim().replace(/\s+/g,' ');
  if(!title){
    showFormError($('#newFolderFormError'),'Nama folder wajib diisi.');
    $('#newFolderNameInput').focus();
    return;
  }

  const raw=$('#newFolderLocationInput').value;
  if(raw==='root::'){
    const error=categoryNameError(title);
    if(error){
      showFormError($('#newFolderFormError'),error);
      $('#newFolderNameInput').focus();
      return;
    }
    data.categories=Array.isArray(data.categories)?data.categories:[];
    if(!data.categories.includes('Semua'))data.categories.unshift('Semua');
    data.categories.push(title);
    data.draftCategories=Array.isArray(data.draftCategories)?data.draftCategories:[];
    data.draftCategories.push(title);
    closeNewFolderDialog();
    resetExplorerSelection();
    explorerCategory='';
    explorerItemId=null;
    selectedId=null;
    explorerSelection.add(categorySelectionKey(title));
    explorerSelectionAnchor=categorySelectionKey(title);
    refreshCategoryUI();
    $('#categoryFilter').value='';
    markDirty(`Kategori Draft “${title}” dibuat di root Bacaan`);
    renderList();
    showCategoryInspector(title);
    toast(`Kategori Draft “${title}” berhasil dibuat. Isi dapat ditambahkan nanti.`,'ok');
    return;
  }
  let parent=null;
  let category='Lainnya';
  if(raw.startsWith('item::')){
    parent=data.items.find(item=>item.id===raw.slice(6))||null;
    if(!parent){
      showFormError($('#newFolderFormError'),'Lokasi folder tidak ditemukan. Pilih lokasi lain.');
      return;
    }
    const parentParts=Array.isArray(parent.parts)?parent.parts:[];
    if(parent.type==='collection'&&parentParts.length){
      showFormError($('#newFolderFormError'),'Collection yang sudah berisi PDF tidak dapat memiliki subfolder.');
      return;
    }
    category=parent.category||'Lainnya';
  }else if(raw.startsWith('category::')){
    category=raw.slice(10)||'Lainnya';
  }

  const id=uniqueItemId(slugify(title));
  const folder={
    id,
    title,
    category,
    type:'group',
    parts:[],
    draftFolder:true
  };

  if(parent){
    if(parent.type==='collection')parent.type='group';
    delete parent.draftFolder;
    parent.parts=Array.isArray(parent.parts)?parent.parts:[];
    folder.hidden=true;
    data.items.push(folder);
    parent.parts.push({
      id:uniquePartId(`${parent.id}-ref-${folder.id}`),
      title:folder.title,
      itemId:folder.id
    });
    explorerCategory=category;
    explorerItemId=parent.id;
  }else{
    data.items.push(folder);
    explorerCategory=category;
    explorerItemId=null;
    $('#categoryFilter').value=category;
  }

  closeNewFolderDialog();
  resetExplorerSelection();
  explorerSelection.add(itemSelectionKey(folder.id));
  explorerSelectionAnchor=itemSelectionKey(folder.id);
  selectedId=folder.id;
  refreshCategoryUI();
  $('#categoryFilter').value=category;
  markDirty(`Folder “${title}” dibuat tanpa PDF`);
  renderList();
  selectItem(folder.id);
  toast(`Folder “${title}” berhasil dibuat. PDF dapat ditambahkan nanti.`,'ok');
}

function openItemDialog(){
  $('#newTitleInput').value='';
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
  const id=uniqueItemId(slugify(title));

  const item={
    id,
    title,
    category,
    type
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

  draftCategoryNames().forEach(category=>{
    const hasContent=(data.items||[]).some(item=>item.category===category);
    if(!hasContent){
      errors.push({
        scope:`Kategori: ${category}`,
        category,
        message:'Kategori Draft masih kosong.',
        fix:'Buka kategori lalu buat folder atau tambahkan bacaan. Kategori kosong tetap aman di Simpan Draft, tetapi tidak dapat diekspor ke books.json.',
        field:'draft-category'
      });
    }
  });

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


    if(item.type==='single'){
      validateFile(label,item.file,item.pages,errors,warnings,paths,{...base,field:'single-file'});
    }else if(VALID_TYPES.has(item.type)){
      if(!Array.isArray(item.parts)){
        errors.push({...base,scope:label,message:'parts[] tidak ditemukan.',fix:'Ubah tipe lalu kembalikan, atau buat ulang struktur bagian.',field:'parts'});
      }else if(!item.parts.length){
        errors.push({...base,scope:label,
          message:item.draftFolder?'Folder baru masih kosong.':'Belum memiliki bagian/PDF.',
          fix:item.draftFolder
            ?'Isi folder dengan PDF atau subfolder sebelum mengekspor books.json. Folder kosong tetap aman sebagai draft lokal.'
            :'Klik “+ Tambah Bagian” atau gunakan Batch Import PDF.',
          field:'parts'});
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

  if(issue.category && issue.field==='draft-category'){
    explorerCategory='';
    explorerItemId=null;
    selectedId=null;
    resetExplorerSelection();
    explorerSelection.add(categorySelectionKey(issue.category));
    explorerSelectionAnchor=categorySelectionKey(issue.category);
    $('#categoryFilter').value='';
    renderList();
    showCategoryInspector(issue.category);
    if(issue.fix)showFormError($('#categoryInspectorError'),issue.fix);
    return;
  }

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
  data.version='2.40.2-category-rename-routing';

  downloadJson(data,'books.json');
  localStorage.removeItem(DRAFT_KEY);
  original=clone(data);
  dirty=false;

  $('#validationDialog').close();
  updateAllStatus(false,'books.json berhasil dibuat — replace file ini di GitHub');
  toast('books.json berhasil di-download.','ok');
}

function downloadText(text,filename){
  const blob=new Blob([String(text||'')+'\n'],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
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
