// The supplied settings document is served byte-for-byte. Connection glue lives here.
function mountOriginalSettings(engineFrame, container) {
  const frame=document.createElement('iframe');
  frame.id='reference-player';frame.title='CloudPC Settings';
  frame.allow='autoplay; fullscreen; gamepad';frame.src='/native/settings-original.html';
  container.append(frame);engineFrame.setAttribute('aria-hidden','true');
  let controller=null,observer=null,timer=null,disposed=false,dragging=false,bridge=null,stream=null,channel=null;
  const removers=[];
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);removers.push(()=>target.removeEventListener(type,fn,options));}
  frame.onload=()=>{
    if(disposed)return;
    const doc=frame.contentDocument,win=frame.contentWindow;
    const video=doc.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;
    video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000';
    doc.getElementById('viewport').prepend(video);
    const lock=doc.getElementById('mouse-lock');
    const menuOpen=()=>dragging||doc.getElementById('backdrop').classList.contains('active');
    const syncMenu=()=>{controller?.release();bridge?.menu(menuOpen());};
    controller=new CloudMouseController(video,{
      enabled:()=>!!bridge?.allowed()&&!menuOpen(),geometry:()=>bridge?.geometry(),
      clickOnly:()=>!!bridge?.selfHost()&&!!bridge?.local(),
      sendButtonPackets:false,onButtonsChanged:mask=>bridge?.buttons(mask),
      onModeChange:mode=>{lock.checked=mode==='gaming';video.style.setProperty('cursor',mode==='gaming'?'none':'default','important');}
    });
    observer=new win.MutationObserver(syncMenu);
    observer.observe(doc.getElementById('backdrop'),{attributes:true,attributeFilter:['class']});
    listen(doc.getElementById('edge-handle'),'pointerdown',()=>{dragging=true;syncMenu();});
    listen(win,'pointerup',()=>{dragging=false;syncMenu();});
    listen(win,'pointercancel',()=>{dragging=false;syncMenu();});
    const quality=()=>{
      const grids=doc.querySelectorAll('.pill-grid');
      const resolution=grids[0].querySelector('.active')?.textContent.trim();
      const fps=parseInt(grids[1].querySelector('.active')?.textContent,10)||120;
      bridge?.quality(Number(doc.getElementById('bitrate').value),resolution==='4K'?'4k60':resolution==='2K'?'2k60':'1080p120',fps);
    };
    listen(doc.getElementById('bitrate'),'input',quality);
    for(const grid of doc.querySelectorAll('.pill-grid'))listen(grid,'click',quality);
    listen(lock,'change',async()=>{
      if(lock.checked&&bridge?.selfHost()){lock.checked=false;return;}
      if(lock.checked)win.closeSettings();
      bridge?.menu(false);
      try{await controller.setMode(lock.checked?'gaming':'desktop');}catch{lock.checked=false;}
    });
    listen(video,'click',()=>{if(lock.checked)controller.setMode('gaming').catch(()=>{lock.checked=false;});});
    listen(doc.querySelector('.action-btn'),'click',()=>bridge?.exit());
    listen(doc,'keydown',e=>{
      if(!bridge?.allowed()||menuOpen()||doc.activeElement!==video&&doc.pointerLockElement!==video)return;
      const vk=keyCode(e);if(!vk)return;e.preventDefault();if(!e.repeat)bridge.key(vk,true);
    });
    listen(doc,'keyup',e=>{const vk=keyCode(e);if(vk)bridge?.key(vk,false);});
    listen(win,'blur',()=>bridge?.release());
    listen(doc,'visibilitychange',()=>{if(doc.hidden)bridge?.release();});
    // Opening the original menu uses its own animation and original handlers.
    win.openSettings();
    timer=setInterval(()=>{
      const next=engineFrame.contentWindow?.PCCloudBridge;
      if(!next)return;
      if(bridge!==next){bridge=next;syncMenu();}
      const media=bridge.video();
      if(media&&media!==stream){stream=media;video.srcObject=media;video.play().catch(()=>{});}
      const dc=bridge.channel();if(dc!==channel){channel=dc;controller.setChannel(dc);}
    },100);
  };
  return {destroy(){disposed=true;clearInterval(timer);observer?.disconnect();controller?.destroy();bridge?.release();for(const remove of removers)remove();frame.remove();}};
}
