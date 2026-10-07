'use strict';
let moonlightDetails=null;
function showMoonlightDetails(machine){
 try{moonlightDetails={...CloudMoonlight.validate(machine),id:machine.id};}catch(error){toast(error.message);return;}
 $('#moonlight-pc-name').textContent=moonlightDetails.name;
 $('#moonlight-address').textContent=moonlightDetails.host;
 if(!$('#moonlight-details').open)$('#moonlight-details').showModal();
}
async function shareMoonlight(machine){
 try{await navigator.clipboard.writeText(CloudMoonlight.link(machine));toast('Đã sao chép link hồ sơ Moonlight. Mở link trên điện thoại để xem địa chỉ PC.');}
 catch{showMoonlightDetails(machine);toast('Không sao chép tự động được. Dùng địa chỉ PC trên bảng để thêm vào Moonlight.');}
}
$('#moonlight-preview').onclick=()=>{try{showMoonlightDetails(readMachine());$('#form-error').textContent='';}catch(error){$('#form-error').textContent=error.message;}};
$('#moonlight-copy').onclick=async()=>{try{await navigator.clipboard.writeText(moonlightDetails.host);toast('Đã sao chép IP cho Moonlight.');}catch{toast('Chọn địa chỉ trên bảng để sao chép.');}};
$('#moonlight-save').onclick=()=>{const existing=machines.find(m=>m.mode==='moonlight'&&m.host===moonlightDetails.host&&m.name===moonlightDetails.name);storeMachine({...moonlightDetails,id:machines.some(m=>m.id===moonlightDetails.id)?moonlightDetails.id:existing?.id||moonlightDetails.id||uid()});toast('Đã lưu PC Moonlight trên thiết bị này.');};
$('#moonlight-share').onclick=()=>shareMoonlight(moonlightDetails);
$('#moonlight-export').onclick=()=>download('pccloud-moonlight.txt',CloudMoonlight.text(moonlightDetails),'text/plain;charset=utf-8');
$('#moonlight-scan').onclick=async()=>{
 const generation=rdpScanGeneration,button=$('#moonlight-scan'),status=$('#moonlight-scan-status');
 button.disabled=true;status.hidden=false;status.textContent='Đang lấy địa chỉ PC…';$('#moonlight-open-local').hidden=true;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 const endpoint=['localhost','127.0.0.1','[::1]'].includes(location.hostname)?new URL('/api/rdp-info',location.origin):new URL('http://127.0.0.1:8443/api/rdp-info');
 try{
  const response=await fetch(endpoint,{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('Không đọc được địa chỉ PC.');
  const info=await response.json(),machine=CloudMoonlight.validate(info);
  if(generation!==rdpScanGeneration||!$('#connection-dialog').open||activeMode!=='moonlight')return;
  const form=$('#connection-form');form.elements.name.value=machine.name;form.elements.moonlightHost.value=machine.host;
  adoptConnectionMatch(machines.find(m=>m.mode==='moonlight'&&m.host===machine.host));
  status.textContent='Đã lấy địa chỉ PC. Cần cài/chạy Sunshine và ghép đôi với Moonlight trên điện thoại. Quét này chưa kiểm tra Sunshine hay kết nối chơi game.';
  $('#form-error').textContent='';
 }catch{
  if(generation!==rdpScanGeneration)return;
  status.textContent='Quét trên PC cần chạy CloudPC host. Điện thoại không đọc được thông tin Windows. Mở web local trên PC để quét, rồi sao chép link hồ sơ sang điện thoại.';
  $('#moonlight-open-local').hidden=false;
 }finally{clearTimeout(timeout);button.disabled=false;}
};
try{
 const profile=CloudMoonlight.fromLink(location.href);
 if(profile){showMoonlightDetails(profile);history.replaceState({},'',location.pathname);}
 else if(params.get('moonlight')==='scan'){
  openConnection({mode:'moonlight',name:'Moonlight PC'});$('#moonlight-scan').click();history.replaceState({},'',location.pathname);
 }
}catch(error){toast(error.message);}
