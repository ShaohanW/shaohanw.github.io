'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;return [...b].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join('');};
let records=[],kind='material',active=null,items=[],baseline='',busy=false;
const key=r=>r.id+':'+r.revision;
function message(s='',error=false){$('message').textContent=s;$('message').className=error?'error':'';}
async function api(path,data){return paperApi(path,data?'POST':'GET',data);}
function input(id,label,value='',area=false){return `<label>${esc(label)}<${area?'textarea':'input'} id="${id}" ${area?'':'value="'+esc(value)+'"'}>${area?esc(value):''}${area?'</textarea>':''}</label>`;}
function choices(type,selected){return records.filter(r=>r.kind===type).map(r=>`<option value="${key(r)}" ${selected===key(r)?'selected':''}>${esc(r.title)} · v${r.revision}</option>`).join('');}
function ref(value){const [id,revision]=value.split(':');return {id,revision:Number(revision)};}
function list(){const select=$('records');select.innerHTML=records.filter(r=>r.kind===kind).map(r=>`<option value="${key(r)}">${esc(r.title)} · v${r.revision}</option>`).join('');if(active)select.value=key(active);else select.selectedIndex=-1;}
function payload(){
 if(kind==='material'){const p={type:$('type').value};for(const k of ['title','organization','qualification','location','dates','gpa','courses','bullets','latex'])p[k]=$('f-'+k).value;return p;}
 if(kind==='template')return {body:$('body').value,item:$('item').value,section:$('section').value};
 return {name:$('name').value,contact:$('contact').value,template:ref($('template').value),items};
}
function state(){return JSON.stringify({title:$('title').value,payload:payload()});}
function dirty(){return baseline&&state()!==baseline;}
function allowSwitch(){return !dirty()||confirm('此处有尚未保存的修改，放弃这些修改并切换？');}
function editor(record=null){
 active=record;$('title').value=record?.title||'';$('version').textContent=record?'v'+record.revision+' · '+new Date(record.created).toLocaleString():'新建';$('saved').textContent='';$('source-panel').hidden=true;$('generated').hidden=true;
 const p=record?.payload||{};
 if(kind==='material'){
  $('fields').innerHTML='<label>类别<select id="type">'+[['education','教育经历'],['work','工作经历'],['project','项目经历'],['skills','技能'],['free','自由 LaTeX']].map(([k,t])=>`<option value="${k}">${t}</option>`).join('')+'</select></label><div class="grid">'+[['title','学校 / 项目 / 职位标题'],['organization','单位 / 院系'],['qualification','学位 / 专业 / 职务'],['location','地点'],['dates','起止时间'],['gpa','GPA（可选）']].map(([k,t])=>input('f-'+k,t,p[k]||'')).join('')+'</div>'+input('f-courses','课程（可选）',p.courses||'')+input('f-bullets','经历描述，每行一条',p.bullets||'',true)+'<details><summary>自由 LaTeX（仅“自由 LaTeX”类别使用）</summary>'+input('f-latex','源码',p.latex||'',true)+'</details><p class="muted">普通字段按文本处理，自动转义 LaTeX 特殊字符。自由 LaTeX 保留原样。</p>';
  $('type').value=p.type||'education';
 }else if(kind==='template'){
  const defaults=records.find(r=>r.kind==='template')?.payload||{};
  $('fields').innerHTML='<p class="muted">完整 LaTeX 模板，可修改字体、间距和布局。仅占位符会被替换。</p>'+input('body','整页模板：{{name}}、{{contact}}、{{sections}}',p.body??defaults.body??'',true)+input('section','分节模板：{{heading}}',p.section??defaults.section??'',true)+input('item','条目模板：{{title}}、{{dates}}、{{organization}}、{{qualification}}、{{location}}、{{gpa}}、{{courses}}、{{bullets}}',p.item??defaults.item??'',true);
  for(const id of ['body','section','item'])$(id).classList.add('code');
 }else{
  items=structuredClone(p.items||[]);
  $('fields').innerHTML='<div class="grid">'+input('name','姓名',p.name||'')+input('contact','联系方式（纯文本）',p.contact||'')+'</div><label>固定模板版本<select id="template">'+choices('template',p.template?key(p.template):null)+'</select></label><div class="row"><label class="grow">添加素材（固定版本）<select id="material-choice">'+choices('material')+'</select></label><button id="add">＋ 添加</button></div><div id="items"></div><p class="muted">按列表顺序排版；相邻且分节标题相同的条目合为一节。更改素材版本或模板版本后，保存新的组合版本再生成；不会修改已有简历。</p>';
  $('add').onclick=()=>{const value=$('material-choice').value;if(!value)return;items.push({...ref(value),showGpa:true,showCourses:true,heading:''});renderItems();};renderItems();
 }
 $('preview').hidden=$('generate').hidden=kind!=='composition';baseline=state();list();
}
function renderItems(){
 $('items').replaceChildren();
 items.forEach((v,index)=>{
  const r=records.find(r=>r.kind==='material'&&key(r)===key(v)),el=document.createElement('section');el.className='item';
  el.innerHTML=`<div class="item-head"><strong data-user-content>${esc(r?.title||'未找到素材')}</strong><button data-action="up" ${index===0?'disabled':''} aria-label="上移">↑</button><button data-action="down" ${index===items.length-1?'disabled':''} aria-label="下移">↓</button><button data-action="remove">移除</button></div><label>素材版本<select data-field="version">${choices('material',key(v))}</select></label><label>分节标题（留空按类别）<input data-field="heading" value="${esc(v.heading)}"></label><div class="checks"><label><input type="checkbox" data-field="showGpa" ${v.showGpa!==false?'checked':''}> 显示 GPA</label><label><input type="checkbox" data-field="showCourses" ${v.showCourses!==false?'checked':''}> 显示课程</label></div><label><input type="checkbox" data-field="custom" ${Object.hasOwn(v,'override')?'checked':''}> 为此简历单独改写描述</label><textarea aria-label="此简历专用描述" data-field="override" ${Object.hasOwn(v,'override')?'':'hidden'}>${esc(v.override??r?.payload.bullets??'')}</textarea>`;
  el.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.action;if(action==='remove')items.splice(index,1);else{const to=index+(action==='up'?-1:1);[items[index],items[to]]=[items[to],items[index]];}renderItems();});
  el.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('input',()=>{const k=input.dataset.field;if(k==='version'){Object.assign(v,ref(input.value));renderItems();}else if(k==='custom'){const area=el.querySelector('[data-field=override]');area.hidden=!input.checked;if(input.checked)v.override=area.value;else delete v.override;}else v[k]=input.type==='checkbox'?input.checked:input.value;}));$('items').append(el);
 });
}
async function save(copy=false){
 const data={kind,id:copy||!active?uid():active.id,revision:copy||!active?0:active.revision,title:$('title').value,payload:payload()};
 const result=await api('/api/modules/save',data);records.unshift(result.record);editor(result.record);$('saved').textContent='已保存 v'+result.record.revision+'。已有引用保持原版本。';return result.record;
}
async function work(fn){if(busy)return;busy=true;message();$('workspace').inert=true;try{await fn();}catch(e){message(e.message,true);}finally{busy=false;$('workspace').inert=false;}}
$('save').onclick=()=>work(()=>save());$('copy').onclick=()=>work(()=>save(true));
$('new').onclick=()=>{if(allowSwitch())editor();};
$('records').onchange=()=>{if(allowSwitch())editor(records.find(r=>r.kind===kind&&key(r)===$('records').value));else list();};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{if(!allowSwitch())return;kind=b.dataset.tab;for(const tab of document.querySelectorAll('[data-tab]'))tab.classList.toggle('active',tab===b);editor();};
$('preview').onclick=()=>work(async()=>{const record=dirty()||!active?await save():active;const result=await api('/api/modules/preview',{id:record.id,revision:record.revision});$('source').value=result.source;$('source-panel').hidden=false;$('source-panel').open=true;});
$('generate').onclick=()=>work(async()=>{const record=dirty()||!active?await save():active;const result=await api('/api/modules/generate',{id:record.id,revision:record.revision});$('generated').hidden=false;$('open-generated').href='./?doc='+result.doc.id;$('saved').textContent='组合已固定为 v'+record.revision+'；生成了独立文档。';});
async function load(){const data=await api('/api/modules');records=data.records;$('login').hidden=true;$('workspace').hidden=false;document.querySelector('[data-tab='+kind+']').classList.add('active');editor();}
$('login').onsubmit=e=>{e.preventDefault();work(async()=>{await api('/api/login',{password:$('password').value});$('password').value='';await load();});};
window.addEventListener('beforeunload',e=>{if(!$('workspace').hidden&&dirty()){e.preventDefault();e.returnValue='';}});
load().catch(e=>message(e.message,true));

document.querySelectorAll("a[href^='/api/']").forEach(a=>a.onclick=e=>{e.preventDefault();backendRequired("素材库备份");});