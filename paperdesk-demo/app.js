'use strict';
const $=id=>document.getElementById(id);
let docs=[], current=null, baseline='', saving=false, compiling=false, afterDiscard=null, currentRun=null;
const previews=new Map();
let localCacheTimer=null;
let autoTimer=null, autoPaused=false, saveError='', recoveryDraft=null, cacheFailed=false, pauseStatus=0;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;return [...b].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join('');};
const templates={
resume:String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[margin=1.7cm]{geometry}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlist[itemize]{leftmargin=*,nosep}
\begin{document}
{\LARGE\bfseries Your Name}\\[5pt]
Software Engineer \quad | \quad City, Country\\
\href{mailto:you@example.com}{you@example.com} \quad | \quad github.com/yourname

\section*{Profile}
A concise introduction to your experience and the work you want to do next.

\section*{Experience}
\textbf{Company Name --- Software Engineer} \hfill 2024--Present
\begin{itemize}
  \item Describe an accomplishment, your contribution, and its measurable result.
  \item Built a tool that reduced a repetitive workflow by 40\%.
\end{itemize}

\section*{Projects}
\textbf{Personal Workbench} \hfill Python, SQLite, JavaScript
\begin{itemize}
  \item Built and deployed a lightweight application on a single-board computer.
\end{itemize}

\section*{Education}
\textbf{University Name} --- B.S. in Computer Science \hfill 2020--2024

\section*{Skills}
Python, JavaScript, SQL, Linux, Git
\end{document}
`,
chinese:String.raw`\documentclass[11pt,a4paper,fontset=fandol]{ctexart}
\usepackage[margin=1.7cm]{geometry}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlist[itemize]{leftmargin=*,nosep}
\begin{document}
{\LARGE\bfseries 你的姓名}\\[6pt]
软件工程师 \quad | \quad 所在城市\\
you@example.com \quad | \quad github.com/yourname

\section*{个人简介}
用两三句话介绍你的经验、优势，以及希望解决的问题。

\section*{工作经历}
\textbf{公司名称 —— 软件工程师} \hfill 2024 年至今
\begin{itemize}
  \item 用具体的工作和结果描述贡献，而不是只列出职责。
  \item 开发自动化工具，将重复工作的耗时减少约 40\%。
\end{itemize}

\section*{项目经历}
\textbf{个人工作台} \hfill Python / SQLite / Linux
\begin{itemize}
  \item 在单板电脑上部署轻量化网页工具，支持本地数据保存。
\end{itemize}

\section*{教育背景}
\textbf{大学名称} —— 计算机科学学士 \hfill 2020--2024

\section*{技能}
Python、JavaScript、SQL、Linux、Git
\end{document}
`,
article:String.raw`\documentclass[11pt]{article}
\usepackage[margin=2.5cm]{geometry}
\title{A New Beginning}
\author{Your Name}
\date{\today}
\begin{document}
\maketitle
\section{Introduction}
Write your ideas here.
\[
  E = mc^2
\]
\end{document}
`};
function error(message=''){ $('error').textContent=message;$('error').hidden=!message; }
function login(){document.body.classList.add('locked');if(!$('login-dialog').open)$('login-dialog').showModal();}
async function api(path,method='GET',data){return paperApi(path,method,data);}
function snapshot(){return JSON.stringify([$ ('title').value,$('source').value,$('engine').value]);}
function dirty(){return !!current&&snapshot()!==baseline;}
function formatTime(value){return value?new Date(value).toLocaleString(window.SudowI18n.locale,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'时间未知';}
function changed(){
  window.PaperSyntax?.render();
  $('save-state').textContent=!current?'尚未选择文档':saving?'正在自动保存…':dirty()?(cacheFailed?'更改尚未保存，请保持页面打开':saveError?'更改仅保存在此浏览器 · '+saveError:'有未同步更改 · 30 秒内自动保存'):'已自动保存 · '+formatTime(current.updated);
  $('line-count').textContent=$('source').value.split('\n').length+' 行';
  if(currentRun?.status==='ok')$('compile-state').textContent=dirty()||currentRun.revision!==current?.revision?'源码已更新，PDF 尚未重新编译':'示例 PDF 预览';
}
function controls(){for(const id of ['compile','source-download','import','title','source','engine','history-open','trash-delete'])$(id).disabled=!current||!!recoveryDraft||(id==='compile'&&(compiling||saving))||(['history-open','trash-delete'].includes(id)&&(saving||compiling));$('new').disabled=saving||compiling;$('refresh').disabled=saving||compiling;}
function renderList(){$('documents').innerHTML=docs.length?docs.map(d=>`<button class="doc-item ${current?.id===d.id?'active':''}" data-id="${d.id}" ${saving||compiling?'disabled':''}><strong>${escape(d.title)}</strong><small>${escape(formatTime(d.updated))}</small></button>`).join(''):'<p class="empty-list">还没有文档。<br>从一份简历开始吧。</p>';}
function showPreview(run){currentRun=run||null;$('preview').hidden=!run||run.status!=='ok';$('preview-empty').hidden=!!run&&run.status==='ok';$('pdf-download').hidden=!run||run.status!=='ok';$('pdf-open').hidden=!run||run.status!=='ok';window.PaperPreview.clear();if(run?.status==='ok'){const url='sample.pdf';window.PaperPreview.show(url);$('pdf-open').href=url;$('pdf-download').href=url+'?download=1';$('pdf-download').download=($('title').value.replace(/[\\/:*?"<>|]/g,'_')||'document')+'.pdf';$('compile-state').textContent='示例 PDF 预览';}else $('compile-state').textContent=run?'编译未完成':'尚未编译';$('log').textContent=run?.log||'编译完成后在这里查看详细信息。';}
function selectDoc(doc){
  window.PaperView?.('source');
  clearTimeout(autoTimer);autoTimer=null;autoPaused=false;pauseStatus=0;saveError='';recoveryDraft=null;$('draft-recovery').hidden=true;
  error();current=structuredClone(doc);const url=new URL(location.href);url.searchParams.set('doc',doc.id);history.replaceState(null,'',url);
  const offer=new URL($('tracker-link').href);offer.searchParams.set('resume',doc.id);$('tracker-link').href=offer.href;$('tracker-link').textContent='用此简历投递 ↗';
  $('title').value=doc.title;$('source').value=doc.source;$('engine').value=doc.engine;baseline=snapshot();
  try{
    const cached=JSON.parse(localStorage.getItem(draftKey(doc.id))||'null');
    if(cached?.pending&&Array.isArray(cached.fields)&&cached.fields.length===3&&cached.fields.every(v=>typeof v==='string')&&['xelatex','pdflatex'].includes(cached.fields[2])){
      if(JSON.stringify(cached.fields)!==baseline){
        if(cached.baseRevision===doc.revision){fillDraft(cached.fields);queueAutosave();}
        else{recoveryDraft=cached;autoPaused=true;$('draft-recovery').hidden=false;}
      }
    }
  }catch(e){cacheFailed=true;}
  showPreview(previews.get(doc.id));changed();renderList();controls();restorePreview(doc.id);
}
async function restorePreview(id){if(previews.has(id))return;try{const result=await api('/api/docs/'+id+'/latest-run');if(result.run&&!previews.has(id)){previews.set(id,result.run);if(current?.id===id&&!compiling){showPreview(result.run);changed();}}}catch(e){if(current?.id===id)error(e.message);}}
async function confirmSwitch(action){
  if(saving||compiling||recoveryDraft)return;
  try{if(dirty())await save();if(!dirty())action();else error('还有新输入正在等待保存，请稍后再切换。');}
  catch(e){error('未同步内容尚未同步，已留在当前浏览器。请先恢复连接并保存，或下载源码。'+e.message);}
}
async function load(){try{error();const result=await api('/api/docs');previews.clear();docs=result.docs;const requested=new URL(location.href).searchParams.get('doc');const next=requested?docs.find(d=>d.id===requested):(docs.find(d=>d.id===current?.id)||docs[0]);if(requested&&!next){current=null;$('title').value='';$('source').value='';baseline='';showPreview(null);renderList();controls();changed();throw new Error('文档可能在回收站中，可从左侧回收站恢复；也可以选择其他文档。');}if(next)selectDoc(next);else{current=null;$('title').value='';$('source').value='';baseline='';showPreview(null);renderList();controls();changed();}}catch(e){error(e.message);}}
async function save(){
  if(!current)throw new Error('请先新建文档');if(saving)throw new Error('正在保存，请稍后');if(recoveryDraft)throw new Error('请先选择要恢复的未同步内容');
  clearTimeout(autoTimer);autoTimer=null;if(!dirty())return current;cacheDraft();
  const captured=snapshot(),data={...current,title:$('title').value.trim(),source:$('source').value,engine:$('engine').value};
  if(!data.title)throw new Error('文档名称为空，未同步内容暂存在此浏览器');
  saving=true;saveError='';changed();controls();renderList();
  try{
    const result=await api('/api/docs','PUT',data);current=result.doc;docs=docs.map(d=>d.id===current.id?current:d);
    if(snapshot()===captured)$('title').value=current.title;
    baseline=JSON.stringify([current.title,current.source,current.engine]);autoPaused=false;pauseStatus=0;cacheDraft();return current;
  }catch(e){saveError=e.status===409?'服务器已有更新，请重新加载后选择未同步内容':e.status===401?'请重新登录':'同步失败，正在保留未同步内容';pauseStatus=e.status||0;autoPaused=[400,401,404,409].includes(e.status);throw e;}
  finally{saving=false;changed();controls();renderList();if(dirty()&&!autoPaused)queueAutosave();}
}
async function compile(){if(compiling||saving||!current)return;error();try{const doc=dirty()?await save():current;compiling=true;controls();renderList();$('compile-state').textContent='正在编译，请稍候…';$('log').textContent='正在编译 '+formatTime(doc.updated)+' 保存的源码，通常需要几秒至一分钟。';const run=await api('/api/compile','POST',{id:doc.id,revision:doc.revision});let result;for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,1000));result=await api('/api/runs/'+run.id);if(result.status!=='running')break;}if(result.status==='running')throw new Error('编译仍在处理中，请稍后重试或查看服务器状态');previews.set(doc.id,result);if(current.id===doc.id){showPreview(result);changed();}if(result.status!=='ok'){$('logs').open=true;error('编译失败，源码已保存。请查看日志中的具体错误。');}}catch(e){error(e.message);$('compile-state').textContent='编译未完成';}finally{compiling=false;controls();renderList();}}
function downloadSource(){const blob=new Blob([$('source').value],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=($('title').value.replace(/[\\/:*?"<>|]/g,'_')||'document')+'.tex';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('new').addEventListener('click',()=>confirmSwitch(()=>{$('new-form').reset();$('new-dialog').showModal();$('new-title').focus();}));
$('cancel-new').addEventListener('click',()=>$('new-dialog').close());
$('new-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const template=$('template').value;const result=await api('/api/docs','POST',{id:uid(),title:$('new-title').value.trim(),source:templates[template],engine:template==='article'?'pdflatex':'xelatex'});docs.unshift(result.doc);selectDoc(result.doc);$('new-dialog').close();error();}catch(e){$('new-dialog').close();error(e.message);}finally{button.disabled=false;}});
$('documents').addEventListener('click',e=>{const item=e.target.closest('[data-id]');if(item)confirmSwitch(()=>selectDoc(docs.find(d=>d.id===item.dataset.id)));});
$('stay').addEventListener('click',()=>$('confirm-dialog').close());$('discard').addEventListener('click',()=>{$('confirm-dialog').close();const action=afterDiscard;afterDiscard=null;action?.();});
for(const id of ['title','source','engine'])$(id).addEventListener('input',edited);
$('source').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const t=e.target;t.setRangeText('  ',t.selectionStart,t.selectionEnd,'end');edited();}});
$('compile').addEventListener('click',compile);$('source-download').addEventListener('click',downloadSource);
$('import').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>200000)return error('源码文件不能超过 200 KB');try{const source=await file.text();confirmSwitch(()=>{$('source').value=source;edited();});}catch(e){error(e.message);}});
$('refresh').addEventListener('click',()=>{if(pauseStatus===409){cacheDraft();load();}else confirmSwitch(load);});$('backup').addEventListener('click',()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({docs},null,2)],{type:'application/json'}));a.download='paper-desk-backup.json';a.click();});
$('login-dialog').addEventListener('cancel',e=>e.preventDefault());$('login-form').addEventListener('submit',async e=>{e.preventDefault();e.submitter.disabled=true;try{await api('/api/login','POST',{password:$('password').value});$('password').value='';$('login-dialog').close();document.body.classList.remove('locked');$('login-error').hidden=true;await start();}catch(err){$('login-error').textContent=err.message;$('login-error').hidden=false;}finally{e.submitter.disabled=false;}});
$('logout').addEventListener('click',()=>confirmSwitch(async()=>{try{await api('/api/logout','POST',{});docs=[];current=null;previews.clear();$('source').value='';$('title').value='';showPreview(null);changed();controls();renderList();login();}catch(e){error(e.message);}}));
window.addEventListener('beforeunload',e=>{if(dirty())cacheDraft();if(dirty()){e.preventDefault();e.returnValue='';}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();compile();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(current&&!saving)save().catch(e=>error(e.message));}});
$('tracker-link').href=new URL('../offerdesk-demo/',location.href).href;
async function start(){try{const session=await api('/api/session');$('app-version').textContent='v'+session.version;$('logout').hidden=!session.passwordProtected;if(!session.authenticated)return login();document.body.classList.remove('locked');const cap=await api('/api/capabilities');$('capability').textContent=cap.canCompile?'本地编译已就绪 · 支持 '+cap.engines.join(' / ')+' · 文件保存在 OPi 上':cap.message;await load();}catch(e){error('连接服务器失败：'+e.message);}}


function draftKey(id){return 'paper-desk-draft-v1:'+id;}
function fillDraft(fields){$('title').value=fields[0];$('source').value=fields[1];$('engine').value=fields[2];}
function cacheDraft(){
  clearTimeout(localCacheTimer);localCacheTimer=null;
  if(!current||recoveryDraft)return;
  try{localStorage.setItem(draftKey(current.id),JSON.stringify({baseRevision:current.revision,fields:JSON.parse(snapshot()),pending:dirty(),savedAt:new Date().toISOString()}));cacheFailed=false;}
  catch(e){cacheFailed=true;}
}
function queueAutosave(){
  if(autoTimer!==null||autoPaused||recoveryDraft)return;
  autoTimer=setTimeout(()=>{autoTimer=null;if(!dirty())return;if(saving){queueAutosave();return;}save().catch(e=>{changed();if(pauseStatus===409||pauseStatus===401)error(e.message);});},30000);
}
function edited(){if(![401,404,409].includes(pauseStatus)){autoPaused=false;saveError='';}if(localCacheTimer===null)localCacheTimer=setTimeout(cacheDraft,1000);changed();queueAutosave();}
$('recover-local').addEventListener('click',()=>{const copy=recoveryDraft;if(!copy)return;recoveryDraft=null;$('draft-recovery').hidden=true;fillDraft(copy.fields);autoPaused=false;pauseStatus=0;controls();edited();});
$('recover-server').addEventListener('click',()=>{
  if(recoveryDraft){try{localStorage.setItem(draftKey(current.id)+':recovery:'+Date.now(),JSON.stringify(recoveryDraft));}catch(e){return error('无法保留本机未同步内容副本，请先下载本机未同步内容。');}}
  recoveryDraft=null;autoPaused=false;pauseStatus=0;$('draft-recovery').hidden=true;cacheDraft();changed();controls();
});
$('recover-download').addEventListener('click',()=>{if(!recoveryDraft)return;const url=URL.createObjectURL(new Blob([recoveryDraft.fields[1]],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='recovered-draft.tex';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty()){cacheDraft();if(!saving&&!autoPaused)save().catch(()=>{});}});
window.addEventListener('online',()=>{if(![401,404,409].includes(pauseStatus)){autoPaused=false;queueAutosave();}});
controls();start();

$('pdf-download').addEventListener('click',async e=>{
  e.preventDefault();if(!current||currentRun?.status!=='ok'||saving)return;
  const url='sample.pdf';
  try{if(dirty())await save();const a=document.createElement('a');a.href=url;a.download=($('title').value.replace(/[\\/:*?"<>|]/g,'_')||'document')+'.pdf';a.click();}catch(e){error('下载前保存文档名称失败：'+e.message);}
});

document.querySelectorAll("[data-backend]").forEach(a=>a.onclick=e=>{e.preventDefault();backendRequired(a.dataset.backend);});
