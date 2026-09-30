'use strict';
// Shares the current-document state and authenticated API from app.js.
let historyRows=[], historySelected=null, historyProposal=null, historyRequest=0, historyBusy=false;
const historyKinds={compiled:'编译成功',create:'新建',save:'保存',baseline:'启用历史时的版本',recovered:'旧编译快照（标题沿用当前名称）',branch:'分支起点',restore:'恢复',merge:'合并', 'cherry-pick':'选取修改',revert:'撤销修改'};
function clearHistoryPdf(){window.PaperHistoryPreview.clear();$('history-pdf-preview').hidden=true;$('history-preview-pdf').disabled=true;$('history-pdf-open').hidden=true;$('history-pdf-download').hidden=true;}
$('history-preview-pdf').addEventListener('click',()=>{if(!historySelected?.pdfReady||historyBusy)return;$('history-pdf-preview').hidden=false;window.PaperHistoryPreview.show(historySelected.pdfUrl);$('history-pdf-preview').scrollIntoView({block:'nearest'});});
$('history-dialog').addEventListener('close',clearHistoryPdf);
function historyError(message=''){$('history-error').textContent=message;$('history-error').hidden=!message;}
function historyLock(locked){historyBusy=locked;for(const element of $('history-dialog').querySelectorAll('button,select,input,textarea'))element.disabled=locked;$('history-preview-pdf').disabled=locked||!historySelected?.pdfReady;}
function resetProposal(){historyProposal=null;$('history-proposal').hidden=true;$('history-confirm').checked=false;}
async function loadHistory(){
  const request=++historyRequest;resetProposal();historySelected=null;historyError();clearHistoryPdf();
  $('history-diff').textContent='正在读取…';$('history-source').value='';
  try{
    const result=await api('/api/history/'+$('history-document').value);if(request!==historyRequest)return;
    historyRows=result.versions;
    $('history-version').innerHTML=historyRows.map(v=>`<option value="${v.revision}">${escape(formatTime(v.created))} · ${escape(historyKinds[v.kind]||v.kind)}</option>`).join('');
    if(historyRows.length)await selectHistory();else $('history-diff').textContent='尚无成功编译的版本。未编译内容已保存；编译成功后会出现在这里。';
  }catch(e){if(request===historyRequest)historyError(e.message);}
}
async function selectHistory(){
  const request=++historyRequest;resetProposal();historySelected=null;historyError();clearHistoryPdf();
  const docId=$('history-document').value, revision=$('history-version').value;if(!revision)return;
  try{
    const result=await api('/api/history/'+docId+'/'+revision);if(request!==historyRequest)return;
    historySelected=result.version;
    $('history-preview-pdf').disabled=!historySelected.pdfReady;$('history-pdf-open').hidden=!historySelected.pdfReady;$('history-pdf-download').hidden=!historySelected.pdfReady;if(historySelected.pdfReady){$('history-pdf-open').href=historySelected.pdfUrl;$('history-pdf-download').href=historySelected.pdfUrl+'?download=1';}
    $('history-diff').textContent=result.version.diff||'这次保存没有修改源码（可能仅更改了名称或编译引擎）。';
    $('history-source').value=result.version.source;
    $('history-branch-title').value=(result.version.title+' · 分支').slice(0,120);
    $('history-restore').disabled=docId!==current.id;
    $('history-cherry').disabled=!result.version.parent_id;
    $('history-revert').disabled=docId!==current.id||!result.version.parent_id;
    $('history-selected-info').textContent=`${result.version.title} · ${result.version.engine} · ${formatTime(result.version.created)}`;
  }catch(e){if(request===historyRequest)historyError(e.message);}
}
async function openHistory(){
  if(!current||saving||compiling)return;
  if(dirty())return error('请先保存当前修改，再打开历史版本。');
  historyError();resetProposal();$('history-dialog').showModal();
  try{
    const result=await api('/api/docs');
    $('history-document').innerHTML=result.docs.map(d=>`<option value="${d.id}">${escape(d.title)}${d.id===current.id?'（当前）':''}</option>`).join('');
    $('history-document').value=current.id;
    $('history-target').innerHTML='操作目标：<span data-user-content>'+escape(current.title)+' · '+escape(formatTime(current.updated))+'</span>';
    await loadHistory();
  }catch(e){historyError(e.message);}
}
async function proposeHistory(action){
  if(!historySelected||historyBusy)return;historyError();historyLock(true);resetProposal();
  try{
    const request={id:current.id,revision:current.revision,sourceDocId:historySelected.doc_id,sourceRevision:historySelected.revision,action};
    const result=await api('/api/history/preview','POST',request);
    historyProposal={...request,...result.proposal};
    $('history-result').value=result.proposal.source;
    $('history-result-diff').textContent=result.proposal.diff||'源码没有变化。';
    $('history-result-summary').textContent=(action==='restore'?'恢复会包含此版本的名称与编译引擎。':action==='revert'?'只撤销所选版本相对上一版的源码改动，保留后续修改。':'只取所选版本相对上一版的源码改动，保留当前文档其余内容。')+(result.proposal.conflicts?` 发现 ${result.proposal.conflicts} 处冲突：请编辑下方结果，保留需要的内容并删除冲突标记。`:' 没有检测到行级冲突，请检查结果。');
    $('history-proposal').hidden=false;$('history-apply').textContent='确认'+(historyKinds[action]||action)+'为未编译内容';
    $('history-proposal').scrollIntoView({block:'start'});
  }catch(e){historyError(e.message);}finally{historyLock(false);$('history-restore').disabled=historySelected?.doc_id!==current.id;$('history-cherry').disabled=!historySelected?.parent_id;$('history-revert').disabled=historySelected?.doc_id!==current.id||!historySelected?.parent_id;}
}
$('history-open').addEventListener('click',openHistory);
$('history-close').addEventListener('click',()=>{if(!historyBusy){historyRequest++;$('history-dialog').close();clearHistoryPdf();}});
$('history-dialog').addEventListener('cancel',e=>{if(historyBusy)e.preventDefault();else{historyRequest++;clearHistoryPdf();}});
$('history-document').addEventListener('change',loadHistory);
$('history-version').addEventListener('change',selectHistory);
$('history-restore').addEventListener('click',()=>proposeHistory('restore'));
$('history-cherry').addEventListener('click',()=>proposeHistory('cherry-pick'));
$('history-revert').addEventListener('click',()=>proposeHistory('revert'));
$('history-apply').addEventListener('click',async()=>{
  if(!historyProposal||historyBusy)return;
  if(!$('history-confirm').checked)return historyError('请检查结果并勾选确认。');
  const source=$('history-result').value;
  if(source.split(/\r?\n/).some(line=>['<<<<<<< CURRENT','||||||| BASE','=======','>>>>>>> INCOMING'].includes(line.trim())))return historyError('还有冲突标记，请处理后再保存。');
  historyLock(true);historyError();
  try{
    const request={id:historyProposal.id,revision:historyProposal.revision,sourceDocId:historyProposal.sourceDocId,sourceRevision:historyProposal.sourceRevision,action:historyProposal.action,resolvedSource:source,conflictsResolved:true};
    const result=await api('/api/history/apply','POST',request);
    docs=docs.map(d=>d.id===result.doc.id?result.doc:d);selectDoc(result.doc);$('history-dialog').close();
  }catch(e){historyError(e.message);}finally{historyLock(false);}
});
$('history-branch').addEventListener('click',async()=>{
  if(!historySelected||historyBusy)return;historyLock(true);historyError();
  try{
    const result=await api('/api/branches','POST',{id:uid(),sourceDocId:historySelected.doc_id,sourceRevision:historySelected.revision,title:$('history-branch-title').value.trim()});
    docs.unshift(result.doc);selectDoc(result.doc);$('history-dialog').close();
  }catch(e){historyError(e.message);}finally{historyLock(false);}
});
$('history-download').addEventListener('click',()=>{
  if(!historySelected)return;
  const url=URL.createObjectURL(new Blob([historySelected.source],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download=historySelected.title.replace(/[\\/:*?"<>|]/g,'_')+'-history-'+historySelected.revision+'.tex';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
});
