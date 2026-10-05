'use strict';
const mainMouse=new CloudMouseController($('#desktop-video'),{
  enabled:()=>activeSession&&!demo&&!selfHostViewOnly&&!isConfiguring()&&peer?.connectionState==='connected',
  onModeChange:mode=>{
    const gaming=mode==='gaming';$('#session').classList.toggle('cursor-locked',gaming);
    $('#capture-mouse').innerHTML=gaming?'◎ <span>Esc để về Desktop</span>':'◎ <span>Gaming 360°</span>';
    $('#main-desktop-mode')?.classList.toggle('selected',!gaming);$('#main-gaming-mode')?.classList.toggle('selected',gaming);
    if(!gaming)releaseAll();
  }
});
const modeRow=document.createElement('div');modeRow.className='settings-row';modeRow.dataset.sessionUi='';
modeRow.innerHTML='<button type="button" id="main-desktop-mode" class="button secondary selected">Desktop · Chuột local</button><button type="button" id="main-gaming-mode" class="button secondary">Gaming 360°</button>';
$('#settings-mode-hint').after(modeRow);
async function mainGaming(){
  if(selfHostViewOnly){toast('Dùng thiết bị khác để điều khiển; cùng host đang ở chế độ xem.');return;}
  if(layoutEditing)return;closeSettings();
  try{await mainMouse.setMode('gaming');}catch(error){toast('Không khóa được chuột: '+error.message);}
}
$('#capture-mouse').onclick=()=>mainMouse.mode==='gaming'?mainMouse.setMode('desktop'):mainGaming();
$('#main-desktop-mode').onclick=()=>mainMouse.setMode('desktop');$('#main-gaming-mode').onclick=mainGaming;
const originalMainSend=send;
send=function(event){
  if(event.type==='button'){mainMouse.setButton({left:0,middle:1,right:2}[event.button],event.down);return;}
  if(event.type==='move'){mainMouse.relative(event.dx,event.dy);return;}
  if(event.type==='wheel'){mainMouse.wheel(event.delta);return;}
  return originalMainSend(event);
};
const originalMainRelease=releaseAll;
releaseAll=function(){mainMouse.release();return originalMainRelease();};
const originalMainOpen=openSession;
openSession=function(...args){originalMainOpen(...args);mainMouse.setMode('desktop');$('#self-host-note').hidden=true;$('#capture-mouse').disabled=false;$('#stream-codec-stat').textContent='H264 · — Mbps';};
const originalMainSettings=openSettings;
openSettings=function(){mainMouse.setMode('desktop');return originalMainSettings();};
const originalMainDisconnect=disconnect;
disconnect=async function(...args){await mainMouse.setMode('desktop');mainMouse.setChannel(null);return originalMainDisconnect(...args);};
let mainMouseSequence=0;
setInterval(()=>{const c=mainMouse.channel;if(c?.readyState!=='open')return;const p=new Uint8Array(6);p[0]=5;new DataView(p.buffer).setUint32(1,++mainMouseSequence,true);p[5]=mainMouse.buttons;c.send(p.buffer);},50);
