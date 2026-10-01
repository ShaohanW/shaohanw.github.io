'use strict';
(() => {
  const catalog = window.SudowMessages;
  const keys = Object.keys(catalog).sort((a,b)=>b.length-a.length);
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern = new RegExp(keys.map(escapeRegex).join('|'),'g');
  const cookie = document.cookie.split('; ').find(v=>v.startsWith('sudow_language='));
  let language = cookie?.split('=')[1]==='en'?'en':'zh-CN';
  const originals = new WeakMap();
  const protectedSelector = '[data-user-content],script,style,pre,textarea,canvas,.company-name,.card-role,.card-map-zone strong,.agenda-info h3,.agenda-info p:not(:has(.status-label)),.doc-item strong,#history-document option,#history-selected-info,#trash-confirm-name,.trash-item strong,#records option,#material-choice option,#items .item-head strong,#ai-job option,#ai-resume option:not([value=""]),#resumeDocId option:not([value=""]),#resumeFileId option:not([value=""]),#offer-pdf-name,#map-area-select option,#map-state option,#map-search-results,#history-diff,#history-result-diff,#log';
  function translate(value) { return language==='en'?String(value).replace(pattern,key=>catalog[key]).replace(/\b1 lines\b/g,'1 line'):String(value); }
  function blocked(element) { return !element || Boolean(element.closest(protectedSelector)); }
  function label(value,element){
    const card=element?.closest('.job-card'),row=element?.closest('.ai-task-row');
    const names=[...(card?.querySelectorAll('.company-name,.card-role')||[]),...(row?.querySelectorAll('[data-user-content]')||[])].map(el=>el.textContent.replace(/ ↗$/,'')).filter(Boolean).sort((a,b)=>b.length-a.length);
    names.forEach((name,index)=>{value=value.split(name).join('\uE000'+index+'\uE001');});
    value=translate(value);names.forEach((name,index)=>{value=value.split('\uE000'+index+'\uE001').join(name);});return value;
  }
  function remember(node,key,value,element) {
    const entries=originals.get(node)||{};
    let record=entries[key];
    if(!record || value!==record.output) record={original:value,output:value};
    record.output=element?label(record.original,element):translate(record.original);entries[key]=record;originals.set(node,entries);return record.output;
  }
  function text(node) {
    if(blocked(node.parentElement)||!node.nodeValue?.trim())return;
    const value=remember(node,'text',node.nodeValue);if(value!==node.nodeValue)node.nodeValue=value;
  }
  function attributes(element) {
    if(element.tagName==='OPTION'&&element.hasAttribute('data-ui-name')){const value=translate(element.dataset.uiPrefix||'')+element.dataset.uiName+translate(element.dataset.uiSuffix||'');if(value!==element.textContent)element.textContent=value;return;}
    if(blocked(element)&&element.tagName!=='TEXTAREA')return;
    for(const name of ['title','aria-label','placeholder','alt'])if(element.hasAttribute(name)){
      const old=element.getAttribute(name),value=remember(element,name,old,element);if(old!==value)element.setAttribute(name,value);
    }
  }
  function visit(root) {
    if(root.nodeType===Node.TEXT_NODE){text(root);return;}
    if(root.nodeType!==Node.ELEMENT_NODE)return;
    if(blocked(root)){if(root.tagName==='TEXTAREA'||root.hasAttribute('data-ui-name'))attributes(root);return;}
    attributes(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode(node){if(node.nodeType===Node.ELEMENT_NODE&&blocked(node)){if(node.tagName==='TEXTAREA'||node.hasAttribute('data-ui-name'))attributes(node);return NodeFilter.FILTER_REJECT;}return NodeFilter.FILTER_ACCEPT;}});
    while(walker.nextNode()){const node=walker.currentNode;if(node.nodeType===Node.TEXT_NODE)text(node);else attributes(node);}
  }
  let observer;
  function listen(){observer.observe(document.documentElement,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['title','aria-label','placeholder','alt','open']});}
  function placeSwitcher(){
    const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
    let target=host;
    if(dialog){
      target=dialog.querySelector('.dialog-language-slot');
      if(!target){
        // Dedicated row keeps the title and original close button in place.
        const row=document.createElement('div');row.className='dialog-preferences';
        target=document.createElement('div');target.className='dialog-language-slot';row.append(target);
        const header=dialog.querySelector('.modal-header,.history-heading');
        if(header)header.after(row);
        else{
          row.classList.add('standalone-preferences');
          const body=dialog.querySelector('.modal-body')||dialog.querySelector('form')||dialog;
          body.prepend(row);
        }
      }
    }
    if(target&&switcher.parentElement!==target)target.append(switcher);
  }
  function refresh(root=document.documentElement){observer?.disconnect();placeSwitcher();visit(root);document.documentElement.lang=language;document.title=remember(document.head,'pageTitle',document.title);listen();}
  observer=new MutationObserver(records=>{
    observer.disconnect();
    placeSwitcher();
    for(const record of records){if(record.type==='childList')for(const node of record.addedNodes)visit(node);else visit(record.target);if(record.type==='characterData')text(record.target);}
    listen();
  });
  const switcher=document.createElement('select');switcher.id='language-switch';switcher.className='language-switch';switcher.setAttribute('aria-label','界面语言');switcher.innerHTML='<option value="zh-CN">中文</option><option value="en">English</option>';switcher.value=language;
  switcher.addEventListener('change',()=>{language=switcher.value;document.cookie='sudow_language='+language+'; Path=/; Max-Age=31536000; SameSite=Lax';refresh();window.dispatchEvent(new CustomEvent('sudow-language-change',{detail:{language}}));});
  const host=document.querySelector('.top-right')||document.querySelector('body>header');host?.append(switcher);
  const originalConfirm=window.confirm.bind(window),originalAlert=window.alert.bind(window);
  window.confirm=value=>originalConfirm(translate(value));window.alert=value=>originalAlert(translate(value));
  window.SudowI18n={translate,refresh,get language(){return language;},get locale(){return language==='en'?'en-US':'zh-CN';}};
  refresh();
})();
