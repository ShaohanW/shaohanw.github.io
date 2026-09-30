'use strict';
const demoKey = 'portfolio-offerdesk-demo-v1';
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
  if(path==='/api/session') return {authenticated:true,passwordProtected:false,version:'static-demo'};
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
  if(path==='/api/resumes') return {docs:[]};
  if(path==='/api/resume-files' && method==='GET') return {files:[]};
  if(path==='/api/ai') return {runtimeReady:false,models:[{id:'demo',name:'本地 GGUF 模型（需后端）',installed:false}],defaultModel:'demo',tasks:[]};
  throw new Error('此功能需要本地后端；静态演示不会上传文件或运行 AI。');
}
