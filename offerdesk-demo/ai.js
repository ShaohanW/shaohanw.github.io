'use strict';
(() => {
  const labels={applied:'投递',assessment:'OA / 笔试',interview:'面试',offer:'Offer',closed:'已结束'};
  const states={queued:'排队中',running:'分析中',ready:'待查看',applied:'已确认',undone:'已撤销',failed:'未完成',cancelled:'已取消'};
  const open=document.createElement('button');open.type='button';open.className='secondary small';open.textContent='粘贴岗位 / 邮件';
  document.querySelector('.tool-actions').prepend(open);
  const dialog=document.createElement('dialog');dialog.className='modal ai-dialog';dialog.dataset.panel='compose';dialog.setAttribute('aria-label','粘贴内容分析');
  dialog.innerHTML=`<header class="modal-header"><div><p class="eyebrow">PASTE & REVIEW</p><h2>粘贴内容分析</h2></div><div class="ai-header-actions"><button type="button" class="icon-button" id="ai-close" aria-label="关闭分析窗口">×</button></div></header>
  <div class="dialog-preferences"><div class="dialog-language-slot"></div><label class="check-label"><input type="checkbox" id="ai-developer"> 开发者模式</label></div>
  <nav class="ai-mobile-tabs" aria-label="分析区域"><button type="button" data-ai-panel="compose">粘贴内容</button><button type="button" data-ai-panel="history">分析记录</button><button type="button" data-ai-panel="result">查看结果</button></nav>
  <div class="modal-body ai-layout"><section class="ai-compose"><div class="ai-input"><div class="form-grid"><label>分析内容<select id="ai-kind"><option value="jd">岗位 → 简历匹配</option><option value="email">邮件 → 更新进度</option></select></label><label>分析模型<select id="ai-model"></select></label><label class="ai-timeout-label">单次生成超时（分钟）<input id="ai-timeout" type="number" min="1" max="240" step="1" value="60" required></label><label class="full hidden" id="ai-job-label">更新哪个岗位<select id="ai-job"></select></label><label class="full" id="ai-resume-label">用于匹配的简历<select id="ai-resume"></select></label><label class="full"><span id="ai-input-label">粘贴岗位内容（JD）</span><textarea id="ai-text" rows="4" maxlength="12000" placeholder="粘贴正文，分析完成后查看结果"></textarea></label></div><p class="field-hint" id="ai-runtime"></p><button type="button" class="primary" id="ai-submit">开始分析</button><p class="form-error" id="ai-error" role="alert" hidden></p></div><section class="ai-history" aria-label="分析记录"><div class="section-heading"><h3>分析记录</h3><button type="button" class="text-button" id="ai-refresh">刷新</button></div><div id="ai-tasks" tabindex="0" aria-label="可滚动的分析记录"></div></section></section><section class="ai-detail"><div id="ai-status" role="status">选择记录查看结果。关闭窗口不会停止分析。</div><div id="ai-result"></div></section></div>`;
  document.body.append(dialog);
  let selected='',task=null,poll=null,signature='',working=false,modelInitialized=false,refreshToken=0;
  const el=id=>document.getElementById('ai-'+id);
  const error=e=>{const message=String(e?.message||'').trim();el('error').textContent=message;el('error').hidden=!message;};
  function setPanel(panel){dialog.dataset.panel=panel;for(const button of dialog.querySelectorAll('[data-ai-panel]'))button.setAttribute('aria-current',button.dataset.aiPanel===panel?'page':'false');}
  for(const button of dialog.querySelectorAll('[data-ai-panel]'))button.onclick=()=>setPanel(button.dataset.aiPanel);
  function switchKind(){const jd=el('kind').value==='jd';el('resume-label').classList.toggle('hidden',!jd);el('job-label').classList.toggle('hidden',jd);el('input-label').textContent=jd?'粘贴岗位内容（JD）':'粘贴邮件';}
  el('kind').onchange=switchKind;switchKind();setPanel('compose');
  el('developer').onchange=()=>dialog.classList.toggle('developer-mode',el('developer').checked);
  function clearSelection(message='选择记录查看结果。'){selected='';task=null;signature='';el('status').textContent=message;el('result').replaceChildren();}
  async function refresh(){
    const token=++refreshToken;const data=await api('/api/ai');if(token!==refreshToken)return;
    el('runtime').textContent='';
    for(const m of data.models){let option=[...el('model').options].find(o=>o.value===m.id);if(!option){option=document.createElement('option');option.value=m.id;el('model').append(option);}option.disabled=false;option.textContent=m.name;}
    if(!modelInitialized){el('model').value=data.defaultModel;el('timeout').value=data.defaultTimeoutMinutes||60;modelInitialized=true;}
    el('tasks').replaceChildren();
    if(!data.tasks.length){const empty=document.createElement('p');empty.className='field-hint';empty.textContent='暂无分析记录';el('tasks').append(empty);}
    for(const t of data.tasks){
      const row=document.createElement('div');row.className='ai-task-row';
      const button=document.createElement('button');button.type='button';button.className='ai-task'+(selected===t.id?' active':'');const job=jobs.find(j=>j.id===t.job_id);const name=document.createElement('span');name.dataset.userContent='';name.textContent=job?.company||t.label||'新岗位';const state=document.createElement('span');state.textContent=` · ${t.kind==='jd'?'岗位匹配':'邮件'} · ${states[t.status]||t.status}`;button.append(name,state);button.onclick=()=>select(t.id);
      const remove=document.createElement('button');remove.type='button';remove.className='text-button danger ai-delete';remove.textContent='删除';remove.setAttribute('aria-label','删除分析记录：'+button.textContent);remove.onclick=()=>guard(async()=>{
        if(!confirm('删除这条分析记录？进行中的分析会停止。已写入岗位的内容会保留，该记录的撤销入口也会移除。'))return;
        await api('/api/ai/delete','POST',{taskId:t.id});++refreshToken;if(selected===t.id)clearSelection('分析记录已删除。');await refresh();
      });row.append(button,remove);el('tasks').append(row);
    }
    if(selected){const key=selected;const response=await api('/api/ai/tasks/'+key);if(token!==refreshToken||selected!==key)return;task=response.task;el('status').textContent=task.message+(task.input.timeoutSeconds?' · 单次生成上限 '+Math.round(task.input.timeoutSeconds/60)+' 分钟':'');const next=task.id+':'+task.status+':'+JSON.stringify(task.result);if(next!==signature){signature=next;renderResult();}}
  }
  async function select(id){selected=id;signature='';setPanel('result');try{await refresh();}catch(e){error(e);}}
  async function guard(action){if(working)return;working=true;error();try{await action();}catch(e){error(e);}finally{working=false;}}
  open.onclick=()=>guard(async()=>{
    el('developer').checked=false;dialog.classList.remove('developer-mode');setPanel('compose');dialog.showModal();
    await load();el('job').innerHTML=jobs.map(j=>`<option value="${escape(j.id)}">${escape(j.company)} · ${escape(j.role||'TBD')}</option>`).join('');
    const [docResult,pdfResult]=await Promise.allSettled([api('/api/resumes'),api('/api/resume-files')]);
    const docs=docResult.status==='fulfilled'?docResult.value:{docs:[]};const pdfs=pdfResult.status==='fulfilled'?pdfResult.value:{files:[]};
    el('resume').innerHTML='<option value="">请选择一份简历</option>'+pdfs.files.map(f=>`<option value="pdf:${escape(f.id)}">PDF · ${escape(f.name)}</option>`).join('')+docs.docs.map(d=>`<option data-ui-name="${escape(d.title)}" data-ui-prefix="文档 · " data-ui-suffix=" · v${d.revision}${d.pdfRunId?'':' · 待编译'}" value="doc:${escape(d.id)}"${d.pdfRunId?'':' disabled'}>文档 · ${escape(d.title)} · v${d.revision}${d.pdfRunId?'':' · 待编译'}</option>`).join('');
    if(!el('resume').value){const option=[...el('resume').options].find(o=>o.value&&!o.disabled);if(option)el('resume').value=option.value;}
    await refresh();clearInterval(poll);poll=setInterval(()=>{if(!working)refresh().catch(error);},5000);if(pdfResult.status==='rejected')error(pdfResult.reason);
  });
  el('close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>clearInterval(poll));
  el('refresh').onclick=()=>guard(async()=>{await load();await refresh();});
  el('submit').onclick=()=>guard(async()=>{
    if(!el('timeout').reportValidity())return;const jd=el('kind').value==='jd';if(jd&&!el('resume').value)throw new Error('请先选择一份已上传或编译的简历。');if(!el('text').value.trim())throw new Error('请先粘贴内容。');
    el('submit').disabled=true;
    try{const response=await api('/api/ai/tasks','POST',{createCard:jd,timeoutMinutes:Number(el('timeout').value),kind:el('kind').value,model:el('model').value,jobId:jd?'':el('job').value,resumeSelection:el('resume').value,text:el('text').value,timezone:zone});if(response.alreadyApplied){clearSelection(response.message);setPanel('result');await refresh();}else await select(response.task.id);}
    finally{el('submit').disabled=false;}
  });
  function input(name,label,value='',wide=false){return `<label${wide?' class="full"':''}>${label}<input data-ai-field="${name}" value="${escape(value)}" ${name==='url'?'type="url"':'type="text"'}></label>`;}
  function undoButton(container,label){const undo=document.createElement('button');undo.type='button';undo.className='secondary';undo.textContent=label;undo.onclick=()=>guard(async()=>{await api('/api/ai/undo','POST',{taskId:task.id});await load();await refresh();});container.append(undo);}
  function renderResult(){
    const container=el('result');container.replaceChildren();if(!task)return;
    if(['queued','running'].includes(task.status)){container.innerHTML='<p class="field-hint">可以继续使用看板，或关闭网页；回来后在分析记录中查看结果。</p><button type="button" class="secondary" id="ai-cancel">停止分析</button>';el('cancel').onclick=()=>guard(async()=>{await api('/api/ai/cancel','POST',{taskId:task.id});await refresh();});return;}
    if(task.status==='failed')container.innerHTML='<p>粘贴内容已保留，可以修改后重新提交。</p>';
    const result=task.result;
    if(result&&task.kind==='jd'){
      container.innerHTML=`<div class="ai-score"><strong>${escape(result.score)}<small>%</small></strong><span>简历内容匹配率</span></div><p data-user-content>${escape(result.resumeName)}</p><p class="field-hint">评分基于简历已写出的经历，不是录用概率。</p><p class="ai-dev-only field-hint">${escape(result.warning||'')}</p><div class="ai-matches">${(result.requirements||[]).map(r=>`<article><b data-user-content>${escape(r.requirement)}</b><span class="ai-badge">${({supported:'匹配',partial:'部分匹配',missing:'未体现'})[r.status]}</span><p data-user-content>${escape(r.reason||({supported:'简历已有相关经历。',partial:'有相关经历，但未完整覆盖要求。',missing:'简历中暂未体现，不代表没有这项能力。'})[r.status])}</p><div class="ai-dev-only"><p>岗位原句：<span data-user-content>${escape(r.jdEvidence)}</span></p><p>简历原句：<span data-user-content>${escape(r.resumeEvidence||'未找到明确依据')}</span></p></div></article>`).join('')}</div>`;
      if(task.status==='ready'&&task.input.createCard){
        const form=document.createElement('section');form.className='ai-create-card';form.innerHTML=`<h3>确认后新建岗位</h3><div class="form-grid"><label>公司<input id="ai-company" maxlength="140" required value="${escape(result.company||'')}"></label><label>岗位<input id="ai-role" maxlength="160" value="${escape(result.role||'')}"></label><label class="full">招聘链接<input id="ai-url" type="url" value="${escape(result.url||'')}"></label></div><p class="field-hint">卡片进入收藏 / 准备投递，并关联本次分析的简历。</p>`;
        const button=document.createElement('button');button.type='button';button.className='primary';button.textContent='确认新建卡片';button.onclick=()=>guard(async()=>{if(!el('company').reportValidity()||!el('url').reportValidity())return;await api('/api/ai/create-card','POST',{taskId:task.id,company:el('company').value,role:el('role').value,url:el('url').value});await load();await refresh();});form.append(button);container.append(form);
      }
      if(task.status==='applied')undoButton(container,'撤销新建卡片');
    }else if(result&&task.kind==='email'){
      const editable=task.status==='ready';container.innerHTML=`<p>${task.status==='applied'?'已写入你确认的内容。':'核对下面的更新清单，勾选后确认写入。'}</p><p class="ai-dev-only" data-user-content>${escape(result.summary||'')}</p><p class="ai-dev-only field-hint">${escape(result.warning||'')}</p><div id="ai-proposals"></div>`;
      for(const [index,p] of (result.approvedItems||result.items||[]).entries()){
        const box=document.createElement('fieldset');box.className='ai-proposal';box.dataset.type=p.type;box.disabled=!editable;box.innerHTML=`<legend><label class="check-label"><input type="checkbox" data-ai-check> ${p.type==='note'?'添加备注':'更新流程'} ${index+1}</label></legend><p class="ai-dev-only ai-evidence">原文依据：<span data-user-content>${escape(p.evidence||'请对照原文核实')}</span></p>`;
        if(p.type==='step'){
          const events=task.input.events||[];box.innerHTML+=`<div class="form-grid"><label>阶段<select data-ai-field="stage">${Object.entries(labels).map(([v,n])=>`<option value="${v}"${v===p.stage?' selected':''}>${n}</option>`).join('')}</select></label>${input('date','流程日期（YYYY-MM-DD）',p.date)}${input('title','安排名称',p.title)}<label>面试 / OA 记录<select data-ai-field="eventId"><option value="">新增一项</option>${events.filter(e=>['interview','assessment'].includes(e.type)).map(e=>`<option value="${escape(e.id)}">更新：${escape(e.title)}</option>`).join('')}</select></label>${input('start','开始（YYYY-MM-DD HH:mm）',p.start?displayLocalTime(localTime(p.start)):'')}${input('end','结束（YYYY-MM-DD HH:mm）',p.end?displayLocalTime(localTime(p.end)):'')}${input('url','该阶段专用链接',p.url,true)}${input('location','线下地点',p.location,true)}</div>`;
        }
        box.innerHTML+=`<label>内容备注<textarea data-ai-field="notes" rows="3" maxlength="3000">${escape(p.notes||'')}</textarea></label>`;
        if(p.type==='step'){const stage=box.querySelector('[data-ai-field="stage"]');const toggle=()=>{for(const name of ['title','eventId','start','end','location'])box.querySelector(`[data-ai-field="${name}"]`).closest('label').classList.toggle('hidden',!['interview','assessment'].includes(stage.value));};stage.addEventListener('change',()=>{box.querySelector('[data-ai-field="eventId"]').value='';toggle();});toggle();}
        box.querySelector('[data-ai-check]').addEventListener('change',()=>{const approve=container.querySelector('.ai-approve');if(approve)approve.disabled=!container.querySelector('[data-ai-check]:checked');});el('proposals').append(box);
      }
      if(editable){const button=document.createElement('button');button.type='button';button.className='primary ai-approve';button.disabled=true;button.textContent='确认写入勾选项';button.onclick=()=>guard(async()=>{const items=[...el('proposals').children].filter(b=>b.querySelector('[data-ai-check]').checked).map(b=>({type:b.dataset.type,...Object.fromEntries([...b.querySelectorAll('[data-ai-field]')].map(e=>[e.dataset.aiField,e.value]))}));for(const item of items)for(const field of ['start','end'])if(item[field]){if(!validLocalTime(item[field]))throw new Error('时间请使用 YYYY-MM-DD HH:mm 格式');item[field]=new Date(localTimeValue(item[field])).toISOString();}await api('/api/ai/apply','POST',{taskId:task.id,items});await load();await refresh();});container.append(button);}
      if(task.status==='applied')undoButton(container,'撤销这次写入');
    }
    if(result){const debug=document.createElement('details');debug.className='ai-dev-only';const title=document.createElement('summary');title.textContent='开发者诊断';const pre=document.createElement('pre');pre.className='ai-original';pre.textContent=JSON.stringify(result.diagnostics||result,null,2);debug.append(title,pre);container.append(debug);}
    const original=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看粘贴内容';const pre=document.createElement('pre');pre.className='ai-original';pre.textContent=task.input.text;original.append(summary,pre);container.append(original);
  }
})();
