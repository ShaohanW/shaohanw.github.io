'use strict';
const paperKey='portfolio-paperdesk-v1';
function backendRequired(feature='此操作') {
  const message=document.documentElement.lang.startsWith('en') ? `${feature} requires the local backend. No request was sent.` : `${feature}需要连接本地后端，当前未执行该操作。`;
  window.alert(message);return message;
}
const sampleSource=String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[margin=1.7cm]{geometry}
\usepackage[hidelinks]{hyperref}
\pagestyle{empty}
\begin{document}
{\LARGE\bfseries Alex Demo}\\[6pt]
Software Engineer | Example City
\section*{Profile}
Building thoughtful tools for everyday workflows.
\section*{Experience}
\textbf{Example Company --- Software Engineer}
\begin{itemize}
\item Built a local application tracker with Python and SQLite.
\item Developed browser interfaces for document workflows.
\end{itemize}
\section*{Projects}
\textbf{Personal Workbench} --- Python, JavaScript, Linux
\section*{Education}
Example University --- Engineering
\end{document}`;
const paperSeed=()=>({docs:[{id:'sample-resume',title:'示例简历 · Alex Demo',source:sampleSource,engine:'pdflatex',revision:1,updated:new Date().toISOString(),created:new Date().toISOString()}],trash:[]});
let paperStore;
try { paperStore=JSON.parse(localStorage.getItem(paperKey))||paperSeed(); } catch { paperStore=paperSeed(); }
const paperCopy=value=>structuredClone(value);
function savePaper(){localStorage.setItem(paperKey,JSON.stringify(paperStore));}
async function paperApi(path,method='GET',data) {
  if(path==='/api/modules')return {records:paperCopy(paperStore.modules||[])};
  if(path==='/api/modules/save') {
    const record={...data,revision:(data.revision||0)+1,created:new Date().toISOString()};
    paperStore.modules||=[];paperStore.modules.unshift(record);savePaper();return {record:paperCopy(record)};
  }
  if(path==='/api/session')return {authenticated:true,passwordProtected:false,version:'0.5.5'};
  if(path==='/api/capabilities')return {canCompile:false,message:''};
  if(path==='/api/docs') {
    if(method==='GET')return {docs:paperCopy(paperStore.docs)};
    const prior=paperStore.docs.find(d=>d.id===data.id);
    const doc={...data,id:data.id||crypto.randomUUID(),revision:(prior?.revision||0)+1,created:prior?.created||new Date().toISOString(),updated:new Date().toISOString()};
    paperStore.docs=paperStore.docs.filter(d=>d.id!==doc.id);paperStore.docs.unshift(doc);savePaper();return {doc:paperCopy(doc)};
  }
  if(/^\/api\/docs\/[^/]+\/latest-run$/.test(path)) {
    const doc=paperStore.docs.find(d=>path.includes('/'+d.id+'/'));
    return {run:doc?.id==='sample-resume'?{id:'sample',status:'ok',revision:doc.source===sampleSource?doc.revision:1,created:doc.created,log:'示例 PDF',pdfUrl:'sample.pdf'}:null};
  }
  if(path==='/api/trash')return {docs:paperCopy(paperStore.trash)};
  if(path==='/api/trash/move') {
    const doc=paperStore.docs.find(d=>d.id===data.id);
    if(doc){paperStore.docs=paperStore.docs.filter(d=>d.id!==doc.id);paperStore.trash.unshift({...doc,deleted:new Date().toISOString()});savePaper();}
    return {missingPdfs:0};
  }
  if(path==='/api/trash/restore') {
    const doc=paperStore.trash.find(d=>d.id===data.id);
    if(doc){paperStore.trash=paperStore.trash.filter(d=>d.id!==doc.id);paperStore.docs.unshift(doc);savePaper();}
    return {doc:paperCopy(doc)};
  }
  if(/^\/api\/history\/[^/]+$/.test(path))return {versions:[]};
  backendRequired(path==='/api/compile'?'PDF 编译':'版本与文档服务');
  throw new Error('');
}
