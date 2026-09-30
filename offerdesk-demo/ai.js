'use strict';
(() => {
  const labels={applied:'投递',assessment:'OA / 笔试',interview:'面试',offer:'Offer',closed:'已结束'};
  const states={queued:'排队中',running:'分析中',ready:'待查看',applied:'已写入',undone:'已撤销',failed:'未完成',cancelled:'已取消'};
  const open=document.createElement('button'); open.type='button';open.className='secondary small';open.textContent='本地 AI';
  document.querySelector('.tool-actions').prepend(open);
  const dialog=document.createElement('dialog');dialog.className='modal ai-dialog';dialog.setAttribute('aria-label','本地 AI 助手');
  dialog.innerHTML=`<header class="modal-header"><div><p class="eyebrow">LOCAL ASSISTANT</p><h2>本地 AI 助手</h2></div><button type="button" class="icon-button" id="ai-close" aria-label="关闭 AI 助手">×</button></header>
  <div class="modal-body ai-layout"><section class="ai-compose"><div class="form-grid"><label>分析内容<select id="ai-kind"><option value="email">邮件 → 进度清单</option><option value="jd">JD → 简历匹配</option></select></label><label>模型<select id="ai-model"></select></label><label>单次生成超时（分钟）<input id="ai-timeout" type="number" min="1" max="240" step="1" value="60" required></label><label class="full">岗位<select id="ai-job"></select></label><label class="full hidden" id="ai-resume-label">用于比较的简历<select id="ai-resume"></select></label><label class="full"><span id="ai-input-label">粘贴邮件</span><textarea id="ai-text" rows="7" maxlength="12000" placeholder="粘贴正文，分析完成后核对清单"></textarea></label></div><p class="field-hint" id="ai-runtime"></p><button type="button" class="primary" id="ai-submit">开始分析</button><p class="form-error" id="ai-error" role="alert"></p><div class="section-heading"><h3>任务记录</h3><button type="button" class="text-button" id="ai-refresh">刷新</button></div><div id="ai-tasks"></div></section><section class="ai-detail"><div id="ai-status" role="status">静态版展示 AI 输入界面，不生成分析结果。实际推理需要本地后端。</div><div id="ai-result"></div></section></div>`;
  document.body.append(dialog);
  let selected='',task=null,poll=null,signature='',working=false,modelInitialized=false;
  const el=id=>document.getElementById('ai-'+id);
  const error=e=>el('error').textContent=e?.message||'';
  function switchKind(){const jd=el('kind').value==='jd';el('resume-label').classList.toggle('hidden',!jd);el('input-label').textContent=jd?'粘贴岗位 JD':'粘贴邮件';}
  el('kind').onchange=switchKind;
  async function refresh(){
    const data=await api('/api/ai');
    el('runtime').textContent=data.runtimeReady?'数据在本机分析 · 单任务排队 · 空闲时释放模型内存':'静态演示：不运行模型推理，需连接 Python 与 llama.cpp 后端';
    for(const m of data.models){let option=[...el('model').options].find(o=>o.value===m.id);if(!option){option=document.createElement('option');option.value=m.id;el('model').append(option);}option.disabled=!m.installed;option.textContent=m.name+(m.installed?'':' · 未安装');}
    if(!modelInitialized){el('model').value=data.defaultModel;modelInitialized=true;}
    el('tasks').replaceChildren();
    for(const t of data.tasks){const button=document.createElement('button');button.type='button';button.className='ai-task'+(selected===t.id?' active':'');const job=jobs.find(j=>j.id===t.job_id);button.textContent=`${job?.company||'已删除岗位'} · ${t.kind==='jd'?'JD 匹配':'邮件'} · ${states[t.status]||t.status}`;button.onclick=()=>select(t.id);el('tasks').append(button);}
    if(selected){const response=await api('/api/ai/tasks/'+selected);task=response.task;el('status').textContent=task.message+(task.input.timeoutSeconds?' · 单次生成上限 '+Math.round(task.input.timeoutSeconds/60)+' 分钟':'');const next=task.id+':'+task.status+':'+JSON.stringify(task.result);if(next!==signature){signature=next;renderResult();}}
  }
  async function select(id){selected=id;signature='';try{await refresh();}catch(e){error(e);}}
  async function guard(action){if(working)return;working=true;error();try{await action();}catch(e){error(e);}finally{working=false;}}
  open.onclick=()=>guard(async()=>{
    dialog.showModal();
    await load();
    el('job').innerHTML=jobs.map(j=>`<option value="${escape(j.id)}">${escape(j.company)} · ${escape(j.role||'TBD')}</option>`).join('');
    const [docResult,pdfResult]=await Promise.allSettled([api('/api/resumes'),api('/api/resume-files')]);
    const docs=docResult.status==='fulfilled'?docResult.value:{docs:[]};
    const pdfs=pdfResult.status==='fulfilled'?pdfResult.value:{files:[]};
    el('resume').innerHTML='<option value="attached">此岗位已关联的 PDF</option>'+pdfs.files.map(f=>`<option value="pdf:${escape(f.id)}">PDF · ${escape(f.name)}</option>`).join('')+docs.docs.map(d=>`<option value="doc:${escape(d.id)}">文档 · ${escape(d.title)} · v${d.revision}</option>`).join('');
    await refresh();clearInterval(poll);poll=setInterval(()=>{if(!working)refresh().catch(error);},5000);
    if(pdfResult.status==='rejected')error(pdfResult.reason);
  });
  el('close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>clearInterval(poll));
  el('refresh').onclick=()=>guard(async()=>{await load();await refresh();});
  el('submit').onclick=()=>guard(async()=>{
    if(!el('timeout').reportValidity())return;
    el('submit').disabled=true;
    try{const response=await api('/api/ai/tasks','POST',{timeoutMinutes:Number(el('timeout').value),kind:el('kind').value,model:el('model').value,jobId:el('job').value,resumeSelection:el('resume').value,text:el('text').value,timezone:zone});await select(response.task.id);}
    finally{el('submit').disabled=false;}
  });
  function input(name,label,value='',wide=false){return `<label${wide?' class="full"':''}>${label}<input data-ai-field="${name}" value="${escape(value)}" ${name==='url'?'type="url"':'type="text"'}></label>`;}
  function renderResult(){
    const container=el('result');container.replaceChildren();if(!task)return;
    if(['queued','running'].includes(task.status)){container.innerHTML='<p class="field-hint">分析期间可以继续使用看板，或关闭网页。OPi 内存较小，处理可能需要几分钟。</p><button type="button" class="secondary" id="ai-cancel">取消任务</button>';el('cancel').onclick=()=>guard(async()=>{await api('/api/ai/cancel','POST',{taskId:task.id});await refresh();});return;}
    if(task.status==='failed'){container.innerHTML='<p>原始输入已保留，可以调整后重新提交。</p>';}
    const result=task.result;
    if(result&&task.kind==='jd'){
      container.innerHTML=`<div class="ai-score"><strong>${escape(result.score)}<small>%</small></strong><span>简历文本覆盖率</span></div><p>${escape(result.resumeName)}</p><p class="field-hint">${escape(result.warning)}</p><div class="ai-matches">${result.requirements.map(r=>`<article><b>${escape(r.requirement)}</b><span class="ai-badge">${({supported:'有依据',partial:'部分覆盖',missing:'简历未体现'})[r.status]}</span><p>JD：${escape(r.jdEvidence)}</p><p>简历：${escape(r.resumeEvidence||'未找到明确依据')}</p></article>`).join('')}</div>`;
    } else if(result&&task.kind==='email'){
      const editable=task.status==='ready';
      container.innerHTML=`<p>${escape(result.summary||'')}</p><p class="field-hint">${escape(result.warning||'')}</p><div id="ai-proposals"></div>`;
      for(const [index,p] of (result.approvedItems||result.items||[]).entries()){
        const box=document.createElement('fieldset');box.className='ai-proposal';box.dataset.type=p.type;box.disabled=!editable;
        box.innerHTML=`<legend><label class="check-label"><input type="checkbox" data-ai-check> ${p.type==='note'?'添加备注':'更新流程'} ${index+1}</label></legend><p class="ai-evidence">原文依据：${escape(p.evidence||'请对照下方原文核实')}</p>`;
        if(p.type==='step'){
          const events=task.input.events||[];
          box.innerHTML+=`<div class="form-grid"><label>阶段<select data-ai-field="stage">${Object.entries(labels).map(([v,n])=>`<option value="${v}"${v===p.stage?' selected':''}>${n}</option>`).join('')}</select></label>${input('date','流程日期（YYYY-MM-DD）',p.date)}${input('title','安排名称',p.title)}<label>面试 / OA 记录<select data-ai-field="eventId"><option value="">新增一项</option>${events.filter(e=>['interview','assessment'].includes(e.type)).map(e=>`<option value="${escape(e.id)}">更新：${escape(e.title)}</option>`).join('')}</select></label>${input('start','开始（本地时间 YYYY-MM-DD HH:mm）',p.start?displayLocalTime(localTime(p.start)):'')}${input('end','结束（本地时间 YYYY-MM-DD HH:mm）',p.end?displayLocalTime(localTime(p.end)):'')}${input('url','该阶段专用链接',p.url,true)}${input('location','线下地点',p.location,true)}</div>`;
        }
        box.innerHTML+=`<label>内容备注<textarea data-ai-field="notes" rows="3" maxlength="3000">${escape(p.notes||'')}</textarea></label>`;
        if(p.type==='step'){
          const stage=box.querySelector('[data-ai-field="stage"]');
          const toggle=()=>{for(const name of ['title','eventId','start','end','location'])box.querySelector(`[data-ai-field="${name}"]`).closest('label').classList.toggle('hidden',!['interview','assessment'].includes(stage.value));};
          stage.addEventListener('change',()=>{box.querySelector('[data-ai-field="eventId"]').value='';toggle();});toggle();
        }
        box.querySelector('[data-ai-check]').addEventListener('change',()=>{const approve=container.querySelector('.ai-approve');if(approve)approve.disabled=!container.querySelector('[data-ai-check]:checked');});
        el('proposals').append(box);
      }
      if(editable){const button=document.createElement('button');button.type='button';button.className='primary ai-approve';button.disabled=true;button.textContent='确认写入勾选项';button.onclick=()=>guard(async()=>{const items=[...el('proposals').children].filter(b=>b.querySelector('[data-ai-check]').checked).map(b=>({type:b.dataset.type,...Object.fromEntries([...b.querySelectorAll('[data-ai-field]')].map(e=>[e.dataset.aiField,e.value]))}));for(const item of items){for(const field of ['start','end'])if(item[field]){if(!validLocalTime(item[field]))throw new Error('时间请使用 YYYY-MM-DD HH:mm 格式');item[field]=new Date(localTimeValue(item[field])).toISOString();}}await api('/api/ai/apply','POST',{taskId:task.id,items});await load();await refresh();});container.append(button);}
      if(task.status==='applied'){const undo=document.createElement('button');undo.type='button';undo.className='secondary';undo.textContent='撤销这次写入';undo.onclick=()=>guard(async()=>{await api('/api/ai/undo','POST',{taskId:task.id});await load();await refresh();});container.append(undo);}
    }
    if(result?.diagnostics){
      const debug=document.createElement('details');const title=document.createElement('summary');title.textContent='阶段判断与原句';debug.append(title);
      const version=document.createElement('p');version.className='field-hint';version.textContent=result.analyzerVersion||'';debug.append(version);
      for(const d of result.diagnostics){const note=document.createElement('p');note.textContent=`第 ${d.fragment} 段：${d.reason}`;const pre=document.createElement('pre');pre.className='ai-original';pre.textContent=JSON.stringify(d.output,null,2)+'\n\n'+d.sentences.map(s=>`${s.id}: ${s.text}`).join('\n');debug.append(note,pre);}container.append(debug);
    }
    const original=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看本次原文';const pre=document.createElement('pre');pre.className='ai-original';pre.textContent=task.input.text;original.append(summary,pre);container.append(original);
  }
})();
