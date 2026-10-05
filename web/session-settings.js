'use strict';
const cloneLayout = value => JSON.parse(JSON.stringify(value));
let drawerOpen = false;
let layoutSnapshot = null;
let selectedControlId = null;
let profileData = readStore('pccloud.profiles', {version:1,activeId:null,profiles:[]});
if (!profileData || !Array.isArray(profileData.profiles)) profileData = {version:1,activeId:null,profiles:[]};
profileData.profiles = profileData.profiles.filter(p => typeof p.id==='string' && typeof p.name==='string' && p.name.length<=48 && Array.isArray(p.controls) && p.controls.length<=40 && p.controls.every(validControl));
const initialProfile = profileData.profiles.find(p=>p.id===profileData.activeId);
if(initialProfile){ controls=cloneLayout(initialProfile.controls); persistControls(); }

function isConfiguring() { return layoutEditing || drawerOpen || $('#control-dialog').open; }
const settingsUI = document.createElement('div');
settingsUI.innerHTML = `
  <button id="settings-handle" class="settings-handle" data-session-ui aria-label="Kéo sang trái để mở cài đặt" aria-expanded="false" aria-controls="session-settings"><span class="handle-bar"></span><small>Cài đặt</small></button>
  <aside id="session-settings" class="settings-drawer" data-session-ui aria-label="Cài đặt trong game" hidden>
    <div class="settings-title"><h3>Cài đặt trong game</h3><button id="close-settings" class="icon-button" aria-label="Đóng cài đặt">×</button></div>
    <p id="settings-mode-hint">Thao tác trong menu không gửi vào PC. Đóng menu để tiếp tục điều khiển.</p>
    <button id="start-layout-edit" class="button primary wide">✎ Chỉnh vị trí và hình dạng nút</button>
    <div id="layout-edit-settings" hidden>
      <p>Kéo nút đến bất kỳ vị trí nào. Chạm một nút để chọn, rồi đổi hình dạng bên dưới.</p>
      <div class="selected-settings"><h4 id="selected-control-name">Chọn một nút trên màn hình</h4><div id="selected-control-fields" hidden>
        <label>Hình dạng nút<select id="button-shape"><option value="circle">Hình tròn</option><option value="square">Hình vuông</option></select></label>
        <label>Kích thước <output id="button-size-value">52 px</output><input id="button-size" type="range" min="36" max="100" step="2" value="52"></label>
        <label>Độ trong suốt <output id="button-opacity-value">80%</output><input id="button-opacity" type="range" min="25" max="100" step="5" value="80"></label>
        <div class="settings-row"><button id="edit-selected-control" class="button secondary">Sửa phím</button><button id="delete-selected-control" class="button secondary">Xóa nút</button></div>
      </div></div>
      <button id="add-session-control" class="button secondary wide">＋ Thêm nút</button>
    </div>
    <div class="settings-divider"></div>
    <h3>Profile của bạn</h3><p id="active-profile-label">Chưa chọn profile</p>
    <div id="session-profiles"></div>
    <form id="save-profile-form"><label>Tên profile<input id="profile-name" maxlength="48" required placeholder="VD: FPS · 4 ngón"></label><button class="button primary wide" type="submit">Lưu profile & dùng bố cục này</button></form>
    <p id="profile-status" class="profile-save-status" role="status"></p>
    <button id="cancel-layout-edit" class="button secondary wide" hidden>Hủy thay đổi</button>
    <div class="settings-divider"></div>
    <label class="check-label"><input id="show-session-stats" type="checkbox" checked> Hiện thông số kết nối</label>
    <button id="settings-fullscreen" class="button secondary wide">⛶ Bật / tắt toàn màn hình</button>
    <div class="settings-caption">Profile lưu trên trình duyệt này. Profile được chọn gần nhất tự nạp khi mở lại.</div>
  </aside>
  <div id="layout-edit-banner" class="edit-banner" data-session-ui hidden><strong>✎ Đang chỉnh nút</strong><span class="edit-explanation">Không gửi thao tác vào game</span><button id="show-save-profile">Lưu</button><button id="banner-cancel-edit">Hủy</button></div>`;
while(settingsUI.firstElementChild) $('#stage').append(settingsUI.firstElementChild);

function renderProfiles() {
  const active=profileData.profiles.find(p=>p.id===profileData.activeId);
  $('#active-profile-label').textContent=active?`Đang dùng: ${active.name}`:'Chưa chọn profile';
  $('#session-profiles').innerHTML=profileData.profiles.length?profileData.profiles.map(p=>`<div class="profile-entry"><button type="button" data-load-profile="${escapeHTML(p.id)}" class="${p.id===profileData.activeId?'active':''}"><span>${escapeHTML(p.name)}</span><small>${p.controls.length} nút · Nạp ↗</small></button></div>`).join(''):'<div class="profile-empty">Lưu bố cục đầu tiên để chọn lại nhanh.</div>';
}
function openSettings() {
  if(!activeSession) return;
  releaseAll(); pointers.clear(); drawerOpen=true;
  $('#session-settings').hidden=false;$('#session').classList.add('session-settings-open');
  $('#settings-handle').setAttribute('aria-expanded','true');
  $('#keyboard-panel').hidden=true;
  renderProfiles();
}
function closeSettings() {
  drawerOpen=false;$('#session-settings').hidden=true;
  $('#session').classList.remove('session-settings-open');$('#settings-handle').setAttribute('aria-expanded','false');
}
function updateEditor() {
  $('#session').classList.toggle('session-editing',layoutEditing);
  $('#layout-edit-settings').hidden=!layoutEditing;$('#layout-edit-banner').hidden=!layoutEditing;
  $('#cancel-layout-edit').hidden=!layoutEditing;$('#start-layout-edit').hidden=layoutEditing;
  $$('.control-modes button').forEach(button=>button.disabled=layoutEditing);
  $('#edit-layout').textContent=layoutEditing?'✎ Đang chỉnh nút':'✎ Bố cục';
  $('#settings-mode-hint').textContent=layoutEditing?'Đang chỉnh bố cục. Game vẫn chạy; mọi thao tác điều khiển PC đã được chặn.':'Thao tác trong menu không gửi vào PC. Đóng menu để tiếp tục điều khiển.';
  if(!layoutEditing){selectedControlId=null;delete $('#stage').dataset.selectedControl;}
  renderTouchControls();
}
function beginLayoutEdit() {
  releaseAll();pointers.clear();
  if(!layoutEditing) layoutSnapshot=cloneLayout(controls);
  layoutEditing=true;inputMode='game';$('#keyboard-panel').hidden=true;
  $$('[data-input]').forEach(b=>b.classList.toggle('selected',b.dataset.input==='game'));
  const active=profileData.profiles.find(p=>p.id===profileData.activeId);
  $('#profile-name').value=active?.name||'';$('#profile-status').textContent='';
  updateEditor();
  if(controls.length)selectSessionControl(controls[0].id);
}
function selectSessionControl(id) {
  if(!layoutEditing)return;
  selectedControlId=id;const c=controls.find(c=>c.id===id);
  $('#stage').dataset.selectedControl=id;
  $$('.touch-key').forEach(b=>b.classList.toggle('selected-control',b.dataset.controlId===id));
  $('#selected-control-fields').hidden=!c;
  $('#selected-control-name').textContent=c?`Nút: ${c.label}`:'Chọn một nút trên màn hình';
  if(c){$('#button-shape').value=c.shape||'square';$('#button-size').value=c.size||52;$('#button-opacity').value=c.opacity||80;$('#button-size-value').textContent=`${c.size||52} px`;$('#button-opacity-value').textContent=`${c.opacity||80}%`;}
}
function cancelLayoutEdit(notify=true) {
  if(layoutEditing&&layoutSnapshot){controls=cloneLayout(layoutSnapshot);}
  layoutEditing=false;layoutSnapshot=null;updateEditor();renderControls();
  if(notify){closeSettings();toast('Đã hủy thay đổi bố cục.');}
}
function loadProfile(id) {
  const p=profileData.profiles.find(p=>p.id===id);if(!p)return;
  const next={...profileData,activeId:id};if(!saveStore('pccloud.profiles',next))return;
  releaseAll();pointers.clear();profileData=next;controls=cloneLayout(p.controls);
  layoutEditing=false;layoutSnapshot=null;updateEditor();persistControls();
  $('#profile-name').value=p.name;$('#profile-status').textContent=`Đã nạp ${p.name}`;renderProfiles();
  toast(`Đã nạp profile ${p.name}. Đóng menu để chơi.`);
}
function saveProfile(e) {
  e.preventDefault();const name=$('#profile-name').value.trim();
  if(!name){$('#profile-status').textContent='Nhập tên profile trước khi lưu.';return;}
  const existing=profileData.profiles.find(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase());
  if(!existing&&profileData.profiles.length>=40){$('#profile-status').textContent='Tối đa 40 profile trên trình duyệt này.';return;}
  const p={id:existing?.id||uid(),name,controls:cloneLayout(controls)};
  const next={version:1,activeId:p.id,profiles:existing?profileData.profiles.map(item=>item.id===p.id?p:item):[...profileData.profiles,p]};
  if(!saveStore('pccloud.profiles',next)){$('#profile-status').textContent='Chưa lưu được. Trình duyệt đang chặn bộ nhớ.';return;}
  profileData=next;layoutEditing=false;layoutSnapshot=null;updateEditor();persistControls();renderProfiles();closeSettings();toast(`Đã lưu profile “${name}”.`);
}
function changeSelected(property,value){const c=controls.find(c=>c.id===selectedControlId);if(!layoutEditing||!c)return;c[property]=value;renderTouchControls();selectSessionControl(c.id);}
$('#button-shape').onchange=e=>changeSelected('shape',e.target.value);
$('#button-size').oninput=e=>changeSelected('size',Number(e.target.value));
$('#button-opacity').oninput=e=>changeSelected('opacity',Number(e.target.value));
$('#start-layout-edit').onclick=beginLayoutEdit;
$('#close-settings').onclick=closeSettings;
$('#cancel-layout-edit').onclick=()=>cancelLayoutEdit();$('#banner-cancel-edit').onclick=()=>cancelLayoutEdit();
$('#show-save-profile').onclick=()=>{openSettings();$('#profile-name').focus();};
$('#save-profile-form').onsubmit=saveProfile;
$('#session-profiles').onclick=e=>{const button=e.target.closest('[data-load-profile]');if(button)loadProfile(button.dataset.loadProfile);};
$('#add-session-control').onclick=()=>{if(!layoutEditing)beginLayoutEdit();openControl();};
$('#edit-selected-control').onclick=()=>{const c=controls.find(c=>c.id===selectedControlId);if(c)openControl(c);};
$('#delete-selected-control').onclick=()=>{controls=controls.filter(c=>c.id!==selectedControlId);selectedControlId=null;delete $('#stage').dataset.selectedControl;persistControls();selectSessionControl(controls[0]?.id||'');};
$('#show-session-stats').onchange=e=>$('.session-stats').hidden=!e.target.checked;
$('#settings-fullscreen').onclick=()=>$('#fullscreen').click();

// Horizontal touch gesture opens the panel; tapping also works for mouse and accessibility.
let handleGesture=null, ignoreHandleClick=false;
$('#settings-handle').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();handleGesture={id:e.pointerId,x:e.clientX};ignoreHandleClick=false;e.currentTarget.setPointerCapture(e.pointerId);});
$('#settings-handle').addEventListener('pointermove',e=>{if(!handleGesture||handleGesture.id!==e.pointerId)return;if(Math.abs(e.clientX-handleGesture.x)>18){ignoreHandleClick=true;if(e.clientX<handleGesture.x)openSettings();else closeSettings();}});
$('#settings-handle').addEventListener('pointerup',()=>{handleGesture=null;});
$('#settings-handle').addEventListener('pointercancel',()=>{handleGesture=null;ignoreHandleClick=true;});
$('#settings-handle').onclick=()=>{if(ignoreHandleClick){ignoreHandleClick=false;return;}drawerOpen?closeSettings():openSettings();};
$('#session-settings').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSettings();$('#settings-handle').focus();}});

// Preserve draft styling when the existing key editor changes a binding.
$('#control-form').addEventListener('submit',()=>{if(layoutEditing){selectSessionControl($('#control-form').elements.id.value||controls.at(-1)?.id);}});
const originalOpenControl=openControl;
openControl=function(c=null){const dialog=$('#control-dialog');if(activeSession){$('#session').append(dialog);}else document.body.append(dialog);originalOpenControl(c);};
const originalOpenSession=openSession;
openSession=function(...args){closeSettings();originalOpenSession(...args);layoutSnapshot=null;selectedControlId=null;delete $('#stage').dataset.selectedControl;updateEditor();renderProfiles();};
const originalDisconnect=disconnect;
disconnect=async function(){cancelLayoutEdit(false);closeSettings();await originalDisconnect();};
$('#disconnect').onclick=disconnect;
renderProfiles();
