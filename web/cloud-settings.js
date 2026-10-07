// UI only: video stays a native <video>; no frame copying or per-frame UI render.
(() => {
 'use strict';
 const tabs=$$('.cloud-tabs button');
 function showTab(name){releaseAll();for(const b of tabs){const on=b.dataset.cloudTab===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}for(const page of $$('.cloud-page'))page.hidden=page.dataset.cloudPage!==name;$('#settings .scroll').scrollTop=0;}
 for(const b of tabs)b.onclick=()=>showTab(b.dataset.cloudTab);
 showTab('image');
 const peripheral=$('#peripheral-status');let lastPeripheral='';
 function devices(){const pads=CloudDevices.gamepads(navigator),supported=typeof navigator.getGamepads==='function';const text=!isSecureContext?'Tay cầm cần HTTPS (hoặc localhost trên PC).':!supported?'Trình duyệt này chưa cung cấp Gamepad API.':pads.length?'Đã nhận '+pads.length+' tay cầm · '+(hostCaps?.gamepad?'host có ViGEmBus.':'host cần ViGEmBus để nhận tay cầm.'):'Chưa nhận tay cầm. Nhấn một nút trên tay cầm khi trang đang mở.';if(text!==lastPeripheral){peripheral.textContent=text;lastPeripheral=text;}}
 addEventListener('gamepadconnected',devices);addEventListener('gamepaddisconnected',devices);setInterval(devices,2000);devices();
 const oldSelect=selectButtons;
 function updateFPS(){const fps=S.fps;$('#fps-slider').value=fps===0?501:fps;$('#fps-target').textContent=fps===0?'∞':fps;$('#fps-explanation').textContent=fps===0?'Không khóa FPS nhận. Host yêu cầu capture tối đa 500 FPS; phần cứng quyết định FPS thực.':'FPS mục tiêu, không phải FPS thực nhận. Thả thanh kéo để áp dụng.';}
 selectButtons=function(){oldSelect();updateFPS();};updateFPS();
 $('#fps-slider').oninput=e=>{S.fps=CloudSettingsModel.sliderFPS(e.target.value);updateFPS();};
 $('#fps-slider').onchange=()=>{changed();};
 $('#fps-toggle').onclick=()=>{const quick=$('#refresh-rate').hidden;$('#refresh-rate').hidden=!quick;$('#fps-custom').hidden=quick;$('#fps-toggle').textContent=quick?'Thanh kéo':'Chọn nhanh';};

 const oldEdit=$('#edit-controls').onclick;
 $('#edit-controls').onclick=()=>{if(!S.mobile)return;oldEdit();$('#layout-studio').hidden=false;closeSettings();};
 const oldFinish=finishEdit;
 finishEdit=function(cancel){oldFinish(cancel);$('#layout-studio').hidden=true;$('#profile-name').value='';};
 $('#studio-done').onclick=()=>{finishEdit(false);toast('Đã áp dụng bố cục phiên này. Lưu profile để dùng lại.');};
 // Existing controls editor becomes a compact inspector, not another menu.
 const oldSelected=selectControl;
 selectControl=function(c){oldSelected(c);$('#layout-studio').dataset.selected=c.id;};

 let pendingProfile='';
 function updateProfileUI(){const name=localStorage.getItem('pccloud.native.active');$('#active-profile-name').textContent=name||'Bố cục hiện tại';$('#profile-options').replaceChildren();for(const p of profiles){const b=document.createElement('button');b.type='button';b.className='profile-option';b.setAttribute('role','option');b.setAttribute('aria-selected',String(p.name===pendingProfile));const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=p.name;detail.textContent=p.controls.length+' nút · '+p.controls.filter(c=>c.action==='joystick').length+' joystick';b.append(title,detail);b.onclick=()=>{pendingProfile=p.name;updateProfileUI();};$('#profile-options').append(b);}if(!profiles.length){const empty=document.createElement('p');empty.textContent='Chưa có profile. Tùy chỉnh nút rồi lưu bố cục đầu tiên.';$('#profile-options').append(empty);}$('#apply-profile').disabled=!profiles.some(p=>p.name===pendingProfile);}
 const oldProfiles=renderProfiles;
 renderProfiles=function(){oldProfiles();updateProfileUI();};
 $('#profile-trigger').onclick=()=>{pendingProfile=localStorage.getItem('pccloud.native.active')||profiles[0]?.name||'';updateProfileUI();$('#profile-menu').showModal();};
 $('#close-profile-menu').onclick=()=>$('#profile-menu').close();
 $('#profile-menu').addEventListener('pointerdown',e=>{if(e.target!==$('#profile-menu'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){e.preventDefault();e.stopImmediatePropagation();e.target.close();}});
 $('#apply-profile').onclick=()=>{const p=profiles.find(p=>p.name===pendingProfile);if(!p)return;try{const next=validateControls(p.controls);releaseAll();finishEdit(false);controls=next;localStorage.setItem('pccloud.native.active',p.name);syncDashboardProfile(p.name);renderControls();updateProfileUI();$('#profile-menu').close();toast('Đã áp dụng '+p.name);}catch(e){toast(e.message);}};
 $('#export-profile').onclick=()=>{const name=localStorage.getItem('pccloud.native.active')||'Bố cục của tôi';const data={version:1,type:'pccloud-controls',profile:{name,controls:structuredClone(controls)}};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='pccloud-profile.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 $('#import-profile-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>262144)throw Error('File JSON tối đa 256 KB.');const imported=CloudSettingsModel.profileFile(await file.text(),validateControls);const next=structuredClone(profiles);for(const p of imported){const at=next.findIndex(n=>n.name===p.name);if(at>=0)next[at]=p;else next.push(p);}if(next.length>50)throw Error('Tối đa 50 profile.');localStorage.setItem('pccloud.native.profiles',JSON.stringify(next));profiles=next;pendingProfile=imported[0].name;renderProfiles();$('#profile-menu').showModal();toast('Đã nhập JSON. Chọn profile và bấm Áp dụng.');}catch(error){toast(error.message);}finally{e.target.value='';}};
 updateProfileUI();

 let lock=null;
 async function awake(){if(!$('#keep-awake').checked||document.visibilityState!=='visible')return;if(!navigator.wakeLock){$('#keep-awake').checked=false;$('#awake-state').textContent='Trình duyệt chưa hỗ trợ giữ màn hình sáng.';return;}try{lock=await navigator.wakeLock.request('screen');$('#awake-state').textContent='Giữ màn hình sáng trong phiên này.';lock.addEventListener('release',()=>{lock=null;$('#awake-state').textContent='Màn hình có thể nghỉ khi tab không hoạt động.';});}catch{ $('#awake-state').textContent='Không thể giữ màn hình sáng ở chế độ hiện tại.'; }}
 $('#keep-awake').onchange=()=>{if($('#keep-awake').checked)awake();else{lock?.release();lock=null;$('#awake-state').textContent='Theo cài đặt nghỉ của thiết bị.';}};
 document.addEventListener('visibilitychange',awake);
 $('#show-hud').onchange=()=>{$('#stream-hud').hidden=!$('#show-hud').checked;};
 setInterval(()=>{if($('#show-hud').checked)$('#stream-hud').textContent='FPS '+$('#fps-value').textContent+' · RTT '+$('#ping').textContent;},1500);
})();
