'use strict';
(() => {
 let state=null,received=0,preferencesLoaded=false,requesting=false;
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const ownerURL=local?new URL('/api/broadcast',location.origin):new URL('http://127.0.0.1:8443/api/broadcast');
 function duration(seconds){const n=Math.max(0,Math.floor(seconds||0));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');}
 function render(){
  if(!state)return;
  const active=state.state!=='off',running=state.state==='running';
  $('#broadcast-state').textContent={off:'Chưa bật',running:'Đang phát',paused:'Đang tạm dừng'}[state.state];
  $('#broadcast-start').hidden=active;$('#broadcast-pause').hidden=!active;$('#broadcast-stop').hidden=!active;
  $('#broadcast-pause').textContent=running?'Tạm dừng':'Tiếp tục';$('#broadcast-access').hidden=!active;
  $('#broadcast-username').value=state.username;$('#broadcast-password').value=state.password;$('#broadcast-link').value=state.joinURL||'';
  $('#broadcast-viewers').textContent=state.connected;$('#broadcast-connections').textContent=active?state.connections:0;
  $('#broadcast-paused').textContent=duration(active?state.pausedSeconds:0);
  for(const id of ['broadcast-custom','broadcast-prefix','broadcast-custom-name','broadcast-custom-password','broadcast-save'])$('#'+id).disabled=active;
  if(!preferencesLoaded){const p=state.preferences;$('#broadcast-custom').checked=p.custom;$('#broadcast-prefix').value=p.prefix;$('#broadcast-custom-name').value=p.username;$('#broadcast-custom-password').value=p.password;preferencesLoaded=true;mode();}
  tick();
 }
 function tick(){if(state&&!$('#broadcast').hidden)$('#broadcast-clock').textContent=duration((state.state==='off'?0:state.activeSeconds)+(state.state==='running'?(performance.now()-received)/1000:0));}
 function mode(){$('#broadcast-custom-fields').hidden=!$('#broadcast-custom').checked;$('#broadcast-prefix-label').hidden=$('#broadcast-custom').checked;}
 async function owner(action='status',extra={}){
  if(requesting)return;requesting=true;for(const id of ['broadcast-start','broadcast-pause','broadcast-stop','broadcast-save'])$('#'+id).disabled=true;
  try{
   const response=await fetch(ownerURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Không điều khiển được phiên.');
   state=data;received=performance.now();render();$('#broadcast-local').hidden=true;
   $('#broadcast-message').textContent=action==='status'?'Phiên khách dùng luồng WebRTC native của PC.':'Đã cập nhật phiên phát.';
   if(action==='stop'&&data.summary)summary(data.summary);
  }catch(error){$('#broadcast-message').textContent=error.message.includes('fetch')||error.name==='TimeoutError'?'Mở trên PC host và chạy open_web.bat bản mới. Nếu Pages bị chặn localhost, dùng nút Mở trên PC host.':error.message;$('#broadcast-local').hidden=!local?false:true;}
  finally{requesting=false;render();for(const id of ['broadcast-start','broadcast-pause','broadcast-stop'])$('#'+id).disabled=false;}
 }
 function summary(value){
  const data=[['Thời gian đang phát',duration(value.activeSeconds)],['Thời gian tạm dừng',duration(value.pausedSeconds)],['Tổng thời gian phiên',duration(value.elapsedSeconds)],['Lượt kết nối',String(value.connections)],['Bắt đầu',new Date(value.startedAt*1000).toLocaleString('vi-VN')],['Kết thúc',new Date(value.endedAt*1000).toLocaleString('vi-VN')],['Tài khoản',value.custom?'Tùy chỉnh':'Ngẫu nhiên']];
  const area=$('#broadcast-summary-body');area.replaceChildren();for(const [title,text] of data){const row=document.createElement('div'),label=document.createElement('small'),strong=document.createElement('strong');label.textContent=title;strong.textContent=text;row.append(label,strong);area.append(row);}$('#broadcast-summary').showModal();
 }
 $('#broadcast-open').onclick=()=>{showView('broadcast');owner();};
 $('#broadcast-start').onclick=()=>owner('start');$('#broadcast-pause').onclick=()=>owner(state?.state==='paused'?'resume':'pause');$('#broadcast-stop').onclick=()=>owner('stop');
 $('#broadcast-custom').onchange=mode;
 $('#broadcast-save').onclick=async()=>{preferencesLoaded=false;await owner('configure',{preferences:{custom:$('#broadcast-custom').checked,prefix:$('#broadcast-prefix').value,username:$('#broadcast-custom-name').value,password:$('#broadcast-custom-password').value}});};
 $('#broadcast-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#broadcast-link').value+'\nTên: '+$('#broadcast-username').value+'\nMật khẩu: '+$('#broadcast-password').value);toast('Đã sao chép thông tin phiên. Chỉ gửi cho người được phép điều khiển PC.');}catch{toast('Chọn từng ô để sao chép thông tin.');}};
 setInterval(tick,250);setInterval(()=>{if(!$('#broadcast').hidden&&!document.hidden)owner();},5000);
 function guestOrigin(){if(!window.PCCloudDeployment?.static)return location.origin;const machine=machines.find(m=>m.mode==='webrtc'&&m.url&&m.url!==location.origin);return machine?safeURL(machine.url).origin:null;}
 function openGuest(){const target=guestOrigin();$('#broadcast-target').textContent=target?'PC đích: '+target:'Mở link Phát PC do chủ máy cung cấp để xác định PC đích.';$('#broadcast-login-error').textContent='';$('#broadcast-login').showModal();}
 $('#broadcast-guest-open').onclick=openGuest;
 $('#broadcast-login-form').onsubmit=async event=>{
  event.preventDefault();const target=guestOrigin();if(!target){$('#broadcast-login-error').textContent='Cần mở link Phát PC của máy bạn muốn vào.';return;}
  const button=event.target.querySelector('button[type=submit]');button.disabled=true;
  try{
   const response=await fetch(target+'/api/broadcast/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:event.target.elements.username.value.trim(),password:event.target.elements.password.value}),credentials:'omit',signal:AbortSignal.timeout(10000)});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Đăng nhập không thành công.');
   $('#broadcast-login').close();event.target.elements.password.value='';
   await connect({name:data.name,url:target,nativeSignaling:target.replace(/^http/,'ws')+'/signal',nativeRoom:data.room,width:1920,fps:60,bitrate:20},data.ticket);
  }catch(error){if(!$('#broadcast-login').open)$('#broadcast-login').showModal();$('#broadcast-login-error').textContent=error.message;}
  finally{button.disabled=false;}
 };
 if(params.get('broadcast')==='1'){showView('broadcast');owner();history.replaceState({},'',location.pathname);}
 if(params.get('join')==='1'){openGuest();history.replaceState({},'',location.pathname);}
})();
