'use strict';
const $ = (id) => document.getElementById(id);
const stages = [['saved','待投递',['saved']],['applied','已投递',['applied']],['assessment','OA / 笔试',['assessment']],['interview','面试中',['interview']],['outcome','Offer / 已结束',['offer','closed']]];
const eventTypes = [['followup','跟进'],['deadline','截止时间']];
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区';
let uploadedPdfs = [], pdfRequest = 0;
let resumes = [], resumeRequest = 0, incomingResumeHandled = false;
let jobs = [], editing = null, initialForm = '', busy = false, loaded = false, toastTimer, confirmAction, suppressCardClickUntil = 0;
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function uuid() { if (crypto.randomUUID) return crypto.randomUUID(); const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128; return [...b].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join(''); }
const localTime = (value) => { if (!value) return ''; const d=new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const todayLocal = () => localTime(new Date()).slice(0,10);
const localTimeValue = (value) => String(value||'').trim().replace(' ','T');
const displayLocalTime = (value) => String(value||'').replace('T',' ');
function validLocalTime(value){const normalized=localTimeValue(value),date=new Date(normalized);return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)&&Number.isFinite(date.getTime())&&localTime(date)===normalized;}
function openNativePicker(picker){if(typeof picker.showPicker==='function')picker.showPicker();else{picker.focus();picker.click();}}
const shortDate = (value) => new Date(value).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});
const clock = (value) => new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
function notify(message) { $('toast').textContent=message; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4200); }
function setError(id, message) { $(id).textContent=message; $(id).classList.toggle('hidden',!message); }
async function api(path, method='GET', body) { return demoApi(path, method, body); }
function showLogin() { document.body.classList.add('login-mode'); if(!$('login-dialog').open) $('login-dialog').showModal(); }
function normalizeJob(job){
  const events=job.events||[], interviews=events.filter(e=>e.type==='interview').sort((a,b)=>(a.round||99)-(b.round||99));
  if(job.status==='interview'&&job.interviewUrl&&!interviews.length){const event={id:uuid(),type:'interview',title:'面试',round:1,url:job.interviewUrl,start:'',end:'',location:'',meetingMode:'video',latitude:null,longitude:null,notes:'',completed:false,result:'waiting'};events.push(event);interviews.push(event);}
  interviews.forEach((event,index)=>{event.round=event.round||index+1;event.result=event.result|| (event.completed?'passed':'waiting');event.completed=event.result==='passed';if(!event.url&&job.interviewUrl)event.url=job.interviewUrl;});
  return {...job,flowHistory:Array.isArray(job.flowHistory)?job.flowHistory:legacyHistory(job),createdAt:job.createdAt||'',offerAt:job.offerAt||'',closedAt:job.closedAt||'',assessmentUrl:job.assessmentUrl||'',interviewUrl:'',offerUrl:job.offerUrl||'',offerPdfId:job.offerPdfId||'',offerPdfName:job.offerPdfName||'',offerDecision:job.offerDecision||'pending',closedUrl:job.closedUrl||'',events};
}
async function load() { $('refresh').disabled=true; try { const data=await api('/api/jobs'); jobs=data.jobs.map(normalizeJob); loaded=true; render(); openIncomingResume(); setError('load-error',''); $('save-state').textContent='示例记录保存在当前浏览器 · '+clock(new Date())+' 更新'; } catch(e) { setError('load-error',e.message+'。可点击右侧刷新按钮重试。'); $('save-state').textContent='暂时未能读取记录'; } finally { $('refresh').disabled=false; } }
function allEvents() { return jobs.flatMap(job=>job.events.filter(event=>event.start&&event.end).map(event=>({job,event}))).sort((a,b)=>new Date(a.event.start)-new Date(b.event.start)); }
function render() {
  const now=Date.now(), events=allEvents(), pending=events.filter(x=>!x.event.completed);
  $('stat-active').textContent=jobs.filter(j=>!['closed','offer'].includes(j.status)).length;
  $('stat-interview').textContent=jobs.filter(j=>j.status==='interview').length;
  $('stat-offer').textContent=jobs.filter(j=>j.status==='offer').length;
  $('stat-week').textContent=pending.filter(x=>new Date(x.event.start)>=now && new Date(x.event.start)<=now+7*86400000).length;
  $('agenda-count').textContent=pending.length;
  $('board').innerHTML=stages.map(([key,label,statuses],i)=>{const list=sortStageJobs(key,jobs.filter(j=>statuses.includes(j.status)));return `<section class="column" data-stage="${key}"><h2><span class="stage-dot stage-${key}"></span>${label}<span class="count">${list.length}</span></h2><div class="column-cards">${list.length?list.map(card).join(''):`<div class="column-empty">${i===0?'从顶部添加一个机会':'拖到这里更新进度'}</div>`}</div></section>`;}).join('');
  renderAgenda();
}
function safeJobUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function interviewEvents(job){return (job.events||[]).filter(e=>e.type==='interview').sort((a,b)=>(a.round||99)-(b.round||99));}
function currentInterview(job){return interviewEvents(job).find(e=>e.result!=='passed'&&!e.completed)||null;}
function googleMapUrl(event){if(event?.meetingMode!=='onsite')return '';const lat=event.latitude,lon=event.longitude,coordinates=typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)?`${lat},${lon}`:'';const query=coordinates||event.location?.trim();return query?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query):'';}
function eventActionUrl(job,event){if(event?.type==='interview'&&event.meetingMode!=='onsite')return safeJobUrl(event.url);return '';}
function sortStageJobs(stage,list){
  if(stage==='interview')return list.sort((a,b)=>{const ae=currentInterview(a),be=currentInterview(b);return (ae?.start?new Date(ae.start):Infinity)-(be?.start?new Date(be.start):Infinity)||((ae?.round||99)-(be?.round||99));});
  if(stage==='outcome')return list.sort((a,b)=>(a.status==='closed')-(b.status==='closed')||new Date(b.updatedAt)-new Date(a.updatedAt));
  return list.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
}
function currentAction(job){
  const events=(job.events||[]).filter(e=>!e.completed).sort((a,b)=>new Date(a.start)-new Date(b.start));
  if(job.status==='assessment'){
    const event=events.find(e=>e.type==='assessment'),url=safeJobUrl(event?.url||job.assessmentUrl);return {url,label:url?'进入 OA / 笔试':'OA / 笔试',time:event?.start?`${shortDate(event.start)} ${clock(event.start)}`:''};
  }
  if(job.status==='interview'){
    const event=currentInterview(job),url=event?eventActionUrl(job,event):'',onsite=event?.meetingMode==='onsite';
    return {url,label:onsite?'下一轮线下面试':(url&&event?.start?'进入下一轮面试':'下一轮面试'),time:event?.start?`${shortDate(event.start)} ${clock(event.start)}`:''};
  }
  if(job.status==='offer'){const url=safeJobUrl(job.offerUrl);return {url,label:url?'查看 Offer':'Offer',time:''};}
  if(job.status==='closed'){const url=safeJobUrl(job.closedUrl);return {url,label:job.closedReason==='offer_rejected'?'已拒绝 Offer':url?'查看结束通知':job.closedReason==='interview_failed'?'面试未通过':'流程已结束',time:''};}
  if(job.status==='applied'){const url=safeJobUrl(job.url);return {url,label:url?'查看投递链接':'已投递',time:''};}
  return {url:'',label:'待投递',time:''};
}
function roundName(number){const names=['一','二','三','四','五','六','七','八','九','十'];return `${names[number-1]||number}轮面试`;}
const flowOrder=['saved','applied','assessment','interview','offer','closed'];
const flowLabels={saved:'创建 / 待投递',applied:'投递',assessment:'OA / 笔试',interview:'面试',offer:'Offer',closed:'已结束'};
let selectedHistoryId='';
function legacyHistory(job){
  const result=[],add=(stage,date,eventId='')=>result.push({id:uuid(),stage,date:date?String(date).slice(0,10):'',eventId});
  if(job.createdAt)add('saved',job.createdAt);
  if(job.applied)add('applied',job.applied);
  for(const event of job.events||[])if(['assessment','interview'].includes(event.type))add(event.type,event.start,event.id);
  if(job.offerAt||job.offerUrl||job.offerPdfId)add('offer',job.offerAt);
  if(job.closedAt||job.closedUrl)add('closed',job.closedAt);
  // Older releases did not store transitions. Preserve known entries without inventing a route.
  if(result.at(-1)?.stage!==job.status)add(job.status||'saved','');
  return result;
}
function enterStage(job,stage,eventId=''){
  if(!Array.isArray(job.flowHistory))job.flowHistory=legacyHistory(job);
  job.flowHistory.push({id:uuid(),stage,date:todayLocal(),eventId});
  job.status=stage;
  return job.flowHistory.at(-1);
}
function historyLabel(entry,events){const event=events.find(e=>e.id===entry.eventId);return entry.stage==='interview'&&event?roundName(event.round||1):flowLabels[entry.stage];}
function card(job) {
  const action=currentAction(job), role=job.role||'TBD', offer=job.status==='offer';
  const jobUrl=offer?safeJobUrl(job.url):'',offerUrl=offer?safeJobUrl(job.offerUrl):'',offerPdfUrl=offer&&job.offerPdfId?'/api/offer-files/'+encodeURIComponent(job.offerPdfId)+'/pdf':'';
  const actionBlock=action.url||action.time?`<div class="card-current ${action.url?'is-link':''}">${action.time?`<span>${escape(action.time)}</span>`:''}<strong>${escape(action.label)}${action.url?' ↗':''}</strong></div>`:'';
  const offerBlock=offer?`<div class="offer-stage-zone"><div class="offer-links">${job.offerDecision==='signed'?'<span class="offer-decision-badge">已签约</span>':''}${offerUrl?`<a href="${escape(offerUrl)}" target="_blank" rel="noopener noreferrer" draggable="false">查看 Offer ↗</a>`:''}${offerPdfUrl?`<a href="${escape(offerPdfUrl)}" target="_blank" rel="noopener noreferrer" draggable="false">打开 Offer PDF ↗</a>`:''}${!offerUrl&&!offerPdfUrl&&job.offerDecision!=='signed'?'<span>Offer</span>':''}</div><button type="button" class="offer-celebrate" data-celebrate="${job.id}" aria-label="为 ${escape(job.company)} 的 Offer 庆祝一下">庆祝一下</button></div>`:'';
  const current=job.status==='interview'?currentInterview(job):null,map=current&&!current.completed?googleMapUrl(current):'';
  const mapBlock=map?`<a class="card-map-zone" draggable="false" href="${escape(map)}" target="_blank" rel="noopener noreferrer" aria-label="在 Google 地图查看 ${escape(job.company)} 的面试地点"><span>打开地图</span><strong>${escape(current.location||`${current.latitude}, ${current.longitude}`)} ↗</strong></a>`:'';
  return `<article class="job-card ${!offer&&action.url?'has-url':''} ${offer?'is-offer':''}" draggable="false" data-job="${job.id}" ${!offer?`data-url="${escape(action.url)}" ${action.url?'tabindex="0" role="link"':''}`:''} aria-label="${escape(job.company)}，${escape(role)}${!offer&&action.url?'。点击打开当前阶段链接，拖动更新进度':'。拖动更新进度'}"><div class="card-main ${offer?'offer-job-zone':''}" ${jobUrl?`data-card-link="job" data-url="${escape(jobUrl)}" role="link" tabindex="0" aria-label="打开 ${escape(job.company)} 的岗位链接"`:''}><div class="card-company"><span class="company-name">${escape(job.company)}${jobUrl||(!offer&&action.url)?' ↗':''}</span></div><h3 class="card-role ${job.role?'':'is-tbd'}">${escape(role)}</h3>${offer?'':actionBlock}</div>${offer?offerBlock:''}${mapBlock}<div class="card-foot">${offer?`<button class="card-offer-action" data-offer-sign="${job.id}">${job.offerDecision==='signed'?'撤销签约':'签约'}</button><button class="card-offer-action is-danger" data-offer-reject="${job.id}">拒绝</button>`:''}<button class="card-edit" data-edit="${job.id}" aria-label="编辑 ${escape(job.company)} ${escape(role)} 的记录">编辑</button></div></article>`;
}
function googleUrl(job,event) {
  const utc=(v)=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const meetingUrl=event.type==='assessment'&&job.status==='assessment'?event.url:event.type==='interview'&&job.status==='interview'?(event.meetingMode==='onsite'?'':event.url):'';
  return 'https://calendar.google.com/calendar/render?'+new URLSearchParams({action:'TEMPLATE',text:job.company+' · '+event.title,dates:utc(event.start)+'/'+utc(event.end),details:[job.role,meetingUrl,event.notes].filter(Boolean).join('\n'),location:event.location,ctz:zone});
}
function renderAgenda() {
  const events=allEvents().filter(x=>$('show-completed').checked||!x.event.completed);
  $('agenda-list').innerHTML=events.length?events.map(({job,event})=>{
    const interview=event.type==='interview',onsite=job.status==='interview'&&interview&&event.meetingMode==='onsite';
    const link=job.status==='interview'&&interview?(onsite?googleMapUrl(event):eventActionUrl(job,event)):job.status==='assessment'&&event.type==='assessment'?safeJobUrl(event.url):'';
    const state=interview?(event.completed?'已通过':'等待中'):(event.completed?'已完成':new Date(event.start)<Date.now()?'待处理':'');
    return `<article class="agenda-row ${event.completed?'agenda-completed':''}"><div class="agenda-date">${shortDate(event.start)}<strong>${clock(event.start)}</strong></div><div class="agenda-info"><h3>${escape(job.company)} · ${escape(event.title)}</h3><p>${state?`<span class="status-label">${state}</span>`:''}${escape(job.role)}</p>${event.location?`<p>${escape(event.location)}</p>`:''}</div><div class="agenda-actions">${link?`<a href="${escape(link)}" target="_blank" rel="noopener noreferrer">${onsite?'打开地图':event.type==='assessment'?'进入 OA / 笔试':'进入面试'} ↗</a>`:''}<a href="${escape(googleUrl(job,event))}" target="_blank" rel="noopener noreferrer" aria-label="把${escape(event.title)}加入 Google 日历">Google ↗</a><button class="text-button" data-event-edit="${job.id}">编辑</button>${interview&&job.status==='interview'?`<button type="button" class="text-button blue" data-interview-result="${event.id}" data-job="${job.id}">${event.completed?'恢复等待':'标记通过'}</button>`:interview?'':`<label class="check-label"><input type="checkbox" data-complete="${event.id}" data-job="${job.id}" ${event.completed?'checked':''}>完成</label>`}</div></article>`;
  }).join(''):'<div class="empty-agenda"><div class="empty-symbol">＋</div><strong>给下一步留个时间</strong><p>未排时间的面试仍会留在岗位详情；确定时间后再加入日历。</p></div>';
}
function switchTab(name, focus=false) { ['board','agenda'].forEach(n=>{const active=n===name; $('tab-'+n).classList.toggle('active',active);$('tab-'+n).setAttribute('aria-selected',String(active));$('tab-'+n).tabIndex=active?0:-1;$(n).classList.toggle('hidden',!active);}); if(focus)$('tab-'+name).focus(); }
function formSnapshot() { return JSON.stringify([...[...$('job-form').elements].filter(el=>el.name).map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]),...readEventInputs(),editing?.flowHistory||[]]); }
function openEditor(job, status='saved') {
  editing=normalizeJob(job?structuredClone(job):{id:uuid(),status,createdAt:todayLocal(),events:[],flowHistory:[{id:uuid(),stage:status,date:todayLocal(),eventId:''}]}); selectedHistoryId=editing.flowHistory.at(-1)?.id||''; $('job-form').reset(); renderResumeOptions(editing.resumeDocId||'');renderPdfOptions(editing.resumeFileId||'');
  for(const key of ['company','role','status','createdAt','applied','offerAt','closedAt','url','assessmentUrl','offerUrl','offerPdfId','offerDecision','closedUrl','closedReason','location','contact','resume','resumeDocId','resumeFileId','notes']) $(key).value=editing[key]|| (key==='status'?'saved':'');
  for(const name of ['createdAt','applied','offerAt','closedAt']){const native=document.querySelector(`[data-date-native="${name}"]`);native.value=$(name).value;}
  updateOfferPdfControls(editing.offerPdfName||'');
  $('editor-title').textContent=job?'编辑岗位':'添加岗位';$('delete-job').classList.toggle('hidden',!job);setError('form-error','');
  renderEventEditor(editing.events.map(e=>({...e,start:localTime(e.start),end:localTime(e.end)})));
  $('job-dialog').showModal();updateStageLinks();initialForm=formSnapshot();$('company').focus(); refreshResumes();refreshPdfLibrary();
}
function readEventInputs() { return [...$('event-editor').querySelectorAll('.event-block')].map(block=>{const value=(key)=>block.querySelector(`[data-field="${key}"]`).value,type=value('type'),result=type==='interview'?value('result'):'';return {id:block.dataset.id,title:value('title'),type,round:type==='interview'?Number(block.dataset.round):0,url:value('url'),start:localTimeValue(value('start')),end:localTimeValue(value('end')),location:value('location'),meetingMode:value('meetingMode'),latitude:value('latitude')===''?null:Number(value('latitude')),longitude:value('longitude')===''?null:Number(value('longitude')),notes:value('notes'),result,completed:type==='interview'?result==='passed':block.querySelector('[data-field="completed"]').checked};}); }
function eventTimeControl(field,label,index,value,required){
  return `<label>${label}<span class="event-time-control"><input data-field="${field}" aria-label="安排 ${index} ${field==='start'?'开始':'结束'}时间" type="text" inputmode="numeric" autocomplete="off" maxlength="16" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}" title="请按 YYYY-MM-DD HH:mm 输入" placeholder="YYYY-MM-DD HH:mm" value="${escape(displayLocalTime(value))}" ${required?'required':''}><button type="button" class="event-picker-button" data-open-event-picker="${field}" aria-label="选择${field==='start'?'开始':'结束'}日期和时间">▦</button><input class="event-native-picker" type="datetime-local" value="${escape(value||'')}" tabindex="-1" aria-hidden="true"></span></label>`;
}
function eventBlock(e,index,round){
  const interview=e.type==='interview',assessment=e.type==='assessment',stageEvent=interview||assessment;
  const onsite=interview&&e.meetingMode==='onsite',result=e.result||(e.completed?'passed':'waiting');
  const typeControl=stageEvent?`<input type="hidden" data-field="type" value="${e.type}">`:`<label>提醒类型<select data-field="type" aria-label="提醒 ${index+1} 类型">${eventTypes.map(([type,label])=>`<option value="${type}" ${e.type===type?'selected':''}>${label}</option>`).join('')}</select></label>`;
  const heading=interview?roundName(round):assessment?`OA / 笔试 ${index+1}`:`提醒 ${index+1}`;
  const resultControl=interview?`<label>面试状态<select data-field="result"><option value="waiting" ${result!=='passed'?'selected':''}>等待中</option><option value="passed" ${result==='passed'?'selected':''}>已通过</option></select></label>`:'';
  const modeControl=interview?`<label>会议方式<select data-field="meetingMode"><option value="video" ${!onsite?'selected':''}>视频会议</option><option value="onsite" ${onsite?'selected':''}>线下会议</option></select></label>`:'<input type="hidden" data-field="meetingMode" value="video">';
  const linkControl=`<label class="${onsite?'hidden':''} event-link">${interview?'面试链接':assessment?'OA / 笔试链接':'相关链接'}<input data-field="url" type="url" value="${escape(e.url||'')}" maxlength="2000" placeholder="https://…"></label>`;
  return `<section class="event-block" data-id="${e.id}" data-round="${round}"><div class="event-head"><span>${escape(heading)}${interview?(result==='passed'?' · 已通过':' · 等待中'):e.completed?' · 已完成':''}</span><button type="button" class="text-button" data-remove-event="${e.id}">移除</button></div><div class="event-fields">${typeControl}<label>名称<input data-field="title" aria-label="${escape(heading)}名称" value="${escape(e.title)}" maxlength="200" required></label>${resultControl}${modeControl}${linkControl}${eventTimeControl('start',stageEvent?'开始时间（可留空）':'开始时间',index+1,e.start,!stageEvent)}${eventTimeControl('end',stageEvent?'结束时间（可留空）':'结束时间',index+1,e.end,!stageEvent)}<label class="full event-location">${onsite?'线下地点':'地点'}<input data-field="location" value="${escape(e.location||'')}" maxlength="1000" placeholder="${onsite?'会议室或详细地址':'会议室、地址或平台名称'}"></label><div class="event-map ${onsite?'':'hidden'}"><button type="button" class="secondary" data-pick-map="${e.id}">在地图上选点</button><span class="map-selection">${typeof e.latitude==='number'&&typeof e.longitude==='number'?escape(e.location||`${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`):'未选地图位置'}</span></div><input type="hidden" data-field="latitude" value="${typeof e.latitude==='number'?escape(e.latitude):''}"><input type="hidden" data-field="longitude" value="${typeof e.longitude==='number'?escape(e.longitude):''}"><label class="full">准备事项<input data-field="notes" value="${escape(e.notes||'')}" maxlength="3000" placeholder="需要准备什么？"></label><label class="check-label full ${interview?'hidden':''}"><input type="checkbox" data-field="completed" ${e.completed?'checked':''}>已完成</label>${interview?`<button type="button" class="text-button danger full event-failed ${result==='passed'||$('status').value!=='interview'?'hidden':''}" data-interview-failed="${e.id}">这轮未通过 · 结束岗位</button>`:''}</div></section>`;
}
function renderEventEditor(events){
  const assessments=events.filter(e=>e.type==='assessment'),interviews=events.filter(e=>e.type==='interview'),reminders=events.filter(e=>!['assessment','interview'].includes(e.type));
  $('assessment-events').innerHTML=assessments.map((e,i)=>eventBlock(e,i,0)).join('');
  $('interview-events').innerHTML=interviews.map((e,i)=>eventBlock(e,i,e.round||i+1)).join('');
  $('reminder-events').innerHTML=reminders.map((e,i)=>eventBlock(e,i,0)).join('');
  $('no-events').classList.toggle('hidden',reminders.length>0);
  updateFlowSteps();
}
function updateFlowSteps(){
  const history=editing?.flowHistory||[],store=$('flow-fields-store'),list=$('flow-history');
  for(const panel of $('event-editor').querySelectorAll('[data-flow-stage]')){panel.classList.add('hidden');store.append(panel);}
  if(selectedHistoryId!=='collapsed'&&!history.some(entry=>entry.id===selectedHistoryId))selectedHistoryId=history.at(-1)?.id||'';
  const events=readEventInputs(),current=history.at(-1),ordered=current?[current,...history.slice(0,-1)]:[];
  list.innerHTML=ordered.map(entry=>`<section class="flow-entry ${entry===current?'is-current':''}" data-history-id="${entry.id}"><header class="flow-head"><div><strong>${escape(historyLabel(entry,events))}</strong>${entry===current?'<span class="history-current">当前</span>':''}</div><div class="flow-entry-actions"><button type="button" class="text-button blue" data-edit-history="${entry.id}">${entry.id===selectedHistoryId?'收起':'详情'}</button>${entry!==current?`<button type="button" class="text-button" data-current-history="${entry.id}">推进到这里</button>`:''}<button type="button" class="text-button danger" data-remove-history="${entry.id}">移除</button></div></header><label class="history-date">进入日期<input type="text" data-history-date="${entry.id}" value="${escape(entry.date)}" maxlength="10" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" placeholder="YYYY-MM-DD"></label><div class="flow-entry-detail" data-history-detail="${entry.id}"></div></section>`).join('')||'<p class="field-hint">还没有流程记录。</p>';
  const selected=history.find(entry=>entry.id===selectedHistoryId);
  if(selected){
    const panel=store.querySelector(`[data-flow-stage="${selected.stage}"]`);
    panel.classList.remove('hidden');list.querySelector(`[data-history-detail="${selected.id}"]`).append(panel);
    for(const block of panel.querySelectorAll('.event-block'))block.classList.toggle('hidden',Boolean(selected.eventId)&&block.dataset.id!==selected.eventId);
  }
  $('flow-add-stage').innerHTML='<option value="">推进到…</option>'+flowOrder.map(name=>`<option value="${name}">${flowLabels[name]}</option>`).join('');
}
function removeHistory(id){
  const entry=editing.flowHistory.find(item=>item.id===id);if(!entry)return;
  let events=readEventInputs();editing.flowHistory=editing.flowHistory.filter(item=>item.id!==id);
  if(entry.eventId&&!editing.flowHistory.some(item=>item.eventId===entry.eventId))events=events.filter(event=>event.id!==entry.eventId);
  $('status').value=editing.flowHistory.at(-1)?.stage||'saved';
  selectedHistoryId=editing.flowHistory.at(-1)?.id||'';
  renderEventEditor(events);updateStageLinks();
}
function askConfirm(title,description,action,label='确认') { $('confirm-title').textContent=title;$('confirm-description').textContent=description;$('confirm-ok').textContent=label;confirmAction=action;$('confirm-dialog').showModal(); }
function closeEditor() { if(busy)return; if(formSnapshot()!==initialForm) askConfirm('放弃未保存的修改？','这次填写的内容尚未保存。',()=>$('job-dialog').close(),'放弃修改'); else $('job-dialog').close(); }
function collectJob() { const data={...editing};for(const key of ['company','role','status','createdAt','applied','offerAt','closedAt','url','assessmentUrl','offerUrl','offerPdfId','offerDecision','closedUrl','closedReason','location','contact','resume','resumeDocId','resumeFileId','notes'])data[key]=$(key).value.trim();data.interviewUrl='';if(data.status!=='closed')data.closedReason='';data.events=readEventInputs().map(e=>{if(!e.start&&!e.end&&['interview','assessment'].includes(e.type))return {...e,start:'',end:''};if(!e.start||!e.end)throw new Error('填写安排时间时，请同时填写开始和结束时间');if(e.type==='interview'&&(!Number.isInteger(e.round)||e.round<1||e.round>20))throw new Error('面试记录最多 20 轮');const start=new Date(e.start),end=new Date(e.end);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||localTime(start)!==e.start||localTime(end)!==e.end)throw new Error('安排时间无效，或位于夏令时跳过的时段');if(end<=start)throw new Error('结束时间需要晚于开始时间');return {...e,start:start.toISOString(),end:end.toISOString()};});return data; }
async function persist(job) { const result=await api('/api/jobs',job.revision?'PUT':'POST',job); const idx=jobs.findIndex(j=>j.id===result.job.id);if(idx>=0)jobs[idx]=result.job;else jobs.unshift(result.job);render();$('save-state').textContent='已保存到当前浏览器 · '+clock(new Date());return result.job; }
function editorBusy(value) { busy=value;$('save-job').disabled=value;$('delete-job').disabled=value;$('save-job').textContent=value?'正在保存…':'保存岗位'; }
async function submitJob(event) { event.preventDefault();if(busy)return;setError('form-error','');try { const job=collectJob();editorBusy(true);await persist(job);$('job-dialog').close();notify('岗位已保存'); } catch(e){setError('form-error',e.message);$('form-error').scrollIntoView({block:'nearest'});} finally{editorBusy(false);} }
$('add-job').addEventListener('click',()=>{if(loaded)openEditor();else notify('请先连接服务器并加载记录');});
$('refresh').addEventListener('click',load);
$('tab-board').addEventListener('click',()=>switchTab('board'));
$('tab-agenda').addEventListener('click',()=>switchTab('agenda'));
document.querySelector('.tabs').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const current=$('tab-board').getAttribute('aria-selected')==='true';switchTab(e.key==='Home'?'board':e.key==='End'?'agenda':current?'agenda':'board',true);}});
$('show-completed').addEventListener('change',renderAgenda);
function openCardUrl(card){const url=safeJobUrl(card?.dataset.url);if(!url||Date.now()<suppressCardClickUntil)return;const opened=window.open(url,'_blank','noopener,noreferrer');if(opened)opened.opener=null;}
function celebrateOffer(card){
  if(!card?.classList.contains('is-offer'))return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){notify('🎉 Offer，恭喜！');return;}
  document.querySelector('.offer-celebration')?.remove();
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)return;
  canvas.className='offer-celebration';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
  const ratio=Math.min(window.devicePixelRatio||1,1.5),width=window.innerWidth,height=window.innerHeight;
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.scale(ratio,ratio);
  const cardRect=card.getBoundingClientRect(),originX=Math.max(90,Math.min(width-90,cardRect.left+cardRect.width/2)),originY=Math.max(110,Math.min(height-110,cardRect.top+cardRect.height/2));
  const colors=['#376ee8','#2ea9b1','#8c6ac8','#e66986','#45ae79','#5c91dc'];
  const bursts=Array.from({length:8},(_,i)=>({at:i*.53,x:i===0?originX:width*(.18+((i*29)%64)/100),y:i===0?originY:height*(.22+((i*17)%45)/100),started:false}));
  const particles=[];let last=performance.now(),start=last;
  function frame(now){
    const elapsed=(now-start)/1000,step=Math.min((now-last)/1000,.05);last=now;ctx.clearRect(0,0,width,height);
    for(const burst of bursts){if(burst.started||elapsed<burst.at)continue;burst.started=true;for(let i=0;i<36;i++){const angle=i*Math.PI/18+(Math.random()-.5)*.1,speed=65+Math.random()*105;const color=colors[(i+Math.round(burst.at*4))%colors.length];particles.push({x:burst.x,y:burst.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,age:0,life:.85+Math.random()*.45,color});}}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=step;if(p.age>=p.life){particles.splice(i,1);continue;}const oldX=p.x,oldY=p.y;p.x+=p.vx*step;p.y+=p.vy*step;p.vy+=70*step;const alpha=(1-p.age/p.life)**1.4;ctx.globalAlpha=alpha;ctx.strokeStyle=p.color;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(oldX,oldY);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;if(elapsed<5)requestAnimationFrame(frame);else canvas.remove();
  }
  requestAnimationFrame(frame);
}
$('board').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]');if(edit){openEditor(jobs.find(j=>j.id===edit.dataset.edit));return;}const sign=e.target.closest('[data-offer-sign]');if(sign){const job=jobs.find(j=>j.id===sign.dataset.offerSign);if(job?.status==='offer')updateOfferDecision(job,job.offerDecision==='signed'?'pending':'signed');return;}const reject=e.target.closest('[data-offer-reject]');if(reject){const job=jobs.find(j=>j.id===reject.dataset.offerReject);if(job?.status==='offer')askConfirm('拒绝这个 Offer？','岗位将移到“已结束”，Offer 链接和 PDF 会保留在详情中。',()=>updateOfferDecision(job,'rejected'),'拒绝 Offer');return;}const celebrate=e.target.closest('[data-celebrate]');if(celebrate){celebrateOffer(celebrate.closest('.job-card'));return;}if(e.target.closest('a,button'))return;const card=e.target.closest('[data-job]');if(!card||Date.now()<suppressCardClickUntil)return;if(card.classList.contains('is-offer')){openCardUrl(e.target.closest('[data-card-link]'));return;}openCardUrl(card);});
async function updateOfferDecision(job,decision){try{const next={...structuredClone(job),offerDecision:decision};if(decision==='rejected'){enterStage(next,'closed');next.closedReason='offer_rejected';if(!next.closedAt)next.closedAt=todayLocal();}await persist(next);notify(decision==='signed'?'已标记签约':decision==='rejected'?'已拒绝 Offer':'已恢复为待决定');if(decision==='signed'){const card=[...document.querySelectorAll('.job-card')].find(node=>node.dataset.job===job.id);celebrateOffer(card);}}catch(err){render();notify(err.message);}}
$('board').addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const target=e.target;if(target.matches('[data-card-link][data-url]:not([data-url=""])')){e.preventDefault();openCardUrl(target);}else if(target.matches('[data-job][data-url]:not([data-url=""])')){e.preventDefault();openCardUrl(target);}});
let pointerDrag=null;
let dragScrollFrame=0;
function scrollWhileDragging(){
  const drag=pointerDrag;if(!drag?.moved)return;
  const board=$('board'),rect=board.getBoundingClientRect(),right=Math.min(rect.right,innerWidth),left=Math.max(rect.left,0);
  if(drag.lastY>=rect.top&&drag.lastY<=rect.bottom){
    if(drag.lastX>right-40)board.scrollLeft+=12;
    else if(drag.lastX<left+40)board.scrollLeft-=12;
    const column=dragColumn(drag.lastX,drag.lastY);
    document.querySelectorAll('.column.drop-target').forEach(node=>node.classList.toggle('drop-target',node===column));column?.classList.add('drop-target');
    const list=column;
    if(list){const bounds=list.getBoundingClientRect();if(drag.lastY>bounds.bottom-40)list.scrollTop+=10;else if(drag.lastY<bounds.top+40)list.scrollTop-=10;}
  }
  dragScrollFrame=requestAnimationFrame(scrollWhileDragging);
}
function dragColumn(x,y){return document.elementFromPoint(x,y)?.closest('[data-stage]')||null;}
function clearPointerDrag(){cancelAnimationFrame(dragScrollFrame);document.querySelector('.card-drag-preview')?.remove();document.querySelectorAll('.job-card.dragging,.column.drop-target').forEach(node=>node.classList.remove('dragging','drop-target'));pointerDrag=null;}
$('board').addEventListener('pointerdown',e=>{
  const card=e.target.closest('[data-job]');if(!card||e.button!==0||e.target.closest('button,a,input,select'))return;
  const handle=card;pointerDrag={id:card.dataset.job,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
  handle.setPointerCapture(e.pointerId);e.preventDefault();
});
$('board').addEventListener('pointermove',e=>{
  const drag=pointerDrag;if(!drag||drag.pointerId!==e.pointerId)return;
  drag.lastX=e.clientX;drag.lastY=e.clientY;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
  if(!drag.moved){
    const source=document.querySelector(`[data-job="${drag.id}"]`),ghost=source.cloneNode(true),rect=source.getBoundingClientRect();
    ghost.removeAttribute('data-job');ghost.removeAttribute('role');ghost.removeAttribute('tabindex');ghost.setAttribute('aria-hidden','true');ghost.classList.add('card-drag-preview');ghost.style.width=rect.width+'px';document.body.append(ghost);drag.ghost=ghost;drag.offsetX=drag.x-rect.left;drag.offsetY=drag.y-rect.top;source.classList.add('dragging');drag.moved=true;
    dragScrollFrame=requestAnimationFrame(scrollWhileDragging);
  }
  drag.ghost.style.left=(e.clientX-drag.offsetX)+'px';drag.ghost.style.top=(e.clientY-drag.offsetY)+'px';
  const target=dragColumn(e.clientX,e.clientY);
  document.querySelectorAll('.column.drop-target').forEach(node=>node.classList.toggle('drop-target',node===target));
  target?.classList.add('drop-target');
});
let pendingOutcomeId='';
async function changeStage(job,status){
  if(job.status===status)return;
  const next=structuredClone(job);let eventId='';
  if(['assessment','interview'].includes(status)){
    let event=next.events.find(e=>e.type===status&&!e.completed);
    if(!event){event=makeEvent(status);if(status==='interview')event.round=nextInterviewRound(next.events);next.events.push(event);}
    eventId=event.id;
  }
  enterStage(next,status,eventId);
  const dateName={applied:'applied',offer:'offerAt',closed:'closedAt'}[status];if(dateName&&!next[dateName])next[dateName]=todayLocal();
  try{await persist(next);notify('进度已更新');if(status==='offer'){const card=[...document.querySelectorAll('.job-card')].find(node=>node.dataset.job===job.id);requestAnimationFrame(()=>celebrateOffer(card));}}catch(err){render();notify(err.message);}
}
$('board').addEventListener('pointerup',async e=>{
  const drag=pointerDrag;if(!drag||drag.pointerId!==e.pointerId)return;
  const column=drag.moved?dragColumn(e.clientX,e.clientY):null,job=jobs.find(item=>item.id===drag.id);
  if(drag.moved)suppressCardClickUntil=Date.now()+500;clearPointerDrag();
  if(!column||!job)return;
  if(column.dataset.stage==='outcome'){pendingOutcomeId=job.id;$('outcome-dialog').showModal();return;}
  await changeStage(job,column.dataset.stage);
});
$('board').addEventListener('pointercancel',clearPointerDrag);
$('outcome-dialog').addEventListener('click',async e=>{const choice=e.target.closest('[data-outcome-choice]');if(!choice)return;const job=jobs.find(j=>j.id===pendingOutcomeId),status=choice.dataset.outcomeChoice;pendingOutcomeId='';$('outcome-dialog').close();if(job)await changeStage(job,status);});
$('outcome-cancel').addEventListener('click',()=>{$('outcome-dialog').close();pendingOutcomeId='';});
$('outcome-dialog').addEventListener('close',()=>{pendingOutcomeId='';});
$('agenda-list').addEventListener('click',async e=>{const b=e.target.closest('[data-event-edit]');if(b){openEditor(jobs.find(j=>j.id===b.dataset.eventEdit));return;}const result=e.target.closest('[data-interview-result]');if(!result)return;result.disabled=true;try{const job=structuredClone(jobs.find(j=>j.id===result.dataset.job)),event=job.events.find(ev=>ev.id===result.dataset.interviewResult);event.result=event.completed?'waiting':'passed';event.completed=event.result==='passed';await persist(job);notify(event.completed?'面试已标记通过':'已恢复为等待中');}catch(err){render();notify(err.message);}});
$('agenda-list').addEventListener('change',async e=>{const input=e.target.closest('[data-complete]');if(!input)return;input.disabled=true;try{const job=structuredClone(jobs.find(j=>j.id===input.dataset.job));job.events.find(ev=>ev.id===input.dataset.complete).completed=input.checked;await persist(job);notify('安排已更新');}catch(err){render();notify(err.message);}});
$('job-form').addEventListener('submit',submitJob);
document.querySelectorAll('.close-editor').forEach(b=>b.addEventListener('click',closeEditor));
$('job-dialog').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
function nextInterviewRound(events){return Math.max(0,...events.filter(e=>e.type==='interview').map(e=>e.round||1))+1;}
function makeEvent(type){return {id:uuid(),title:{assessment:'OA / 笔试',interview:'面试',followup:'跟进'}[type]||'提醒',type,round:type==='interview'?1:0,url:'',meetingMode:'video',latitude:null,longitude:null,start:'',end:'',location:'',notes:'',result:'waiting',completed:false};}
function selectStage(stage,eventId=''){
  const events=readEventInputs();
  if(['assessment','interview'].includes(stage)&&!eventId){let event=events.find(e=>e.type===stage&&!e.completed);if(!event){event=makeEvent(stage);if(stage==='interview')event.round=nextInterviewRound(events);events.push(event);}eventId=event.id;}
  const entry=enterStage(editing,stage,eventId);selectedHistoryId=entry.id;$('status').value=stage;
  const dateName={applied:'applied',offer:'offerAt',closed:'closedAt'}[stage];if(dateName&&!$(dateName).value)$(dateName).value=todayLocal();
  if(stage!=='closed')$('closedReason').value='';
  renderEventEditor(events);updateStageLinks();
}
$('flow-add-stage').addEventListener('change',e=>{if(e.target.value)selectStage(e.target.value);});
function addStageEvent(type){
  const events=readEventInputs(),count=events.filter(e=>e.type===type).length;
  if(count>=20||(type==='interview'&&nextInterviewRound(events)>20))return notify('同类安排最多 20 项，面试最多 20 轮');
  const event=makeEvent(type);if(type==='interview')event.round=nextInterviewRound(events);events.push(event);const entry=enterStage(editing,type,event.id);selectedHistoryId=entry.id;$('status').value=type;
  renderEventEditor(events);updateStageLinks();
}
$('add-assessment').addEventListener('click',()=>addStageEvent('assessment'));
$('add-interview').addEventListener('click',()=>addStageEvent('interview'));
$('add-event').addEventListener('click',()=>{renderEventEditor([...readEventInputs(),makeEvent('followup')]);$('reminder-events').lastElementChild?.querySelector('[data-field="title"]')?.focus();});
$('event-editor').addEventListener('click',e=>{
  const remove=e.target.closest('[data-remove-history]');if(remove){removeHistory(remove.dataset.removeHistory);return;}
  const show=e.target.closest('[data-edit-history]');if(show){selectedHistoryId=selectedHistoryId===show.dataset.editHistory?'collapsed':show.dataset.editHistory;updateFlowSteps();return;}
  const current=e.target.closest('[data-current-history]');if(current){const entry=editing.flowHistory.find(item=>item.id===current.dataset.currentHistory);selectStage(entry.stage,entry.eventId);return;}
  const stageButton=e.target.closest('[data-select-stage]');if(stageButton){selectStage(stageButton.dataset.selectStage);return;}
  const removed=e.target.closest('[data-remove-event]');if(removed){const ids=editing.flowHistory.filter(entry=>entry.eventId===removed.dataset.removeEvent).map(entry=>entry.id);if(ids.length)ids.forEach(removeHistory);else renderEventEditor(readEventInputs().filter(ev=>ev.id!==removed.dataset.removeEvent));return;}
  const failed=e.target.closest('[data-interview-failed]');if(failed){askConfirm('结束这个岗位？','这轮面试未通过，岗位将移到“已结束”。',()=>{selectStage('closed');$('closedReason').value='interview_failed';if(!$('closedAt').value)$('closedAt').value=todayLocal();updateStageLinks();$('job-form').requestSubmit();},'结束岗位');return;}
  const stageDate=e.target.closest('[data-open-date-picker]');if(stageDate){const name=stageDate.dataset.openDatePicker,picker=document.querySelector(`[data-date-native="${name}"]`);picker.value=$(name).value;openNativePicker(picker);return;}
  const dateButton=e.target.closest('[data-open-event-picker]');if(dateButton){const control=dateButton.closest('.event-time-control'),picker=control.querySelector('.event-native-picker'),typed=localTimeValue(control.querySelector('[data-field]').value);if(validLocalTime(typed))picker.value=typed;openNativePicker(picker);return;}
  const pick=e.target.closest('[data-pick-map]');if(pick)openMapPicker(pick.closest('.event-block'));
});
$('event-editor').addEventListener('change',e=>{
  if(e.target.matches('[data-history-date]')){const entry=editing.flowHistory.find(item=>item.id===e.target.dataset.historyDate);if(entry){entry.date=e.target.value.trim();const field={saved:'createdAt',applied:'applied',offer:'offerAt',closed:'closedAt'}[entry.stage];if(field&&editing.flowHistory.filter(item=>item.stage===entry.stage).at(-1)===entry)$(field).value=entry.date;}return;}
  if(e.target.matches('[data-date-native]')){$(e.target.dataset.dateNative).value=e.target.value;return;}
  if(e.target.matches('#createdAt,#applied,#offerAt,#closedAt')){document.querySelector(`[data-date-native="${e.target.id}"]`).value=e.target.value;return;}
  const block=e.target.closest('.event-block');if(!block)return;
  if(e.target.matches('.event-native-picker')){const control=e.target.closest('.event-time-control'),input=control.querySelector('[data-field]');input.value=displayLocalTime(e.target.value);input.dispatchEvent(new Event('change',{bubbles:true}));return;}
  if(e.target.matches('[data-field="start"],[data-field="end"]')){
    const normalized=localTimeValue(e.target.value),native=e.target.closest('.event-time-control').querySelector('.event-native-picker');native.value=validLocalTime(normalized)?normalized:'';
    if(e.target.dataset.field==='start'&&native.value){const end=block.querySelector('[data-field="end"]');if(!end.value.trim()){const endValue=localTime(new Date(new Date(normalized).getTime()+3600000));end.value=displayLocalTime(endValue);end.closest('.event-time-control').querySelector('.event-native-picker').value=endValue;}}
    return;
  }
  if(e.target.matches('[data-field="type"]')){renderEventEditor(readEventInputs());return;}
  const interview=block.querySelector('[data-field="type"]').value==='interview';if(!interview)return;
  const onsite=block.querySelector('[data-field="meetingMode"]').value==='onsite',result=block.querySelector('[data-field="result"]').value;
  block.querySelector('.event-link').classList.toggle('hidden',onsite);block.querySelector('.event-map').classList.toggle('hidden',!onsite);
  block.querySelector('.event-failed').classList.toggle('hidden',result==='passed'||$('status').value!=='interview');
  block.querySelector('.event-location').firstChild.textContent=onsite?'线下地点':'地点';
});
$('delete-job').addEventListener('click',()=>askConfirm('删除这个岗位？',`${editing.company} · ${editing.role||'TBD'} 的记录及相关安排将被删除。外部日历中的事件需要另外删除。`,async()=>{try{editorBusy(true);await api('/api/jobs','DELETE',{id:editing.id,revision:editing.revision});jobs=jobs.filter(j=>j.id!==editing.id);render();$('job-dialog').close();notify('岗位已删除');}catch(e){setError('form-error',e.message);}finally{editorBusy(false);}},'删除岗位'));
$('confirm-cancel').addEventListener('click',()=>$('confirm-dialog').close());
$('confirm-ok').addEventListener('click',()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();if(action)action();});
$('calendar-help').addEventListener('click',()=>$('calendar-dialog').showModal());
$('close-calendar').addEventListener('click',()=>$('calendar-dialog').close());
$('go-agenda').addEventListener('click',()=>{$('calendar-dialog').close();switchTab('agenda',true);});
$('download-ics').addEventListener('click',e=>{if(!allEvents().some(x=>!x.event.completed)){e.preventDefault();notify('先为岗位添加一项安排，再导出日历');}});
$('backup').addEventListener('click',()=>{if(!loaded)return notify('请先加载记录');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({jobs},null,2)],{type:'application/json'}));a.download='offer-desk-backup.json';a.click();});
$('login-dialog').addEventListener('cancel',e=>e.preventDefault());
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;setError('login-error','');try{await api('/api/login','POST',{password:$('password').value});$('password').value='';$('login-dialog').close();document.body.classList.remove('login-mode');await load();}catch(err){setError('login-error',err.message);}finally{button.disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await api('/api/logout','POST',{});jobs=[];loaded=false;render();showLogin();}catch(e){notify(e.message);}});
$('timezone-note').textContent='按当前设备时区显示：'+zone;
$('event-timezone').textContent='时间按 '+zone+' 输入；日历导出会保留对应的实际时刻。';
window.addEventListener('beforeunload',e=>{if($('job-dialog').open&&formSnapshot()!==initialForm){e.preventDefault();e.returnValue='';}});
render();
(async()=>{try{const session=await api('/api/session');$('app-version').textContent='v'+session.version;$('logout').classList.toggle('hidden',!session.passwordProtected);if(session.authenticated)await load();else showLogin();}catch(e){setError('load-error','暂时无法连接服务器，请确认服务已启动并刷新页面。');}})();

$("latex-link").href="../offerdesk.html#screenshots";$("latex-link").textContent="PDF 编辑界面展示 ↗";
function openMapPicker(){notify("静态演示不提供地图服务，可手动填写地点。");}

function resumeEditorUrl(id) {
  const url=new URL(location.href);url.port='8766';url.pathname='/';url.search='';url.hash='';
  if(id)url.searchParams.set('doc',id);return url.href;
}
function renderResumeOptions(selected) {
  $('resumeDocId').innerHTML='<option value="">不关联文档</option>'+resumes.map(d=>`<option value="${escape(d.id)}">${escape(d.title)} · ${escape(new Date(d.updated).toLocaleString('zh-CN'))}</option>`).join('');
  if(selected&&!resumes.some(d=>d.id===selected)){
    const option=document.createElement('option');option.value=selected;option.textContent='已关联文档（等待刷新确认）';$('resumeDocId').append(option);
  }
  $('resumeDocId').value=selected;updateResumeActions();
}
function updateResumeActions() {
  const id=$('resumeDocId').value, doc=resumes.find(d=>d.id===id);
  $('resume-edit').classList.toggle('hidden',!id);$('resume-edit').href=resumeEditorUrl(id);
  $('resume-pdf').classList.toggle('hidden',!doc?.pdfReady);
  $('resume-hint').textContent='静态演示不连接简历库；PDF 编辑入口可查看原应用界面，LaTeX 编译需要后端。';
}
async function refreshResumes() {
  const request=++resumeRequest;$('resume-refresh').disabled=true;
  try{const result=await api('/api/resumes');if(request!==resumeRequest)return;resumes=result.docs;renderResumeOptions($('resumeDocId').value);}
  catch(e){if(request===resumeRequest)$('resume-hint').textContent=e.message;}
  finally{if(request===resumeRequest)$('resume-refresh').disabled=false;}
}
function openIncomingResume() {
  if(incomingResumeHandled)return;incomingResumeHandled=true;
  const id=new URL(location.href).searchParams.get('resume');if(!id)return;
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return notify('简历链接无效');
  openEditor();editing.resumeDocId=id;renderResumeOptions(id);initialForm=formSnapshot();
  const url=new URL(location.href);url.searchParams.delete('resume');history.replaceState(null,'',url);
}
$('resumeDocId').addEventListener('change',updateResumeActions);
$('resume-refresh').addEventListener('click',refreshResumes);
$('resume-pdf').addEventListener('click',async()=>{
  const id=$('resumeDocId').value;$('resume-pdf').disabled=true;
  try{
    const response=await fetch('/api/resumes/'+encodeURIComponent(id)+'/pdf');
    if(!response.ok){const body=await response.json();throw new Error(body.error||'下载失败');}
    const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    const doc=resumes.find(d=>d.id===id),version=response.headers.get('X-Document-Revision');
    a.href=url;a.download=(doc?.title||'resume').replace(/[\\/:*?"<>|]/g,'_')+'-v'+version+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch(e){notify(e.message);await refreshResumes();}finally{$('resume-pdf').disabled=false;}
});

function updateJobUrl(){const url=safeJobUrl($('url').value);$('job-url-open').classList.toggle('hidden',!url);if(url)$('job-url-open').href=url;else $('job-url-open').removeAttribute('href');}
function updateStageLinks(){
  const stage=$('status').value;
  if(stage==='offer'&&$('offerDecision').value==='rejected')$('offerDecision').value='pending';
  for(const card of $('event-editor').querySelectorAll('[data-flow-stage]')){const active=card.dataset.flowStage===stage;card.classList.toggle('is-current',active);const button=card.querySelector('[data-select-stage]');button.textContent=active?'当前步骤':'设为当前';button.disabled=active;}
  $('offer-decision-status').textContent=$('offerDecision').value==='signed'?'已签约':'待决定';$('offer-sign').textContent=$('offerDecision').value==='signed'?'恢复待决定':'标记已签约';$('offer-sign').disabled=stage!=='offer';$('offer-reject').disabled=stage!=='offer';
  for(const button of $('event-editor').querySelectorAll('.event-failed')){const block=button.closest('.event-block');button.classList.toggle('hidden',stage!=='interview'||block.querySelector('[data-field="result"]').value==='passed');}
  updateJobUrl();
  updateFlowSteps();
}
$('url').addEventListener('input',updateJobUrl);
$('offer-sign').addEventListener('click',()=>{if($('status').value!=='offer'||busy)return;$('offerDecision').value=$('offerDecision').value==='signed'?'pending':'signed';updateStageLinks();$('job-form').requestSubmit();});
$('offer-reject').addEventListener('click',()=>{if($('status').value!=='offer'||busy)return;askConfirm('拒绝这个 Offer？','岗位将移到“已结束”，Offer 链接和 PDF 会保留在详情中。',()=>{selectStage('closed');$('closedReason').value='offer_rejected';$('offerDecision').value='rejected';if(!$('closedAt').value)$('closedAt').value=todayLocal();updateStageLinks();$('job-form').requestSubmit();},'拒绝 Offer');});
function updateOfferPdfControls(name){const id=$('offerPdfId').value;$('offer-pdf-name').textContent=id?name||'已关联 Offer PDF':'';$('offer-pdf-open').classList.toggle('hidden',!id);$('offer-pdf-remove').classList.toggle('hidden',!id);if(id)$('offer-pdf-open').href='/api/offer-files/'+encodeURIComponent(id)+'/pdf';else $('offer-pdf-open').removeAttribute('href');}
$('offer-pdf-upload').addEventListener('click',()=>{if(!busy)$('offer-pdf-file').click();});
$('offer-pdf-remove').addEventListener('click',()=>{$('offerPdfId').value='';editing.offerPdfName='';updateOfferPdfControls('');});
$('offer-pdf-file').addEventListener('change',async()=>{
  const file=$('offer-pdf-file').files[0];$('offer-pdf-file').value='';if(!file||busy)return;
  if(file.size>5*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))return setError('form-error','请选择不超过 5 MB 的 Offer PDF。');
  editorBusy(true);$('offer-pdf-upload').disabled=true;setError('form-error','');
  try{const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('无法读取 PDF'));reader.readAsDataURL(file);});const result=await api('/api/offer-files','POST',{name:file.name,base64:encoded});$('offerPdfId').value=result.file.id;editing.offerPdfName=result.file.name;updateOfferPdfControls(result.file.name);notify('Offer PDF 已保存，请保存岗位以关联。');}
  catch(e){setError('form-error',e.message);}finally{editorBusy(false);$('offer-pdf-upload').disabled=false;}
});
window.addEventListener('focus',()=>{if(loaded&&!busy&&!$('job-dialog').open)load();});
function renderPdfOptions(selected){
  $('resumeFileId').innerHTML='<option value="">静态演示不关联 PDF</option>';
  if(selected&&!uploadedPdfs.some(f=>f.id===selected)){const option=document.createElement('option');option.value=selected;option.textContent='已关联 PDF（等待刷新确认）';$('resumeFileId').append(option);}
  $('resumeFileId').value=selected;updatePdfActions();
}
function updatePdfActions(){
  const id=$('resumeFileId').value,file=uploadedPdfs.find(f=>f.id===id);
  $('pdf-library-download').classList.toggle('hidden',!id);
  if(id)$('pdf-library-download').href='/api/resume-files/'+encodeURIComponent(id)+'/pdf';
  $('pdf-library-hint').textContent='文件上传与文档存储需要后端；静态演示不会上传文件。';
}
async function refreshPdfLibrary(){
  const request=++pdfRequest;$('pdf-refresh').disabled=true;
  try{const result=await api('/api/resume-files');if(request!==pdfRequest)return;uploadedPdfs=result.files;renderPdfOptions($('resumeFileId').value);}
  catch(e){if(request===pdfRequest)$('pdf-library-hint').textContent=e.message;}
  finally{if(request===pdfRequest)$('pdf-refresh').disabled=false;}
}
$('resumeFileId').addEventListener('change',updatePdfActions);
$('pdf-refresh').addEventListener('click',refreshPdfLibrary);
$('pdf-upload').addEventListener('click',()=>{if(!busy)$('pdf-file').click();});
$('pdf-file').addEventListener('change',async()=>{
  const file=$('pdf-file').files[0];$('pdf-file').value='';if(!file||busy)return;
  if(file.size>5*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))return setError('form-error','请选择不超过 5 MB 的 PDF 文件。');
  editorBusy(true);$('pdf-upload').disabled=true;setError('form-error','');$('pdf-library-hint').textContent='正在上传 PDF 到 OPi…';
  try{
    const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('无法读取 PDF'));reader.readAsDataURL(file);});
    const result=await api('/api/resume-files','POST',{name:file.name,base64:encoded});
    pdfRequest++;$('pdf-refresh').disabled=false;uploadedPdfs=uploadedPdfs.filter(f=>f.id!==result.file.id);uploadedPdfs.unshift(result.file);renderPdfOptions(result.file.id);
    notify(result.reused?'已复用库中相同的 PDF，请保存岗位。':'PDF 已入库，请保存岗位以关联。');
  }catch(e){setError('form-error',e.message);$('pdf-library-hint').textContent='上传未完成，请重试。';}
  finally{editorBusy(false);$('pdf-upload').disabled=false;}
});

$('reset-demo').onclick=()=>{askConfirm('重置示例？','这会恢复虚构示例并清除本浏览器内的演示修改。',()=>{localStorage.removeItem('portfolio-offerdesk-demo-v1');location.reload();},'重置');};
$('download-ics').addEventListener('click',e=>{e.preventDefault();const entries=allEvents().filter(x=>!x.event.completed);if(!entries.length)return;const stamp=v=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const clean=v=>String(v).replace(/[\r\n]/g,' ').replace(/[,;\\]/g,' ');const data=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//OfferDesk//Static Demo//EN',...entries.flatMap(({job,event})=>['BEGIN:VEVENT','UID:'+event.id+'@offerdesk-demo','DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(event.start),'DTEND:'+stamp(event.end),'SUMMARY:'+clean(job.company+' '+event.title),'END:VEVENT']),'END:VCALENDAR'].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'text/calendar'}));a.download='offer-desk-demo.ics';a.click();});
