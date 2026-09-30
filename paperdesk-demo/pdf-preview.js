'use strict';
// Offline, same-origin PDF rendering. No browser PDF plugin or external CDN.
function createPaperPreview(prefix='pdf-'){
  let pdf=null, loading=null, renderTask=null, serial=0, drawing=0, pageNumber=1, zoom=0, library;
  const el=id=>document.getElementById(prefix+id.slice(4));
  const message=text=>{el('pdf-message').textContent=text;};
  function clear(){serial++;drawing++;renderTask?.cancel();renderTask=null;loading?.destroy().catch(()=>{});loading=null;pdf=null;el('pdf-canvas-holder').replaceChildren();message('');el('pdf-page').textContent='载入中';for(const id of ['pdf-prev','pdf-next']){el(id).hidden=true;el(id).disabled=true;}}
  async function draw(){
    if(!pdf)return;
    const active=++drawing, doc=pdf;
    renderTask?.cancel();renderTask=null;
    try{
      const page=await doc.getPage(pageNumber);if(active!==drawing)return;
      const base=page.getViewport({scale:1});
      const available=Math.max(180,el('pdf-scroll').clientWidth-28);
      const scale=zoom||available/base.width, viewport=page.getViewport({scale});
      const density=Math.min(window.devicePixelRatio||1,2,4096/viewport.width,8192/viewport.height);
      const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`PDF 第 ${pageNumber} 页，共 ${doc.numPages} 页`);canvas.setAttribute('role','img');
      canvas.width=Math.ceil(viewport.width*density);canvas.height=Math.ceil(viewport.height*density);
      canvas.style.width=Math.ceil(viewport.width)+'px';canvas.style.height=Math.ceil(viewport.height)+'px';
      el('pdf-canvas-holder').replaceChildren(canvas);
      el('pdf-page').textContent=doc.numPages===1?'共 1 页':`第 ${pageNumber} / ${doc.numPages} 页`;
      el('pdf-prev').hidden=el('pdf-next').hidden=doc.numPages===1;
      el('pdf-prev').disabled=pageNumber<=1;el('pdf-next').disabled=pageNumber>=doc.numPages;
      el('pdf-prev').title=pageNumber<=1?'已经是第一页':'上一页';el('pdf-next').title=pageNumber>=doc.numPages?'已经是最后一页':'下一页';
      el('pdf-zoom').value=String(zoom);
      message('正在绘制…');
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density!==1?[density,0,0,density,0,0]:null});
      await renderTask.promise;if(active===drawing)message('');
    }catch(e){if(active===drawing&&e.name!=='RenderingCancelledException')message('预览失败，可用下方链接打开 PDF：'+e.message);}
  }
  async function show(url){
    clear();const active=serial;pageNumber=1;zoom=0;message('正在载入 PDF…');
    try{
      library??=import('./vendor/pdfjs/pdf.min.mjs');
      const lib=await library;if(active!==serial)return;
      lib.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.min.mjs';
      loading=lib.getDocument({url,isEvalSupported:false,useWasm:false,enableXfa:false,
        cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',
        iccUrl:'./vendor/pdfjs/iccs/',wasmUrl:'./vendor/pdfjs/wasm/'});
      const loaded=await loading.promise;if(active!==serial)return;pdf=loaded;
      await draw();
    }catch(e){if(active===serial)message('PDF 预览未能载入，请用下方链接打开：'+e.message);}
  }
  el('pdf-prev').addEventListener('click',()=>{if(pdf&&pageNumber>1){pageNumber--;el('pdf-scroll').scrollTop=0;draw();}});
  el('pdf-next').addEventListener('click',()=>{if(pdf&&pageNumber<pdf.numPages){pageNumber++;el('pdf-scroll').scrollTop=0;draw();}});
  el('pdf-zoom').addEventListener('change',()=>{zoom=Number(el('pdf-zoom').value);draw();});
  let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(pdf&&!zoom)draw();},150);}).observe(el('pdf-scroll'));
  return {show,clear};
}
window.PaperPreview=createPaperPreview();
window.PaperHistoryPreview=createPaperPreview('history-pdf-');
