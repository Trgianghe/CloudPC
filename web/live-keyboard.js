'use strict';
(() => {
 const panel=document.createElement('section');panel.id='live-keyboard';panel.hidden=true;panel.setAttribute('aria-label','Bàn phím và chuột ảo');
 const header=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');title.textContent='Bàn phím 108 phím & chuột';close.type='button';close.textContent='×';close.setAttribute('aria-label','Đóng bàn phím ảo');header.append(title,close);panel.append(header);
 const held=new Map();
 function releaseButton(button){const end=held.get(button);if(!end)return;end();held.delete(button);button.classList.remove('held');}
 function bind(button,down,up){button.type='button';button.onpointerdown=e=>{e.preventDefault();e.stopPropagation();if(blocked()||!rtcReady||held.has(button))return;button.setPointerCapture(e.pointerId);held.set(button,up);button.classList.add('held');down();};button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>releaseButton(button);}
 panel.append(CloudKeyPicker.board('live-keyboard-board',(b,vk)=>bind(b,()=>holdKey('virtual:'+vk,vk,true),()=>holdKey('virtual:'+vk,vk,false))));
 const mouseRow=document.createElement('div');mouseRow.className='live-keyboard-row mouse-row';
 for(const [label,bit] of [['Chuột trái',0],['Chuột phải',1],['Chuột giữa',2]]){const b=document.createElement('button');b.textContent=label;bind(b,()=>holdMouse('virtual-mouse:'+bit,bit,true),()=>holdMouse('virtual-mouse:'+bit,bit,false));mouseRow.append(b);}
 for(const [label,delta] of [['Cuộn lên',120],['Cuộn xuống',-120]]){const b=document.createElement('button');b.textContent=label;bind(b,()=>mouse.wheel(delta),()=>{});mouseRow.append(b);}panel.append(mouseRow);document.body.append(panel);
 function hide(){for(const button of [...held.keys()])releaseButton(button);panel.hidden=true;$('#video').focus();}
 close.onclick=hide;document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target))hide();});window.addEventListener('blur',()=>{for(const button of [...held.keys()])releaseButton(button);});
 $('#open-virtual-keyboard').onclick=()=>{if(S.editing){toast('Lưu hoặc hủy chỉnh nút trước khi dùng bàn phím.');return;}panelAnimation?.cancel();originalCloseSettings();panel.hidden=false;$('#video').focus();};
 const previousDisconnect=disconnect;disconnect=async function(){hide();await previousDisconnect();};
})();
