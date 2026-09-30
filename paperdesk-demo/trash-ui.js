'use strict';
let trashBusy=false, trashRows=[], trashSelected=new Set();
function trashMessage(id,message=''){$(id).textContent=message;$(id).hidden=!message;}
function updateTrashSelection(){
  const count=trashSelected.size,total=trashRows.length;
  $('trash-select-all').checked=total>0&&count===total;
  $('trash-select-all').indeterminate=count>0&&count<total;
  $('trash-select-all').disabled=trashBusy||!total;
  $('trash-selection-count').textContent='已选 '+count+' / '+total+' 份';
  $('trash-delete-selected').disabled=trashBusy||!count;
  $('trash-empty').disabled=trashBusy||!total;
}
function lockTrash(busy){trashBusy=busy;for(const id of ['trash-confirm-dialog','trash-dialog','purge-dialog'])for(const b of $(id).querySelectorAll('button,input'))b.disabled=busy;updateTrashSelection();}
$('trash-delete').addEventListener('click',()=>{
  if(!current||saving||compiling||recoveryDraft)return;
  trashMessage('trash-confirm-error');$('trash-confirm-name').textContent='「'+$('title').value+'」';
  $('trash-confirm-dialog').showModal();
});
$('trash-cancel').addEventListener('click',()=>{if(!trashBusy)$('trash-confirm-dialog').close();});
$('trash-confirm').addEventListener('click',async()=>{
  if(trashBusy||!current)return;lockTrash(true);trashMessage('trash-confirm-error');
  try{
    if(saving)throw new Error('未同步内容正在保存，请稍后再点确认。');
    if(dirty())await save();
    const moved=await api('/api/trash/move','POST',{id:current.id,revision:current.revision});
    clearTimeout(autoTimer);autoTimer=null;cacheDraft();current=null;baseline='';previews.clear();
    const url=new URL(location.href);url.searchParams.delete('doc');history.replaceState(null,'',url);
    const offer=new URL($('tracker-link').href);offer.searchParams.delete('resume');$('tracker-link').href=offer.href;$('tracker-link').textContent='投递工作台 ↗';
    $('title').value='';$('source').value='';showPreview(null);changed();controls();
    $('trash-confirm-dialog').close();await load();
    if(moved.missingPdfs)error('已取消投递的编辑链接。其中 '+moved.missingPdfs+' 条记录没有可保留的编译 PDF，投递记录仍保留。');
  }catch(e){trashMessage('trash-confirm-error',e.message);}
  finally{lockTrash(false);}
});
async function loadTrash(){
  trashMessage('trash-error');trashRows=[];trashSelected.clear();updateTrashSelection();$('trash-list').textContent='正在读取…';
  try{
    const result=await api('/api/trash');trashRows=result.docs;updateTrashSelection();
    $('trash-list').replaceChildren();
    if(!result.docs.length){$('trash-list').textContent='回收站是空的。';return;}
    for(const doc of result.docs){
      const row=document.createElement('div');row.className='trash-row';
      const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),title=document.createElement('strong'),date=document.createElement('small');
      label.className='trash-choice';check.type='checkbox';check.dataset.docId=doc.id;check.setAttribute('aria-label','选择 '+doc.title);
      check.addEventListener('change',()=>{if(check.checked)trashSelected.add(doc.id);else trashSelected.delete(doc.id);updateTrashSelection();});
      title.setAttribute('data-user-content','');title.textContent=doc.title;date.textContent='移入于 '+formatTime(doc.trashedAt);text.append(title,date);label.append(check,text);
      const button=document.createElement('button');button.textContent='恢复文档';
      button.addEventListener('click',async()=>{
        if(trashBusy)return;lockTrash(true);trashMessage('trash-error');
        try{
          const restored=await api('/api/trash/restore','POST',{id:doc.id,revision:doc.revision});
          docs=docs.filter(d=>d.id!==doc.id);docs.unshift(restored.doc);selectDoc(restored.doc);$('trash-dialog').close();
        }catch(e){trashMessage('trash-error',e.message);}
        finally{lockTrash(false);}
      });
      row.append(label,button);$('trash-list').append(row);
    }
  }catch(e){$('trash-list').textContent='';trashRows=[];trashSelected.clear();updateTrashSelection();trashMessage('trash-error',e.message);}
}
$('trash-select-all').addEventListener('change',()=>{
  if(trashBusy)return;
  trashSelected=new Set($('trash-select-all').checked?trashRows.map(d=>d.id):[]);
  for(const check of $('trash-list').querySelectorAll('input[type=checkbox]'))check.checked=trashSelected.has(check.dataset.docId);
  updateTrashSelection();
});
$('trash-open').addEventListener('click',()=>confirmSwitch(()=>{$('trash-dialog').showModal();loadTrash();}));
$('trash-close').addEventListener('click',()=>{if(!trashBusy)$('trash-dialog').close();});
for(const id of ['trash-dialog','trash-confirm-dialog'])$(id).addEventListener('cancel',e=>{if(trashBusy)e.preventDefault();});
let purgeRows=[];
function confirmPurge(rows){
  if(trashBusy||!rows.length)return;
  if(rows.length>500){trashMessage('trash-error','每次最多删除 500 份，请勾选部分文档。');return;}
  purgeRows=rows.map(d=>({...d}));
  $('purge-summary').textContent='将永久删除 '+purgeRows.length+' 份文档：'+purgeRows.map(d=>d.title).join('、');
  $('purge-confirm').disabled=false;trashMessage('purge-error');$('purge-dialog').showModal();$('purge-cancel').focus();
}
$('trash-empty').addEventListener('click',()=>confirmPurge(trashRows));
$('trash-delete-selected').addEventListener('click',()=>confirmPurge(trashRows.filter(d=>trashSelected.has(d.id))));
$('purge-cancel').addEventListener('click',()=>{if(!trashBusy)$('purge-dialog').close();});
$('purge-dialog').addEventListener('cancel',e=>{if(trashBusy)e.preventDefault();});
$('purge-confirm').addEventListener('click',async()=>{
  if(trashBusy||!purgeRows.length)return;
  lockTrash(true);trashMessage('purge-error');
  try{
    const result=await api('/api/trash/purge','POST',{confirmation:'永久删除',docs:purgeRows});
    for(const doc of purgeRows){previews.delete(doc.id);try{localStorage.removeItem(draftKey(doc.id));}catch{}}
    $('purge-dialog').close();await loadTrash();
    if(result.cleanupPending)trashMessage('trash-error','所选记录已删除；部分编译文件暂时无法移除，服务器重启后会重试。');
    else if(result.missingPdfs)trashMessage('trash-error','已删除并取消编辑链接；其中 '+result.missingPdfs+' 条投递此前没有可保留的 PDF。');
    purgeRows=[];
  }catch(e){trashMessage('purge-error',e.message);}
  finally{lockTrash(false);$('purge-confirm').disabled=!purgeRows.length;}
});
