'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// getRandomValues also works on LAN HTTP; randomUUID requires HTTPS in some browsers.
function uid() { return [...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join(''); }
function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function saveStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast('Trình duyệt không cho lưu cấu hình.'); return false; } }
let machines = readStore('pccloud.machines', []);
if (!Array.isArray(machines)) machines = [];
let activeMode = 'webrtc', editingMachine = null, peer = null, inputChannel = null, sessionToken = null;
let demo = false, activeSession = false, layoutEditing = false, inputMode = 'game', pingTimer, statsTimer, connectTimer, abortRequest;
let selfHostViewOnly=false, motionChannel=null, motionSequence=0;
let rdpScanGeneration=0;
let connectionGeneration = 0, lastStats = null, toastTimer;
const heldInputs = new Map();
const keyNames = {8:'Backspace',9:'Tab',13:'Enter',16:'Shift',17:'Ctrl',18:'Alt',19:'Pause',20:'CapsLock',27:'Esc',32:'Space',33:'PgUp',34:'PgDn',35:'End',36:'Home',37:'←',38:'↑',39:'→',40:'↓',45:'Insert',46:'Delete',91:'Win',186:';',187:'=',188:',',189:'-',190:'.',191:'/',192:'`',219:'[',220:'\\',221:']',222:"'"};
for (let n = 48; n <= 90; n++) if (n <= 57 || n >= 65) keyNames[n] = String.fromCharCode(n);
for (let n = 112; n <= 123; n++) keyNames[n] = `F${n - 111}`;
const codeMap = {Escape:27,Space:32,Enter:13,NumpadEnter:13,Tab:9,Backspace:8,Delete:46,Insert:45,Home:36,End:35,PageUp:33,PageDown:34,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,ShiftLeft:16,ShiftRight:16,ControlLeft:17,ControlRight:17,AltLeft:18,AltRight:18,MetaLeft:91,MetaRight:92,CapsLock:20,Semicolon:186,Equal:187,Comma:188,Minus:189,Period:190,Slash:191,Backquote:192,BracketLeft:219,Backslash:220,BracketRight:221,Quote:222};
function keyCode(event) { if (/^Key[A-Z]$/.test(event.code)) return event.code.charCodeAt(3); if (/^Digit\d$/.test(event.code)) return event.code.charCodeAt(5); if (/^F\d+$/.test(event.code)) return 111 + Number(event.code.slice(1)); return codeMap[event.code] || 0; }
function control(label, keys, x, y, hold=true, action='key') { return {id:uid(),label,keys,x,y,hold,action}; }
function presetControls(name) {
  if (name === 'racing') return [control('↑',[38],18,56),control('←',[37],10,75),control('↓',[40],18,75),control('→',[39],26,75),control('Phanh',[32],83,75),control('Nitro',[16],88,54),control('Esc',[27],7,12,false)];
  if (name === 'desktop') return [control('Win',[91],9,78,false),control('Ctrl+C',[17,67],24,78,false),control('Ctrl+V',[17,86],40,78,false),control('Alt+Tab',[18,9],58,78,false),control('Enter',[13],77,78,false),control('Esc',[27],91,78,false),control('Chuột trái',[],84,48,true,'left'),control('Chuột phải',[],94,48,true,'right')];
  return [control('W',[87],17,58),control('A',[65],9,76),control('S',[83],17,76),control('D',[68],25,76),control('Shift',[16],8,39),control('Ctrl',[17],25,39),control('Space',[32],84,78),control('Bắn',[],88,47,true,'left'),control('Ngắm',[],76,58,true,'right'),control('R',[82],94,65,false),control('E',[69],67,76),control('Esc',[27],7,12,false)];
}
function validControl(c) { return c && typeof c.label === 'string' && c.label.length <= 18 && ['key','left','right','middle','joystick'].includes(c.action) && Array.isArray(c.keys) && c.keys.length <= 6 && c.keys.every(k => Number.isInteger(k) && k > 0 && k < 255) && Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= 3 && c.x <= 97 && c.y >= 5 && c.y <= 95 && (c.shape === undefined || ['circle','square'].includes(c.shape)) && (c.size === undefined || (Number.isFinite(c.size) && c.size >= 36 && c.size <= (c.action==='joystick'?240:200))) && (c.opacity === undefined || (Number.isFinite(c.opacity) && c.opacity >= 25 && c.opacity <= 100)); }
let controls = readStore('pccloud.controls', null);
if (!Array.isArray(controls) || !controls.length || !controls.every(validControl)) controls = presetControls('fps');
function persistControls() { if(!layoutEditing) saveStore('pccloud.controls', controls); renderControls(); renderTouchControls(); }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
function showView(name) { if(name==='controls'&&!CloudDevices.isMobileDevice(navigator))name='home'; $$('.view').forEach(v => v.hidden = v.id !== name); $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name)); $('#view-label').textContent = {home:'Tổng quan',machines:'Máy tính của tôi',controls:'Bộ điều khiển',guide:'Hướng dẫn kết nối',broadcast:'Phát PC'}[name]; window.scrollTo(0,0); }
function machineCard(machine) {
  return `<article class="machine-card"><div class="card-top"><span class="pc-icon">▣</span><span class="offline-label">${machine.mode === 'webrtc' ? 'WebRTC host' : machine.mode === 'rdp' ? 'Remote Desktop' : machine.mode === 'parsec' ? 'Parsec' : machine.mode === 'moonlight' ? 'Moonlight / Sunshine' : 'Web / App'}</span></div><h4>${escapeHTML(machine.name)}</h4><p>${escapeHTML(machine.url || machine.host || machine.external || '')}</p><div class="card-actions"><button class="button secondary" data-machine="${escapeHTML(machine.id)}">${['rdp','moonlight'].includes(machine.mode) ? 'Thông tin kết nối' : 'Kết nối'} ↗</button><button class="icon-button" data-edit-machine="${escapeHTML(machine.id)}" title="Cấu hình PC">⚙</button><button class="icon-button" data-share="${escapeHTML(machine.id)}" title="Sao chép link">↗</button><button class="icon-button" data-delete="${escapeHTML(machine.id)}" title="Xóa hồ sơ">×</button></div></article>`;
}
function renderMachines() {
  const add = '<button class="add-card" data-action="add"><span>＋</span><strong>Thêm máy tính của bạn</strong><p>Kết nối PC Windows hoặc máy cloud<br>bạn có quyền truy cập.</p></button>';
  const empty = '<article class="machine-card empty-card"><span class="empty-symbol">▣</span><div class="pill">KHỞI ĐẦU TỪ PC CỦA BẠN</div><h4>Không gian cloud đầu tiên.</h4><p>Thêm PC host để truy cập toàn bộ Windows. Bạn cũng có thể lưu thông tin RDP cho máy cloud đã thuê.</p><button class="button secondary" data-view="guide">Xem cách kết nối →</button></article>';
  $('#home-machines').innerHTML = machines.length ? machines.slice(0,2).map(machineCard).join('') + add : empty + add;
  $('#all-machines').innerHTML = machines.map(machineCard).join('') + add;
  for (const id of ['machine-count','list-count']) $(`#${id}`).textContent = machines.length;
  $('#saved-count').innerHTML = `${machines.length} <em>máy tính</em>`;
}
function setMode(mode) { if(mode!==activeMode){rdpScanGeneration++;$('#connect-submit').disabled=false;}activeMode = mode; renderSavedRDP(); updateCloudAuth(); $$('[data-mode]').forEach(b => b.classList.toggle('selected', b.dataset.mode === mode)); ['webrtc','rdp','external','parsec','moonlight'].forEach(m => $(`#${m}-fields`).hidden = m !== mode); $('#connect-submit').textContent = mode === 'moonlight' ? 'Thông tin Moonlight ↗' : mode === 'parsec' ? 'Mở Parsec ↗' : mode === 'rdp' ? 'Tải file .rdp ↓' : mode === 'external' ? 'Mở kết nối ↗' : 'Kết nối ngay ↗'; }
function updateCloudAuth(){const f=$('#connection-form'),account=f.elements.cloudAuth.value==='broadcast';$('#cloud-account-fields').hidden=!account;$('#cloud-code-fields').hidden=account;$('#cloud-code-hint').hidden=account;$('#connection-config-import').hidden=activeMode!=='webrtc'||account;}
$('#cloud-auth').onchange=()=>{rdpScanGeneration++;$('#connect-submit').disabled=false;updateCloudAuth();};
$('#connection-dialog').addEventListener('close',()=>{$('#connection-form').elements.broadcastPassword.value='';});
function adoptConnectionMatch(match){const pinned=$('#connection-form').dataset.editId;editingMachine=pinned||match?.id||null;}
function openConnection(machine=null) {
  rdpScanGeneration++; $('#rdp-scan-status').hidden=true; $('#rdp-open-local').hidden=true;
  const f = $('#connection-form');$('#connect-submit').disabled=false; f.reset(); editingMachine = machine?.id || null;f.dataset.editId=editingMachine||'';$('#connection-title').textContent=editingMachine?'Sửa máy tính':'Thêm máy tính của bạn';f.elements.cloudAuth.value=machine?(machine.authType||'code'):'broadcast';f.elements.broadcastUsername.value=machine?.broadcastUsername||''; $('#form-error').textContent = ''; setMode(machine?.mode || 'webrtc');
  f.elements.code.value=machine?.code||'';f.elements.rememberConfig.checked=machine?.rememberConfig!==false;
  f.dataset.nativeRoom=machine?.nativeRoom||'';f.dataset.nativeSignaling=machine?.nativeSignaling||'';
  f.elements.name.value = machine?.name || 'My Gaming PC'; f.elements.url.value = machine?.url || (window.PCCloudDeployment?.static?(machines.find(m=>m.mode==='webrtc'&&m.url!==location.origin)?.url||''):location.origin);
  for (const field of ['host','port','username','external','width','fps','bitrate']) if (machine?.[field]) f.elements[field].value = machine[field];
  f.elements.moonlightHost.value=machine?.mode==='moonlight'?machine.host||'':'';
  $('#moonlight-scan-status').hidden=true;$('#moonlight-open-local').hidden=true;
  $('#connection-dialog').showModal();
}
function safeURL(raw) { const url = new URL(raw); if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('Dùng địa chỉ HTTP/HTTPS hợp lệ, không đặt mật khẩu trong URL.'); return url; }
function readMachine() {
  const f = $('#connection-form'); if (!f.elements.name.value.trim()) throw new Error('Nhập tên máy tính.');
  const machine = {id:f.dataset.editId || editingMachine || uid(), mode:activeMode, name:f.elements.name.value.trim()};
  if (activeMode === 'webrtc') { machine.url = safeURL(f.elements.url.value.trim()).origin; machine.width = Number(f.elements.width.value); machine.fps = Number(f.elements.fps.value); machine.bitrate=Number(f.elements.bitrate.value);machine.authType=f.elements.cloudAuth.value==='broadcast'?'broadcast':'code';if(machine.authType==='broadcast'){machine.broadcastUsername=f.elements.broadcastUsername.value.trim();if(!machine.broadcastUsername)throw Error('Nhập tên đăng nhập Phát PC.');}else{machine.rememberConfig=f.elements.rememberConfig.checked;if(machine.rememberConfig&&f.elements.code.value.trim())machine.code=f.elements.code.value.trim();} }
  if (activeMode === 'rdp') { machine.host = f.elements.host.value.trim(); machine.port = Number(f.elements.port.value); machine.username = f.elements.username.value.trim(); CloudRDP.validate(machine); }
  if (activeMode === 'moonlight') Object.assign(machine,CloudMoonlight.validate({name:machine.name,host:f.elements.moonlightHost.value}));
  if (activeMode === 'parsec') machine.external='https://web.parsec.app/';
  if(activeMode==='webrtc'&&f.dataset.nativeSignaling){const endpoint=new URL(f.dataset.nativeSignaling);if(endpoint.origin.replace(/^wss:/,'https:').replace(/^ws:/,'http:')===machine.url){machine.nativeRoom=f.dataset.nativeRoom;machine.nativeSignaling=endpoint.href;}}
  if (activeMode === 'external') machine.external = safeURL(f.elements.external.value.trim()).href;
  return machine;
}
function storeMachine(machine) { const index = machines.findIndex(m => m.id === machine.id); if (index >= 0) machines[index] = machine; else machines.push(machine); editingMachine = machine.id; saveStore('pccloud.machines', machines); renderMachines(); }
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content],{type})); const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); }
function downloadRDP(machine) { download('pc-cloud.rdp',CloudRDP.file(machine),'application/x-rdp'); toast('Đã tải file RDP. Mở bằng ứng dụng Remote Desktop.'); }
function describeKeys(c) { if(c.action==='joystick')return 'Joystick · '+c.keys.map(k=>keyNames[k]||k).join(' / '); return c.action === 'key' ? c.keys.map(k => keyNames[k] || `VK ${k}`).join(' + ') : {'left':'Chuột trái','right':'Chuột phải','middle':'Chuột giữa'}[c.action]; }
function renderControls() { $('#control-list').innerHTML = controls.map(c => `<article class="control-item"><span class="key-badge">${escapeHTML(c.label)}</span><div><strong>${escapeHTML(describeKeys(c))}</strong><small>${c.hold ? 'Giữ để thao tác' : 'Chạm để nhấn'}</small></div><div class="item-actions"><button class="icon-button" data-edit-control="${escapeHTML(c.id)}" title="Sửa nút">✎</button><button class="icon-button" data-remove-control="${escapeHTML(c.id)}" title="Xóa nút">×</button></div></article>`).join(''); }
let recordedKeys = [];
let joystickDraft=[87,65,83,68];
function openControl(c=null) {joystickDraft=c?.action==='joystick'?[...c.keys]:[87,65,83,68]; const f = $('#control-form'); f.reset(); recordedKeys = c?.keys || []; f.elements.id.value = c?.id || ''; f.elements.label.value = c?.label || 'Phím'; f.elements.action.value = c?.action || 'key'; f.elements.hold.checked = c?.hold ?? true; f.elements.keys.value = recordedKeys.map(k => keyNames[k] || k).join(' + '); f.elements.baseKey.value=recordedKeys.at(-1)||32;f.elements.withCtrl.checked=recordedKeys.length>1&&recordedKeys.includes(17);f.elements.withShift.checked=recordedKeys.length>1&&recordedKeys.includes(16);f.elements.withAlt.checked=recordedKeys.length>1&&recordedKeys.includes(18); $('#key-fields').hidden = f.elements.action.value !== 'key';$('#joystick-fields').hidden=f.elements.action.value!=='joystick';f.elements.joystickKeys.value=c?.keys?.[0]===38?'arrows':'wasd'; $('#control-error').textContent = ''; $('#control-dialog').showModal();renderDashboardDirections();if(!c)pickDashboardKeys(); }
function send(event) { if (!['release','ping'].includes(event.type) && (isConfiguring()||selfHostViewOnly)) return; const motion=['move','absolute'].includes(event.type); const channel=motion&&!event.reliable?motionChannel:inputChannel; if(channel?.readyState==='open'){if(motion&&channel.bufferedAmount>4000)return;if(motion)event.seq=++motionSequence;channel.send(JSON.stringify(event));} }
function holdControl(c, down, source) {
  if (down) { heldInputs.set(source,c); if (c.action === 'key') c.keys.forEach(vk => send({type:'key',vk,down:true})); else send({type:'button',button:c.action,down:true}); }
  else { heldInputs.delete(source); if (c.action === 'key') [...c.keys].reverse().forEach(vk => { if (![...heldInputs.values()].some(h => h.action === 'key' && h.keys.includes(vk))) send({type:'key',vk,down:false}); }); else if (![...heldInputs.values()].some(h => h.action === c.action)) send({type:'button',button:c.action,down:false}); }
}
function releaseAll() { CloudTouch.resetAll();heldInputs.clear(); send({type:'release'}); $$('.pressed').forEach(b => b.classList.remove('pressed')); }
function bindControl(button,c) {
 if(c.action==='joystick'){CloudTouch.bindJoystick(button,c,{editing:()=>layoutEditing,blocked:()=>!activeSession||selfHostViewOnly||isConfiguring(),look:(dx,dy)=>send({type:'move',dx,dy}),hold:(vk,down)=>holdControl({action:'key',keys:[vk]},down,'stick:'+c.id+':'+vk),select:c=>selectSessionControl(c.id),drag:(c,e,b)=>{const r=$('#stage').getBoundingClientRect();c.x=Math.max(3,Math.min(97,(e.clientX-r.left)/r.width*100));c.y=Math.max(5,Math.min(95,(e.clientY-r.top)/r.height*100));b.style.left=c.x+'%';b.style.top=c.y+'%';}});return;}

  let drag = null;
  button.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); button.setPointerCapture(e.pointerId);
    if (layoutEditing && button.classList.contains('touch-key')) { selectSessionControl(c.id); drag = {id:e.pointerId}; return; }
    if (isConfiguring()) return;
    button.classList.add('pressed'); const source = `touch-${e.pointerId}`; holdControl(c,true,source);
    if (!c.hold) { holdControl(c,false,source); button.classList.remove('pressed'); }
  });
  button.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const rect = $('#stage').getBoundingClientRect(); c.x = Math.max(3,Math.min(97,(e.clientX-rect.left)/rect.width*100)); c.y = Math.max(5,Math.min(95,(e.clientY-rect.top)/rect.height*100)); button.style.left = `${c.x}%`; button.style.top = `${c.y}%`; });
  const finish = e => { e.stopPropagation(); if (drag) { drag=null; } else { if (heldInputs.has(`touch-${e.pointerId}`)) holdControl(c,false,`touch-${e.pointerId}`); button.classList.remove('pressed'); } };
  button.addEventListener('pointerup',finish); button.addEventListener('pointercancel',finish); button.addEventListener('lostpointercapture',finish);
}
function renderTouchControls() { if(!CloudDevices.isMobileDevice(navigator)){$('#touch-controls').replaceChildren();return;} CloudTouch.disposeAll();const area = $('#touch-controls'); area.replaceChildren(); area.hidden = inputMode !== 'game'; controls.forEach(c => { const b = document.createElement('button'); b.textContent = c.label; b.dataset.controlId=c.id; b.className = `touch-key shape-${c.shape||'square'}${layoutEditing ? ' editing' : ''}${$('#stage').dataset.selectedControl===c.id?' selected-control':''}`; b.style.left = `${c.x}%`; b.style.top = `${c.y}%`; b.style.width=`${c.size||52}px`;b.style.height=`${c.size||52}px`;b.style.opacity=(c.opacity||80)/100;b.style.fontSize=`${Math.max(9,Math.min(13,(c.size||52)/4))}px`; b.setAttribute('aria-label',`${c.label}: ${describeKeys(c)}`); bindControl(b,c); area.append(b); }); }
function buildKeyboard() { const keys = [27,9,17,16,18,91,32,8,13,...Array.from({length:12},(_,i)=>112+i),...Array.from({length:10},(_,i)=>48+i),...'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map(c=>c.charCodeAt(0)),37,38,40,39]; keys.forEach(vk => { const b = document.createElement('button'); b.textContent = keyNames[vk]; bindControl(b,control(keyNames[vk],[vk],50,50,true)); $('#keyboard-keys').append(b); }); }
function openSession(name, isDemo=false) { activeSession=true; demo=isDemo;selfHostViewOnly=false; inputMode='game'; layoutEditing=false; $('#session').hidden=false; $('#session-name').textContent=name; $('#session-state').textContent=isDemo?'Xem giao diện':'Đang kết nối'; $('#demo-scene').hidden=!isDemo; $('#session-overlay').hidden=isDemo; $('#overlay-title').textContent='Đang kết nối PC…'; $('#overlay-detail').textContent='Đang thiết lập đường truyền WebRTC.'; $('.spinner').hidden=false; $('#desktop-video').hidden=isDemo; $('.live-dot').classList.remove('connected'); $('#keyboard-panel').hidden=true; $('#edit-layout').textContent='✎ Bố cục'; $$('.control-modes [data-input]').forEach(b=>b.classList.toggle('selected',b.dataset.input==='game')); $('#rtt').textContent='RTT —'; $('#fps-stat').textContent='FPS —'; $('#resolution-stat').textContent='—'; renderTouchControls(); }
async function disconnect() { connectionGeneration++; activeSession=false; releaseAll(); clearInterval(pingTimer); clearInterval(statsTimer); clearTimeout(connectTimer); abortRequest?.abort(); inputChannel?.close();motionChannel?.close();motionChannel=null;selfHostViewOnly=false; peer?.close(); peer=null; inputChannel=null; sessionToken=null; $('#desktop-video').srcObject=null; $('#session').hidden=true; demo=false; if(document.fullscreenElement) await document.exitFullscreen().catch(()=>{}); }
function failSession(message) { clearTimeout(connectTimer); releaseAll(); peer?.close(); clearInterval(pingTimer); clearInterval(statsTimer); $('#session-overlay').hidden=false; $('.spinner').hidden=true; $('#overlay-title').textContent='Chưa kết nối được PC'; $('#overlay-detail').textContent=message; $('#session-state').textContent='Đã ngắt'; $('.live-dot').classList.remove('connected'); }
async function responseJSON(response) { if(!response.ok) throw new Error((await response.text()).slice(0,300)); return response.json(); }
async function waitICE(pc) { if(pc.iceGatheringState==='complete') return; await new Promise((resolve,reject)=>{ const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(new Error('Thu thập địa chỉ mạng quá lâu. Kiểm tra STUN/TURN.'));},15000); function check(){if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();}} pc.addEventListener('icegatheringstatechange',check); }); }
async function connect(machine,code) {
  if(machine.url!==location.origin) { const destination=new URL(machine.url); destination.searchParams.set('connect','1'); destination.searchParams.set('name',machine.name); location.assign(destination.href); return; }
  throw new Error('Player Cloud Settings chưa tải được. Tải lại trang để nhận bản mới.');
}

document.addEventListener('click', async e => {
  const view=e.target.closest('[data-view]'); if(view){showView(view.dataset.view);return;}
  const action=e.target.closest('[data-action]'); if(action){openConnection();return;}
  const close=e.target.closest('[data-close]'); if(close){$(`#${close.dataset.close}`).close();return;}
  const mode=e.target.closest('[data-mode]'); if(mode){setMode(mode.dataset.mode);return;}
  const m=e.target.closest('[data-machine]'); if(m){const machine=machines.find(x=>x.id===m.dataset.machine);if(machine){if(machine.mode==='moonlight'){showMoonlightDetails(machine);return;}if(machine.mode==='rdp'){showRDPDetails(machine);return;}if(machine.mode==='webrtc'&&machine.authType!=='broadcast'&&machine.code){try{await connect(machine,machine.code);}catch(error){openConnection(machine);$('#form-error').textContent=error.message;}}else openConnection(machine);}return;}
  const editMachine=e.target.closest('[data-edit-machine]');if(editMachine){openConnection(machines.find(x=>x.id===editMachine.dataset.editMachine));return;}
  const del=e.target.closest('[data-delete]'); if(del){machines=machines.filter(x=>x.id!==del.dataset.delete);saveStore('pccloud.machines',machines);renderMachines();toast('Đã xóa hồ sơ PC trên trình duyệt này.');return;}
  const share=e.target.closest('[data-share]'); if(share){const machine=machines.find(x=>x.id===share.dataset.share);if(!machine)return;if(machine.mode==='moonlight'){shareMoonlight(machine);return;}if(machine.mode==='rdp'){downloadRDP(machine);return;}const link=machine.mode==='webrtc'?`${machine.url}/?${machine.authType==='broadcast'?'join':'connect'}=1&name=${encodeURIComponent(machine.name)}`:machine.external;try{await navigator.clipboard.writeText(link);toast(machine.authType==='broadcast'?'Đã sao chép link. Người nhận nhập tài khoản Phát PC trong Thêm máy tính.':'Đã sao chép link. Người nhận cần mã truy cập riêng.');}catch{toast('Không sao chép được. Link PC: '+link);}return;}
  const edit=e.target.closest('[data-edit-control]'); if(edit){openControl(controls.find(c=>c.id===edit.dataset.editControl));return;}
  const remove=e.target.closest('[data-remove-control]'); if(remove){releaseAll();controls=controls.filter(c=>c.id!==remove.dataset.removeControl);persistControls();return;}
  const input=e.target.closest('[data-input]'); if(input){releaseAll();inputMode=input.dataset.input;$$('[data-input]').forEach(b=>b.classList.toggle('selected',b===input));renderTouchControls();}
});
$('#guide-top').onclick=()=>showView('guide');
$('#import-connection-config').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;const generation=rdpScanGeneration;
  $('#form-error').textContent='';
  try{
    if(file.size>65536)throw new Error('File cấu hình quá lớn. Giới hạn 64 KB.');
    const parsed=parseConnectionConfig(await file.text(),location.origin);
    if(generation!==rdpScanGeneration||!$('#connection-dialog').open)return;
    const form=$('#connection-form');form.elements.cloudAuth.value='code';setMode(parsed.mode||'webrtc');adoptConnectionMatch(machines.find(m=>m.mode===(parsed.mode||'webrtc')&&(parsed.mode==='rdp'?m.host===parsed.host:m.url===parsed.url)&&m.name===parsed.name));
    for(const field of ['name','url','code','width','fps','bitrate','host','port','username'])if(parsed[field]!==undefined)form.elements[field].value=parsed[field];
    form.dataset.nativeRoom=parsed.nativeRoom||'';form.dataset.nativeSignaling=parsed.nativeSignaling||'';
    toast(parsed.mode==='rdp'?'Đã điền thông tin RDP. Lưu máy tính để dùng lại.':'Đã tự điền cấu hình. Kiểm tra địa chỉ rồi nhấn Kết nối ngay.');
  }catch(error){$('#form-error').textContent=error.message;}
  finally{e.target.value='';}
};
$('#save-pc').onclick=()=>{try{storeMachine(readMachine());$('#connection-dialog').close();toast('Đã lưu PC và lựa chọn lưu cấu hình.');}catch(e){$('#form-error').textContent=e.message;}};
$('#connection-form').addEventListener('submit',async e=>{
 e.preventDefault();$('#form-error').textContent='';const generation=rdpScanGeneration;let committed=false;const submit=$('#connect-submit');if(submit.disabled)return;submit.disabled=true;
 try{
  const machine=readMachine(),code=e.target.elements.code.value;let guest=null;
  if(machine.mode==='webrtc'&&machine.authType==='broadcast')guest=await CloudBroadcast.authenticate(machine,e.target.elements.broadcastPassword.value);
  else if(machine.mode==='webrtc'&&machine.url===location.origin&&!code)throw Error('Nhập mã truy cập trong config.json trên PC.');
  if(generation!==rdpScanGeneration||!$('#connection-dialog').open)return;storeMachine(machine);committed=true;$('#connection-dialog').close();e.target.elements.code.value='';e.target.elements.broadcastPassword.value='';
  if(machine.mode==='moonlight')showMoonlightDetails(machine);else if(machine.mode==='rdp')showRDPDetails(machine);else if(['external','parsec'].includes(machine.mode))window.open(machine.external,'_blank','noopener,noreferrer');
  else if(guest)await connect({...machine,nativeRoom:guest.room,nativeSignaling:machine.url.replace(/^http/,'ws')+'/signal'},guest.ticket);else await connect(machine,code);
 }catch(error){if(generation!==rdpScanGeneration||(!committed&&!$('#connection-dialog').open))return;if(!$('#connection-dialog').open)$('#connection-dialog').showModal();$('#form-error').textContent=error.message;}finally{if(generation===rdpScanGeneration)submit.disabled=false;}
});
$('#demo-button').onclick=async()=>{await disconnect();openSession('Khám phá PC Cloud',true);toast('Đây là giao diện mẫu. Chưa truyền hình ảnh hoặc điều khiển PC.');};
$('#disconnect').onclick=disconnect;
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#session').requestFullscreen();}catch{toast('Trình duyệt này không hỗ trợ toàn màn hình. Hãy xoay ngang điện thoại.');}};
$('#keyboard-toggle').onclick=()=>{$('#keyboard-panel').hidden=!$('#keyboard-panel').hidden;};
$('#edit-layout').onclick=()=>{openSettings();if(!layoutEditing)beginLayoutEdit();};
$('#new-control').onclick=()=>openControl();
$('#control-form').elements.action.onchange=e=>{$('#key-fields').hidden=e.target.value!=='key';$('#joystick-fields').hidden=true;renderDashboardDirections();};
$('#base-key').innerHTML=Object.entries(keyNames).map(([vk,name])=>`<option value="${vk}">${escapeHTML(name)}</option>`).join('');
for(const name of ['baseKey','withCtrl','withShift','withAlt']) $('#control-form').elements[name].onchange=()=>{const f=$('#control-form');recordedKeys=[...new Set([...(f.elements.withCtrl.checked?[17]:[]),...(f.elements.withShift.checked?[16]:[]),...(f.elements.withAlt.checked?[18]:[]),Number(f.elements.baseKey.value)])];f.elements.keys.value=recordedKeys.map(k=>keyNames[k]||k).join(' + ');};
$('#control-form').elements.keys.onkeydown=e=>{e.preventDefault();const vk=keyCode(e);if(!vk)return;recordedKeys=[...new Set([...(e.ctrlKey?[17]:[]),...(e.altKey?[18]:[]),...(e.shiftKey?[16]:[]),...(e.metaKey?[91]:[]),vk])];e.target.value=recordedKeys.map(k=>keyNames[k]||k).join(' + ');};
$('#control-form').onsubmit=e=>{e.preventDefault();const f=e.target;const id=f.elements.id.value;const existing=controls.find(c=>c.id===id);if(f.elements.action.value==='key'&&!recordedKeys.length){$('#control-error').textContent='Nhấn một phím tại ô Phím.';return;}if(!id&&controls.length>=40){$('#control-error').textContent='Tối đa 40 nút trên một bố cục.';return;}const c={...existing,id:id||uid(),label:f.elements.label.value.trim(),action:f.elements.action.value,keys:f.elements.action.value==='joystick'?[...joystickDraft]:[...recordedKeys],hold:f.elements.hold.checked,x:existing?.x||50,y:existing?.y||50};if(c.action==='joystick'){c.shape='circle';c.size=existing?.action==='joystick'?existing.size||120:120;c.hold=true;}releaseAll();if(existing)controls[controls.indexOf(existing)]=c;else controls.push(c);persistControls();$('#control-dialog').close();toast(layoutEditing ? 'Đã cập nhật nút. Lưu profile để giữ thay đổi.' : 'Đã lưu nút điều khiển.');};
$('#preset').onchange=e=>{if(e.target.value==='custom')return;releaseAll();controls=presetControls(e.target.value);persistControls();};
$('#reset-controls').onclick=()=>{releaseAll();controls=presetControls($('#preset').value);persistControls();};
$('#export-controls').onclick=()=>download('pccloud-controls.json',JSON.stringify({version:1,controls},null,2),'application/json');
$('#import-controls').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>64000)throw new Error('File quá lớn.');const data=JSON.parse(await file.text());if(!Array.isArray(data.controls)||!data.controls.length||data.controls.length>40||!data.controls.every(validControl))throw new Error('File bố cục không hợp lệ.');releaseAll();controls=data.controls.map(c=>({...c,id:uid()}));persistControls();toast('Đã nhập bố cục.');}catch(error){toast(error.message);}e.target.value='';};
window.addEventListener('keydown',e=>{if(!activeSession||isConfiguring()||selfHostViewOnly)return;const vk=keyCode(e);if(!vk)return;e.preventDefault();if(e.repeat)return;holdControl(control(keyNames[vk]||'', [vk],50,50),true,`key-${e.code}`);});
window.addEventListener('keyup',e=>{if(!activeSession)return;const c=heldInputs.get(`key-${e.code}`);if(c){e.preventDefault();holdControl(c,false,`key-${e.code}`);}});
window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});window.addEventListener('pagehide',()=>{releaseAll();peer?.close();});
const pointers=new Map();
$('#device-label').innerHTML=matchMedia('(pointer:coarse)').matches?'Điện thoại <em>cảm ứng</em>':'Trình duyệt <em>bàn phím / chuột</em>';
renderMachines();renderControls();buildKeyboard();renderSavedRDP();
const params=new URLSearchParams(location.search);if(params.get('connect')==='1'){openConnection({name:params.get('name')||'My Gaming PC',mode:'webrtc',url:location.origin});history.replaceState({},'',location.pathname);}

// Clicking a dialog backdrop dismisses the open editor without submitting it.
for(const dialog of document.querySelectorAll('dialog')){let outsideDown=false;const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};dialog.addEventListener('pointerdown',e=>{outsideDown=e.target===dialog&&outside(e);});dialog.addEventListener('click',e=>{if(outsideDown&&e.target===dialog&&outside(e))dialog.close();outsideDown=false;});}

$('#dashboard-add-movement').onclick=()=>{const stick=$('#dashboard-movement').value==='joystick';const retained=CloudTouch.withoutMovement(controls);if(retained.length+(stick?1:4)>40){toast('Tối đa 40 nút.');return;}releaseAll();controls=retained;if(stick)controls.push({...control('Di chuyển',[87,65,83,68],18,75,true,'joystick'),shape:'circle',size:120,movement:true});else controls.push(...[[87,18,62],[65,10,78],[83,18,78],[68,26,78]].map(([vk,x,y])=>({...control(keyNames[vk],[vk],x,y),movement:true})));persistControls();toast('Đã thêm bộ di chuyển. Lưu profile để giữ bố cục.');};

function pickDashboardKeys(){CloudKeyPicker.open({keys:recordedKeys,title:'Chọn các phím bấm cùng lúc · ví dụ R + T',onApply:keys=>{recordedKeys=keys;const f=$('#control-form');f.elements.keys.value=CloudKeyPicker.label(keys);f.elements.label.value=CloudKeyPicker.label(keys).slice(0,18);}});}
$('#dashboard-pick-keys').onclick=pickDashboardKeys;
function renderDashboardDirections(){const area=$('#joystick-direction-picker');area.replaceChildren();area.hidden=$('#control-form').elements.action.value!=='joystick';if(area.hidden)return;for(const index of [0,2,1,3]){const b=document.createElement('button');b.type='button';b.className='button secondary';b.textContent=['Lên','Trái','Xuống','Phải'][index]+': '+CloudKeyPicker.label([joystickDraft[index]]);b.onclick=()=>CloudKeyPicker.open({single:true,keys:[joystickDraft[index]],title:'Chọn phím hướng '+['lên','trái','xuống','phải'][index],onApply:keys=>{const next=[...joystickDraft];next[index]=keys[0];if(new Set(next).size!==4)throw Error('Bốn hướng cần bốn phím khác nhau.');joystickDraft=next;renderDashboardDirections();}});area.append(b);}}

// Saved RDP endpoints are displayed directly; credentials remain managed by Windows.
let displayedRDP = null;
function rdpAddress(machine){return CloudRDP.address(machine);}
function renderSavedRDP(){
  const list=$('#saved-rdp-list');if(!list)return;list.replaceChildren();
  for(const machine of machines.filter(m=>m.mode==='rdp')){
    const button=document.createElement('button');button.type='button';button.className='button secondary';
    button.textContent=machine.name+' · '+rdpAddress(machine);button.onclick=()=>{$('#connection-dialog').close();showRDPDetails(machine);};list.append(button);
  }
  $('#saved-rdp-section').hidden=!list.childElementCount;
}
function showRDPDetails(machine){
  try{displayedRDP=CloudRDP.validate(machine);}catch(error){toast(error.message);return;}
  $('#rdp-pc-name').textContent=machine.name;
  $('#rdp-address').textContent=rdpAddress(displayedRDP);
  $('#rdp-username').textContent=displayedRDP.username||'Chưa lưu tài khoản Windows';
  $('#rdp-copy-username').disabled=!displayedRDP.username;
  if(!$('#rdp-details').open)$('#rdp-details').showModal();
}
for(const [id,field] of [['rdp-copy-address','address'],['rdp-copy-username','username']])$('#'+id).onclick=async()=>{
  const value=field==='address'?rdpAddress(displayedRDP):displayedRDP.username;
  try{await navigator.clipboard.writeText(value);toast('Đã sao chép.');}catch{toast('Không sao chép tự động được. Chọn thông tin trên bảng để sao chép.');}
};
$('#rdp-download').onclick=()=>downloadRDP(displayedRDP);
$('#rdp-edit').onclick=()=>{$('#rdp-details').close();openConnection(machines.find(m=>m.id===displayedRDP.id)||displayedRDP);};


$('#rdp-scan').onclick=async()=>{
  const generation=rdpScanGeneration,button=$('#rdp-scan'),status=$('#rdp-scan-status');
  button.disabled=true;button.textContent='Đang quét…';status.hidden=false;$('#rdp-open-local').hidden=true;status.textContent='Đang đọc thông tin PC qua dịch vụ CloudPC local…';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  const endpoint=['localhost','127.0.0.1','[::1]'].includes(location.hostname)?new URL('/api/rdp-info',location.origin):new URL('http://127.0.0.1:8443/api/rdp-info');
  try{
    const response=await fetch(endpoint,{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('Không đọc được thông tin PC.');
    const info=await response.json(),parsed=CloudRDP.validate(info);
    if(generation!==rdpScanGeneration||!$('#connection-dialog').open||activeMode!=='rdp')return;
    const form=$('#connection-form');
    adoptConnectionMatch(machines.find(m=>m.mode==='rdp'&&m.host===parsed.host&&Number(m.port)===parsed.port&&m.username===parsed.username));
    for(const field of ['name','host','port','username'])form.elements[field].value=parsed[field]||'';
    form.dataset.nativeRoom='';form.dataset.nativeSignaling='';
    status.textContent='Đã quét '+info.name+' · '+info.edition+'. '+info.message;
    status.classList.toggle('rdp-not-ready',!info.rdpSupported||!info.rdpEnabled);
    $('#form-error').textContent='';
  }catch{
    if(generation!==rdpScanGeneration)return;
    status.textContent='Chưa quét được. Trên PC cần quét, chạy open_web.bat trong thư mục CloudPC rồi mở http://127.0.0.1:8443 và bấm Quét máy này. Trên điện thoại, dùng hồ sơ/file đã lưu từ PC.';
    status.classList.add('rdp-not-ready');$('#rdp-open-local').hidden=false;
  }finally{clearTimeout(timeout);button.disabled=false;button.textContent='⌕ Quét máy này';}
};
$('#rdp-export').onclick=()=>{
  try{downloadRDP(readMachine());$('#form-error').textContent='';}
  catch(error){$('#form-error').textContent=error.message;}
};

if(params.get('rdp')==='scan'){
  openConnection({mode:'rdp',name:'PC của tôi'});
  $('#rdp-scan').click();
  history.replaceState({},'',location.pathname);
}
