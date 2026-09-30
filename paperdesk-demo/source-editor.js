'use strict';
(() => {
  const source=document.getElementById('source'),ink=document.getElementById('source-ink'),lines=document.getElementById('source-lines');
  if(!source||!ink||!lines)return;
  const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function highlight(text){
    const tokens=/\\(?:[a-zA-Z@]+\*?|[^\r\n])|%[^\r\n]*|[{}\[\]$&#_^]/g;
    let html='',last=0;
    for(const m of text.matchAll(tokens)){
      const kind=m[0][0]==='%'?'comment':m[0][0]==='\\'?'command':'delimiter';
      html+=escape(text.slice(last,m.index))+'<span class="tex-'+kind+'">'+escape(m[0])+'</span>';last=m.index+m[0].length;
    }
    return html+escape(text.slice(last))+'\n';
  }
  function sync(){ink.scrollTop=source.scrollTop;ink.scrollLeft=source.scrollLeft;lines.scrollTop=source.scrollTop;}
  let previous=null;
  function render(){
    if(previous!==source.value){
      previous=source.value;ink.innerHTML=highlight(previous);
      lines.textContent=Array.from({length:previous.split('\n').length},(_,i)=>i+1).join('\n')+'\n';
    }
    sync();
  }
  source.addEventListener('input',render);source.addEventListener('scroll',sync,{passive:true});
  source.addEventListener('compositionstart',()=>source.parentElement.classList.add('composing'));
  source.addEventListener('compositionend',()=>{source.parentElement.classList.remove('composing');render();});
  window.PaperSyntax={render};render();source.parentElement.classList.add('syntax-ready');
  window.PaperView=view=>{document.body.dataset.mobileView=view;for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));};
  for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>window.PaperView(button.dataset.view));
})();
