'use strict';
(() => {
 let selected=null,playing=null,busy=false,loginOrigin='',loginId=null,detailReturn=null;
 const labels={running:'PC đang phát · sẵn sàng chơi',paused:'PC đã tạm dừng · đợi chủ máy tiếp tục',off:'Máy này đã tắt · phiên hết hạn',expired:'Hết hạn · có thể xóa hồ sơ',offline:'Máy chưa phản hồi',unknown:'Chưa kiểm tra trạng thái'};
 const isEnded=m=>['off','expired'].includes(m.broadcastState);
 const api=async(m,action='status')=>{
  const response=await fetch(m.url+'/api/broadcast/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access:m.access,action}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(7000)});
  const data=await response.json();if(!response.ok){const error=Error(data.error||'Không đọc được phiên.');error.state=data.state;throw error;}return data;
 };
 function remember(m){const index=machines.findIndex(x=>x.id===m.id);if(index<0)return;machines[index]=m;saveStore('pccloud.machines',machines);renderMachines();}
 function appsFor(m){if(m.apps)return m.apps;const apps={};if(m.mode==='webrtc')apps.webrtc={label:'PC Cloud'};if(m.mode==='rdp')apps.rdp={label:'Remote Desktop',host:m.host,port:m.port,username:m.username,message:'Thông tin hồ sơ RDP đã lưu. Dùng mật khẩu Windows trong ứng dụng.'};if(m.mode==='moonlight')apps.moonlight={label:'Moonlight / Sunshine',host:m.host,message:'Ghép đôi bằng PIN trên Sunshine.'};if(m.mode==='parsec')apps.parsec={label:'Parsec',url:'https://web.parsec.app/',message:'Dùng tài khoản Parsec được cấp quyền.'};if(m.mode==='external')apps.external={label:'Web / App khác',url:m.external};return apps;}
 function fields(m,app){const value=appsFor(m)[app]||{};if(app==='webrtc')return [['Địa chỉ PC',m.url],['Tài khoản Phát PC',m.broadcastUsername||m.name]];if(app==='moonlight')return [['IP nhập vào Moonlight',value.host]];if(app==='rdp')return [['Địa chỉ',value.host],['Cổng',String(value.port||3389)],['Tài khoản Windows',value.username]];return [['Trang ứng dụng',value.url]];}
 async function copy(value){try{await navigator.clipboard.writeText(value||'');toast('Đã sao chép.');}catch{toast('Không sao chép tự động được. Chọn phần thông tin để copy.');}}
 function paint(){
  if(!selected)return;const m=machines.find(x=>x.id===selected.id)||selected;selected=m;const app=$('#guest-app').value,value=appsFor(m)[app]||{};
  $('#guest-name').textContent=m.name;$('#guest-state').textContent=playing===m.id?'Đang chơi · kết nối web':labels[m.broadcastState||'unknown'];$('#guest-delete').hidden=!isEnded(m);
  $('#guest-message').textContent=value.message||(app==='webrtc'?'Hồ sơ đã lưu. Bấm kết nối để vào PC; không cần nhập lại thông tin.':'');
  if(app==='rdp'){
   const status=value.supported===false?'PC này dùng Windows Home, không nhận kết nối Remote Desktop. Dùng Kết nối trên web hoặc Windows Pro/Enterprise.':value.enabled===false?'Remote Desktop đang tắt trên host. Bật Settings → System → Remote Desktop rồi mở lại thông tin PC.':value.listening===false?'Cổng RDP trên host chưa lắng nghe. Kiểm tra dịch vụ Remote Desktop Services.':'';
   $('#guest-message').textContent=(status||value.message||'Kiểm tra Remote Desktop đã bật trên host.')+' File .rdp chỉ lưu địa chỉ và tài khoản Windows, không bật RDP. Khác Wi-Fi cần VPN/RD Gateway; link HTTPS Phát PC chỉ dùng cho web. Đăng nhập bằng mật khẩu Windows, không dùng mật khẩu Phát PC.';
  }
  if(app==='moonlight')$('#guest-message').textContent='Trên điện thoại mở Moonlight rồi thêm IP phía trên. Đã ghép đôi thì vào PC ngay; thiết bị mới cần chủ PC xác nhận PIN một lần.';
  if(m.broadcastState==='paused')$('#guest-message').textContent='PC đã tạm dừng. Đợi chủ máy tiếp tục, sau đó bấm kết nối lại.';
  if(isEnded(m))$('#guest-message').textContent='Quyền truy cập phiên này đã hết hạn. Chủ máy bật lại sẽ tạo phiên mới; dùng tài khoản mới để thêm PC.';
  const info=$('#guest-info');info.replaceChildren();for(const [title,text] of fields(m,app)){if(!text)continue;const row=document.createElement('div'),label=document.createElement('small'),line=document.createElement('div'),code=document.createElement('code'),button=document.createElement('button');label.textContent=title;line.className='copy-value';code.textContent=text;button.type='button';button.className='button secondary';button.textContent='Copy';button.setAttribute('aria-label','Sao chép '+title);button.onclick=()=>copy(text);line.append(code,button);row.append(label,line);info.append(row);}
  $('#guest-connect').textContent={webrtc:'Kết nối trên web ↗',rdp:'Tải file .rdp ↓',moonlight:'Hướng dẫn ghép đôi ↗',parsec:'Mở Parsec ↗',external:'Mở ứng dụng ↗'}[app];
  // Export is not a remote-control action; unsupported/offline Windows can still export its configuration.
  $('#guest-connect').hidden=app==='rdp';$('#guest-rdp-download').hidden=app!=='rdp';
  if(app==='rdp'){
   const link=$('#guest-rdp-download');
   if(m.rdpDownload?.startsWith('/api/broadcast/rdp/')){link.href=m.url+m.rdpDownload;link.download='pc-cloud.rdp';link.referrerPolicy='no-referrer';}
   else prepareRDPDownload(link,{host:value.host,port:value.port,username:value.username});
  }
  $('#guest-connect').disabled=m.authType==='broadcast'&&m.broadcastState!=='running';
 }
 async function refresh(m){
  if(!m.access||isEnded(m))return;
  try{const data=await api(m);m={...m,broadcastState:data.state,rdpDownload:data.rdpDownload};if(data.rdpStatus)m.apps={...appsFor(m),rdp:{...appsFor(m).rdp,...data.rdpStatus}};}
  catch(error){m={...m,broadcastState:error.state==='expired'?'expired':'offline'};}
  remember(m);if(selected?.id===m.id)paint();
  if(playing===m.id&&m.broadcastState!=='running'){playing=null;await disconnect();toast(labels[m.broadcastState]);}
 }
 function show(m){
  selected=m;const choices=appsFor(m),select=$('#guest-app');select.replaceChildren();for(const [id,value] of Object.entries(choices)){const option=document.createElement('option');option.value=id;option.textContent=id==='moonlight'?'Moonlight':value.label;select.append(option);}if(m.lastApp&&choices[m.lastApp])select.value=m.lastApp;paint();if(!$('#guest-details').open)$('#guest-details').showModal();refresh(m);
 }
 function openLogin(m=null){
  rdpScanGeneration++;loginId=m?.id||null;const f=$('#connection-form');f.reset();f.classList.add('account-only');f.dataset.editId=loginId||'';f.elements.name.value='PC đang phát';f.elements.broadcastUsername.value=m?.broadcastUsername||params.get('name')||'';f.elements.cloudAuth.value='broadcast';setMode('webrtc');
  loginOrigin=m?.url||(params.get('host')?CloudSessionLink.origin(params.get('host')):'')||(params.get('join')==='1'?location.origin:readStore('pccloud.join-origin',''))||(!window.PCCloudDeployment?.static?location.origin:'');
  $('#connection-title').textContent='Thêm máy tính của bạn';$('#connect-submit').textContent='Đăng nhập & thêm PC';$('#connect-submit').disabled=false;$('#form-error').textContent='';$('#connection-dialog').showModal();
 }
 async function add(form){
  const generation=rdpScanGeneration,button=$('#connect-submit');if(button.disabled)return;button.disabled=true;$('#form-error').textContent='';
  try{
   const routed=CloudSessionLink.route(form.elements.broadcastUsername.value.trim()),username=routed.username,password=form.elements.broadcastPassword.value;if(!username||!password)throw Error('Nhập tài khoản và mật khẩu Phát PC.');
   const origin=routed.origin||loginOrigin||machines.find(m=>m.broadcastUsername===username)?.url;
   if(!origin)throw Error('Mở link Phát PC do chủ máy gửi một lần để web nhận diện PC. Sau đó chỉ nhập tài khoản và mật khẩu.');
   const machine={url:safeURL(origin).origin,broadcastUsername:username};const data=await CloudBroadcast.authenticate(machine,password);
   if(generation!==rdpScanGeneration||!$('#connection-dialog').open)return;
   if(!data.access||!data.apps)throw Error('PC host cần cập nhật bản mới và khởi động lại open_web.bat.');
   const existing=machines.find(m=>m.authType==='broadcast'&&m.url===machine.url&&m.sessionId===data.sessionId);
   const saved={...machine,id:loginId||existing?.id||uid(),name:data.name,mode:'webrtc',authType:'broadcast',access:data.access,sessionId:data.sessionId,apps:data.apps,rdpDownload:data.rdpDownload,broadcastState:data.state,nativeRoom:data.room,nativeSignaling:machine.url.replace(/^http/,'ws')+'/signal',width:1920,fps:120,bitrate:20};
   storeMachine(saved);saveStore('pccloud.join-origin',machine.url);$('#connection-dialog').close();show(saved);
  }catch(error){if(generation===rdpScanGeneration&&$('#connection-dialog').open)$('#form-error').textContent=error.message;}
  finally{if(generation===rdpScanGeneration)button.disabled=false;}
 }
 function card(m){const state=m.broadcastState||'unknown',status=playing===m.id?'Đang chơi':labels[state];return `<article class="machine-card"><div class="card-top"><span class="pc-icon">▣</span><span class="offline-label" data-state="${escapeHTML(state)}">${escapeHTML(status)}</span></div><h4>${escapeHTML(m.name)}</h4><p>${escapeHTML(m.broadcastUsername||'Phiên Phát PC')}</p><div class="card-actions"><button class="button secondary" data-machine="${escapeHTML(m.id)}">Thông tin & kết nối ↗</button><button class="icon-button" data-delete="${escapeHTML(m.id)}" title="Xóa hồ sơ">×</button></div></article>`;}
 $('#guest-app').onchange=()=>{if(selected){selected.lastApp=$('#guest-app').value;remember(selected);}paint();};
 $('#guest-copy').onclick=()=>selected&&copy(fields(selected,$('#guest-app').value).filter(([,v])=>v).map(([k,v])=>k+': '+v).join('\n'));
 $('#guest-delete').onclick=()=>{if(!selected||!isEnded(selected))return;machines=machines.filter(m=>m.id!==selected.id);saveStore('pccloud.machines',machines);renderMachines();$('#guest-details').close();selected=null;};
 $('#guest-rdp-download').onclick=()=>toast('Đang tải file .rdp. Mở file bằng Remote Desktop / Windows App.');
 function backFrom(dialog){
  if(detailReturn?.dialog===dialog){const context=detailReturn;detailReturn=null;show(machines.find(m=>m.id===context.machine.id)||context.machine);return;}
  const known=dialog==='moonlight-details'?moonlightDetails:displayedRDP;
  const machine=machines.find(m=>m.id===known?.id);
  if(machine)show(machine);else showView('machines');
 }
 for(const [dialog,button] of [['moonlight-details','moonlight-back'],['rdp-details','rdp-back']]){
  $('#'+button).onclick=()=>{if(detailReturn?.dialog===dialog)$('#'+dialog).close();else{$('#'+dialog).close();backFrom(dialog);}};
  $('#'+dialog).addEventListener('close',()=>{if(detailReturn?.dialog===dialog)backFrom(dialog);});
 }
 $('#guest-connect').onclick=async()=>{
  if(!selected)return;const m=selected,app=$('#guest-app').value;$('#guest-connect').disabled=true;
  try{
   if(m.authType==='broadcast'){await refresh(m);const current=machines.find(x=>x.id===m.id);if(current?.broadcastState!=='running')return;}
   const value=appsFor(m)[app];
   if(app==='webrtc'){
    let ticket=m.code;if(m.access){const data=await api(m,'connect');ticket=data.ticket;}
    if(!ticket){$('#guest-details').close();openLogin(m);return;}
    $('#guest-details').close();await connect(m,ticket);playing=m.id;renderMachines();
   }else if(app==='rdp')downloadRDP({name:m.name,host:value.host,port:value.port,username:value.username});
   else if(app==='moonlight'){detailReturn={dialog:'moonlight-details',machine:m};$('#guest-details').close();showMoonlightDetails({id:m.id,name:m.name,host:value.host});$('#moonlight-save').hidden=true;}
   else window.open(safeURL(value.url).href,'_blank','noopener,noreferrer');
  }catch(error){$('#guest-message').textContent=error.message;toast(error.message);}finally{paint();}
 };
 document.addEventListener('click',e=>{const button=e.target.closest('[data-copy-field]');if(button)copy($('#'+button.dataset.copyField).value);});
 Object.assign(CloudBroadcast,{openLogin,add,show,card});
 $('#connection-form').elements.broadcastUsername.maxLength=1024;
 $('#connection-form').elements.broadcastUsername.addEventListener('change',e=>{const route=CloudSessionLink.route(e.target.value.trim());if(window.PCCloudDeployment?.static&&route.origin.startsWith('http:'))location.assign(route.origin+'/?join=1&name='+encodeURIComponent(route.username));});
 const originalDisconnect=disconnect;disconnect=async function(){playing=null;await originalDisconnect();renderMachines();};$('#disconnect').onclick=()=>disconnect();
 if(params.get('join')==='1'){const host=params.get('host')?CloudSessionLink.origin(params.get('host')):location.origin;saveStore('pccloud.join-origin',host);loginOrigin=host;openLogin();}
 else if($('#connection-dialog').open)openLogin();
 renderMachines();
 async function poll(){if(busy||document.hidden)return;busy=true;try{for(const m of machines.filter(m=>m.access&&!isEnded(m)))await refresh(m);}finally{busy=false;}}
 setInterval(poll,5000);poll();document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
})();
