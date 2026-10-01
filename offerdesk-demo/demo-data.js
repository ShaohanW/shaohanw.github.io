'use strict';
const demoKey = 'portfolio-offerdesk-demo-v1';
function backendRequired(feature='此操作') {
  const message=document.documentElement.lang.startsWith('en') ? `${feature} requires the local backend. No request was sent.` : `${feature}需要连接本地后端，当前未执行该操作。`;
  window.alert(message);
  return message;
}
const demoSeed = () => ['saved','applied','applied','assessment','interview','offer','closed'].map((status,i) => ({
  id:'demo-'+i,revision:1,company:'示例公司 '+String.fromCharCode(65+i),
  role:['Embedded AI Engineer','Software Engineer','Linux Driver Engineer','Robotics Software Engineer','Embedded Software Engineer','Computer Vision Engineer','Control Systems Engineer'][i],
  status,location:'演示地点',notes:'虚构演示记录，可点击编辑或拖动切换阶段。',url:'',resume:'示例简历',
  createdAt:new Date().toISOString().slice(0,10),updatedAt:new Date().toISOString(),applied:status==='saved'?'':new Date().toISOString().slice(0,10),
  events:['assessment','interview'].includes(status)?[{id:'event-'+i,type:status,title:status==='interview'?'技术面试':'在线测评',round:1,result:'waiting',completed:false,meetingMode:'video',url:'',location:'演示地点',notes:'',start:new Date(Date.now()+86400000*2).toISOString(),end:new Date(Date.now()+86400000*2+3600000).toISOString()}]:[]
}));
let demoRecords;
try { demoRecords=JSON.parse(localStorage.getItem(demoKey)) || demoSeed(); } catch { demoRecords=demoSeed(); }
async function demoApi(path, method='GET', body) {
  if(path==='/api/session') return {authenticated:true,passwordProtected:false,version:'0.5.5'};
  if(path==='/api/jobs') {
    if(method==='GET') return {jobs:structuredClone(demoRecords)};
    const previous=demoRecords.find(j=>j.id===body.id);
    const next={...body,id:body.id||crypto.randomUUID(),revision:(previous?.revision||0)+1,updatedAt:new Date().toISOString()};
    const updated=demoRecords.filter(j=>j.id!==body.id);
    if(method!=='DELETE') updated.unshift(next);
    try { localStorage.setItem(demoKey,JSON.stringify(updated)); } catch { throw new Error('浏览器存储不可用，演示修改未保存。'); }
    demoRecords=updated;
    return {job:structuredClone(next)};
  }
  if(path==='/api/resumes') {
    let documents=[];
    try { documents=JSON.parse(localStorage.getItem('portfolio-paperdesk-v1'))?.docs||[]; } catch {}
    return {docs:documents.length?documents.map(d=>({...d,pdfRunId:d.id==='sample-resume'?'sample':null})): [{id:'sample-resume',title:'示例简历 · Alex Demo',revision:1,pdfReady:true,pdfRunId:'sample'}]};
  }
  if(path==='/api/resume-files' && method==='GET') return {files:[]};
  if(path==='/api/ai') return {runtimeReady:false,models:[{id:'1.5b',name:'Qwen2.5-1.5B-Instruct · Q4_K_M'},{id:'1.5b-q3',name:'Qwen2.5-1.5B-Instruct · Q3_K_M'},{id:'0.5b',name:'Qwen2.5-0.5B-Instruct · Q4_K_M'},{id:'2b',name:'Qwen3.5-2B · 指令对话 · Q4_K_M'}],defaultModel:'1.5b',tasks:[]};
  backendRequired(path.startsWith('/api/ai')?'AI 分析':'文件服务');
  throw new Error('');
}
