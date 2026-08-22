const $=s=>document.querySelector(s);
const clone=o=>JSON.parse(JSON.stringify(o));
const DRAFT_KEY='amaliyah:admin:draft:v1';

let original=null;
let data=null;
let selectedId=null;
let editingPartIndex=-1;
let dirty=false;
let dragIndex=null;

async function boot(){
  original=await fetch('./books.json',{cache:'no-store'}).then(r=>{
    if(!r.ok)throw new Error('books.json gagal dimuat');
    return r.json();
  });
  const draft=localStorage.getItem(DRAFT_KEY);
  if(draft){
    try{
      const parsed=JSON.parse(draft);
      if(parsed?.items && confirm('Ada draft Admin Koleksi yang belum diekspor. Muat draft tersebut?')) data=parsed;
    }catch{}
  }
  if(!data)data=clone(original);
  bind();
  fillCategories();
  renderList();
  if(innerWidth>820 && data.items?.length){ selectItem(data.items[0].id); }
  updateStatus(false);
}
function bind(){
  $('#searchInput').addEventListener('input',renderList);
  $('#categoryFilter').addEventListener('change',renderList);
  $('#addItemBtn').onclick=()=>$('#itemDialog').showModal();
  $('#createItemBtn').onclick=createItem;
  $('#deleteItemBtn').onclick=deleteItem;
  $('#titleInput').oninput=()=>patchSelected('title',$('#titleInput').value);
  $('#categoryInput').onchange=()=>patchSelected('category',$('#categoryInput').value);
  $('#typeInput').onchange=changeType;
  $('#iconInput').oninput=()=>patchSelected('icon',$('#iconInput').value);
  $('#singleFileInput').oninput=()=>patchSelected('file',$('#singleFileInput').value);
  $('#singlePagesInput').oninput=()=>patchSelected('pages',Math.max(1,+$('#singlePagesInput').value||1));
  $('#addPartBtn').onclick=()=>openPartDialog();
  $('#savePartBtn').onclick=savePart;
  $('#partTitleInput').oninput=()=>{
    if(editingPartIndex<0 && !$('#partIdInput').dataset.touched){
      $('#partIdInput').value=uniquePartId(slugify($('#partTitleInput').value));
    }
  };
  $('#partIdInput').oninput=()=>$('#partIdInput').dataset.touched='1';
  $('#partPdfPicker').onchange=handlePdfPicker;
  $('#exportBtn').onclick=exportJson;
  $('#importBtn').onclick=()=>$('#importFile').click();
  $('#importFile').onchange=importJson;
  $('#resetBtn').onclick=reloadOriginal;
  $('#saveDraftBtn').onclick=saveDraft;
  $('#newTitleInput').oninput=()=>{};
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
}
function categories(){
  const base=(data.categories||[]).filter(x=>x!=='Semua');
  const fromItems=data.items.map(x=>x.category).filter(Boolean);
  return [...new Set([...base,...fromItems])];
}
function fillCategories(){
  const cats=categories();
  $('#categoryFilter').innerHTML='<option value="">Semua kategori</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');
  $('#categoryInput').innerHTML=cats.map(c=>`<option>${esc(c)}</option>`).join('');
  $('#newCategoryInput').innerHTML=cats.map(c=>`<option>${esc(c)}</option>`).join('');
}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function slugify(s=''){
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'bacaan-baru';
}
function uniqueItemId(base){
  let id=base,n=2;while(data.items.some(x=>x.id===id)){id=`${base}-${n++}`}return id;
}
function uniquePartId(base){
  const ids=new Set(data.items.flatMap(x=>x.type==='single'?[x.id]:(x.parts||[]).map(p=>p.id)));
  let id=base,n=2;while(ids.has(id)){id=`${base}-${n++}`}return id;
}
function getSelected(){return data.items.find(x=>x.id===selectedId)}
function updateStatus(isDirty=true,msg=''){
  dirty=isDirty;
  $('#dirtyDot').classList.toggle('dirty',dirty);
  $('#statusText').textContent=msg||(dirty?'Ada perubahan yang belum di-download':'Belum ada perubahan');
  $('#catalogInfo').textContent=`${data.items.length} item induk • ${totalPdf()} PDF`;
}
function totalPdf(){return data.items.reduce((n,x)=>n+(x.type==='single'?1:(x.parts||[]).length),0)}
function markDirty(msg='Perubahan tersimpan di editor'){updateStatus(true,msg);renderList()}
function saveDraft(){localStorage.setItem(DRAFT_KEY,JSON.stringify(data));updateStatus(dirty,'Draft disimpan di perangkat ini')}
function renderList(){
  const q=$('#searchInput').value.trim().toLowerCase();
  const cat=$('#categoryFilter').value;
  const arr=data.items.filter(x=>(!cat||x.category===cat)&&(!q||[x.title,x.category,...(x.parts||[]).map(p=>p.title)].join(' ').toLowerCase().includes(q)));
  $('#itemList').innerHTML=arr.map(x=>{
    const count=x.type==='single'?(x.pages?`${x.pages} hal.`:'1 PDF'):`${x.parts?.length||0} bagian`;
    return `<button class="item-card ${x.id===selectedId?'active':''}" data-id="${esc(x.id)}">
      <span class="item-icon">${esc(x.icon||'◈')}</span>
      <span class="item-copy"><b>${esc(x.title)}</b><small>${esc(x.category)} • ${esc(x.type)}</small></span>
      <span class="item-count">${count}</span>
    </button>`;
  }).join('');
  $('#itemList').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>selectItem(b.dataset.id));
  updateStatus(dirty);
}
function selectItem(id){
  selectedId=id;renderList();
  document.querySelector('.item-card.active')?.scrollIntoView({block:'nearest'});
  const x=getSelected();if(!x)return;
  $('#emptyEditor').classList.add('hidden');$('#editorContent').classList.remove('hidden');
  $('#editorHeading').textContent=x.title;$('#editorTypeBadge').textContent=x.type;
  $('#titleInput').value=x.title||'';$('#categoryInput').value=x.category||'';
  $('#typeInput').value=x.type||'single';$('#iconInput').value=x.icon||'';
  $('#idInput').value=x.id||'';
  $('#singleFields').classList.toggle('hidden',x.type!=='single');
  $('#partsSection').classList.toggle('hidden',x.type==='single');
  if(x.type==='single'){
    $('#singleFileInput').value=x.file||'';$('#singlePagesInput').value=x.pages||1;
  }else renderParts();
}
function patchSelected(key,value){
  const x=getSelected();if(!x)return;x[key]=value;
  if(key==='title')$('#editorHeading').textContent=value;
  markDirty();
}
function changeType(){
  const x=getSelected();if(!x)return;
  const next=$('#typeInput').value;if(next===x.type)return;
  const warning=x.type==='single'
    ? 'Mengubah Single menjadi Collection/Group akan memindahkan PDF saat ini menjadi bagian pertama.'
    : next==='single'
      ? 'Mengubah menjadi Single akan memakai bagian pertama dan menghapus struktur bagian lainnya dari data editor.'
      : '';
  if(warning&&!confirm(warning)){ $('#typeInput').value=x.type;return }
  if(x.type==='single' && next!=='single'){
    x.parts=[{id:x.id+'-bagian-1',title:x.title,file:x.file||'',pages:x.pages||1}];
    delete x.file;delete x.pages;
  }else if(x.type!=='single' && next==='single'){
    const p=x.parts?.[0]||{};
    x.file=p.file||'';x.pages=p.pages||1;delete x.parts;
  }
  x.type=next;markDirty();selectItem(x.id);
}
function renderParts(){
  const x=getSelected();if(!x||x.type==='single')return;
  $('#partsHeading').textContent=x.type==='collection'?'Bagian Koleksi':'Isi Kelompok';
  $('#partsList').innerHTML=(x.parts||[]).map((p,i)=>`<div class="part-row" draggable="true" data-index="${i}">
    <button class="drag-handle" type="button" title="Drag untuk mengurutkan">☰</button>
    <span class="part-num">${String(i+1).padStart(2,'0')}</span>
    <span class="part-copy"><b>${esc(p.title)}</b><small>${esc(p.file||'')} • ${p.pages||1} hal.</small></span>
    <span class="part-actions">
      <button type="button" data-up="${i}" title="Naik">↑</button>
      <button type="button" data-down="${i}" title="Turun">↓</button>
      <button type="button" data-edit="${i}">Edit</button>
      <button type="button" data-remove="${i}">Hapus</button>
    </span>
  </div>`).join('');
  const list=$('#partsList');
  list.querySelectorAll('.part-row').forEach(row=>{
    row.addEventListener('dragstart',()=>{dragIndex=+row.dataset.index;row.classList.add('dragging')});
    row.addEventListener('dragend',()=>{dragIndex=null;row.classList.remove('dragging')});
    row.addEventListener('dragover',e=>e.preventDefault());
    row.addEventListener('drop',e=>{
      e.preventDefault();const to=+row.dataset.index;
      if(dragIndex===null||dragIndex===to)return;
      movePart(dragIndex,to);
    });
  });
  list.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>movePart(+b.dataset.up,+b.dataset.up-1));
  list.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>movePart(+b.dataset.down,+b.dataset.down+1));
  list.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openPartDialog(+b.dataset.edit));
  list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>removePart(+b.dataset.remove));
}
function movePart(from,to){
  const x=getSelected();if(!x||to<0||to>=x.parts.length)return;
  const [p]=x.parts.splice(from,1);x.parts.splice(to,0,p);markDirty('Urutan bagian diubah');renderParts();
}
function removePart(i){
  const x=getSelected();const p=x?.parts?.[i];if(!p)return;
  if(!confirm(`Hapus "${p.title}" dari daftar?\\n\\nFile PDF di GitHub tidak ikut terhapus.`))return;
  x.parts.splice(i,1);markDirty('Bagian dihapus dari data');renderParts();
}
function openPartDialog(i=-1){
  const x=getSelected();if(!x)return;editingPartIndex=i;
  const p=i>=0?x.parts[i]:null;
  $('#partDialogMode').textContent=i>=0?'EDIT BAGIAN':'BAGIAN BARU';
  $('#partDialogTitle').textContent=i>=0?'Edit Bagian':'Tambah Bagian';
  $('#partTitleInput').value=p?.title||'';
  $('#partIdInput').value=p?.id||'';
  $('#partIdInput').readOnly=i>=0;
  $('#partIdInput').dataset.touched='';
  $('#partFileInput').value=p?.file||suggestFolderPath(x);
  $('#partPagesInput').value=p?.pages||1;
  $('#partPdfPicker').value='';
  $('#partDialog').showModal();
}
function suggestFolderPath(x){
  const folder={["Al-Qur'an"]:'quran',Wirid:'wirid',Doa:'doa',Maulid:'maulid',Dalail:'dalail',Syair:'syair',Khutbah:'khutbah'}[x.category]||'doa';
  const sub=x.type==='single'?'':`${slugify(x.id||x.title)}/`;
  return `assets/pdf-v2/${folder}/${sub}`;
}
function handlePdfPicker(){
  const f=$('#partPdfPicker').files?.[0];if(!f)return;
  const x=getSelected();
  let current=$('#partFileInput').value.trim();
  if(!current||current.endsWith('/')) $('#partFileInput').value=(current||suggestFolderPath(x))+slugify(f.name.replace(/\.pdf$/i,''))+'.pdf';
  if(!$('#partTitleInput').value) $('#partTitleInput').value=f.name.replace(/\.pdf$/i,'').replace(/[-_]+/g,' ');
  if(editingPartIndex<0&&!$('#partIdInput').value) $('#partIdInput').value=uniquePartId(slugify($('#partTitleInput').value));
}
function savePart(){
  const x=getSelected();if(!x)return;
  const title=$('#partTitleInput').value.trim();
  let id=$('#partIdInput').value.trim();
  const file=$('#partFileInput').value.trim();
  const pages=Math.max(1,+$('#partPagesInput').value||1);
  if(!title||!file){alert('Judul dan Path PDF wajib diisi.');return}
  if(editingPartIndex<0){
    id=id||uniquePartId(slugify(title));
    if(data.items.some(it=>it.id===id||(it.parts||[]).some(p=>p.id===id))){alert('ID sudah digunakan.');return}
    x.parts.push({id,title,file,pages});
  }else{
    const p=x.parts[editingPartIndex];p.title=title;p.file=file;p.pages=pages;
  }
  $('#partDialog').close();markDirty(editingPartIndex<0?'Bagian baru ditambahkan':'Bagian diperbarui');renderParts();
}
function createItem(){
  const title=$('#newTitleInput').value.trim();if(!title){alert('Judul wajib diisi.');return}
  const type=$('#newTypeInput').value,category=$('#newCategoryInput').value,icon=$('#newIconInput').value.trim()||'◈';
  const id=uniqueItemId(slugify(title));
  const item={id,title,category,type,icon,coverText:title};
  if(type==='single'){item.file='assets/pdf-v2/';item.pages=1}else item.parts=[];
  data.items.push(item);$('#itemDialog').close();
  $('#newTitleInput').value='';$('#newIconInput').value='';
  selectedId=id;markDirty('Bacaan baru dibuat');fillCategories();selectItem(id);
}
function deleteItem(){
  const x=getSelected();if(!x)return;
  if(!confirm(`Hapus "${x.title}" dari books.json?\\n\\nPDF fisik tidak ikut dihapus.`))return;
  data.items=data.items.filter(i=>i.id!==x.id);selectedId=null;markDirty('Bacaan dihapus dari data');
  $('#editorContent').classList.add('hidden');$('#emptyEditor').classList.remove('hidden');renderList();
}
function exportJson(){
  data.version='2.18-admin';
  const blob=new Blob([JSON.stringify(data,null,2)+'\\n'],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='books.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  localStorage.removeItem(DRAFT_KEY);updateStatus(false,'books.json berhasil dibuat — upload file ini ke GitHub');
}
async function importJson(e){
  const f=e.target.files?.[0];if(!f)return;
  try{
    const parsed=JSON.parse(await f.text());
    if(!Array.isArray(parsed.items))throw new Error('Format tidak valid');
    data=parsed;original=clone(parsed);selectedId=null;fillCategories();renderList();
    $('#editorContent').classList.add('hidden');$('#emptyEditor').classList.remove('hidden');
    updateStatus(false,'JSON berhasil di-import');
  }catch(err){alert('File JSON tidak valid.')}
  e.target.value='';
}
function reloadOriginal(){
  if(dirty&&!confirm('Buang perubahan yang belum di-download?'))return;
  data=clone(original);localStorage.removeItem(DRAFT_KEY);selectedId=null;
  fillCategories();renderList();$('#editorContent').classList.add('hidden');$('#emptyEditor').classList.remove('hidden');updateStatus(false);
}
boot().catch(err=>{
  document.body.innerHTML=`<div style="padding:30px;font-family:system-ui"><h2>Admin Koleksi gagal dimuat</h2><p>${esc(err.message)}</p><p>Pastikan <b>books.json</b> berada satu folder dengan admin.html.</p></div>`;
});
