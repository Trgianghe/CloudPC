(() => {
 'use strict';
 const model=CloudPCPreferences;
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.view='settings';nav.innerHTML='<span>⚙</span>Cài đặt';document.querySelector('.sidebar nav').append(nav);
 const view=document.createElement('section');view.id='settings';view.className='view';view.hidden=true;
 view.innerHTML=`<div class="page-heading"><div><p class="eyebrow">YOUR DEFAULTS</p><h1>Cài đặt <span>mặc định.</span></h1><p>Một bộ cài đặt cho mọi PC. Điều chỉnh riêng từng máy trong Cloud PC Settings.</p></div></div>
 <form id="default-settings-form" class="defaults-panel"><div class="defaults-heading"><h3>Hình ảnh & phản hồi</h3><p>Áp dụng khi mở phiên web mới, kể cả PC đã lưu trước đây.</p></div><div class="defaults-grid">
 <label><span>Độ phân giải</span><select name="preset"><option value="720p120">HD · 1280 × 720</option><option value="1080p120">Full HD · 1920 × 1080</option><option value="2k60">2K · 2560 × 1440</option><option value="4k60">4K · 3840 × 2160</option></select></label>
 <label><span>FPS mục tiêu</span><input name="fps" type="number" min="0" max="500" required><small>0 = không khóa FPS; hiệu năng phụ thuộc host.</small></label>
 <label><span>Bitrate (Mbps)</span><input name="bitrate" type="number" min="5" max="100" required></label>
 <label><span>Codec</span><select name="codec"><option value="h264">H.264 · tương thích rộng</option><option value="av1">AV1</option><option value="hevc">HEVC</option></select><small>Host và trình duyệt phải hỗ trợ codec đã chọn.</small></label>
 <label><span>Bộ đệm nhận</span><select name="playoutDelay"><option value="0">Ưu tiên phản hồi nhanh</option><option value="30">Ổn định khi mạng dao động</option></select></label>
 <label><span>Độ nhạy chuột</span><input name="sensitivity" type="number" min="0.2" max="3" step="0.1" required></label>
 <label><span>Âm lượng (%)</span><input name="volume" type="number" min="0" max="100" required></label></div>
 <div class="defaults-heading"><h3>Trong phiên chơi</h3></div><div class="defaults-toggles">
 <label><input name="adaptive" type="checkbox"><span>Tự giảm tải khi hình trễ</span></label>
 <label><input name="sound" type="checkbox"><span>Phát âm thanh PC</span></label>
 <label><input name="hideControls" type="checkbox"><span>Ẩn nút cảm ứng</span></label>
 <label><input name="hud" type="checkbox"><span>Hiện thông số khi chơi</span></label>
 <label><input name="awake" type="checkbox"><span>Giữ màn hình sáng</span></label></div>
 <p class="field-hint">Cài đặt lưu trên trình duyệt này và dùng cho phiên PC Cloud Web. PC có tùy chỉnh riêng sẽ giữ các mục đã đổi. Trong Cloud PC Settings, chọn “Dùng mặc định chung” để bỏ tùy chỉnh riêng.</p>
 <div class="defaults-actions"><button class="button primary" type="submit">Lưu mặc định</button><button class="button secondary" type="button" id="factory-defaults">Khôi phục mặc định</button><span id="defaults-status" role="status"></span></div></form>`;
 document.querySelector('main').append(view);
 const connection=document.querySelector('#connection-form');
 connection.querySelector('.performance-picks').hidden=true;
 for(const name of ['width','fps','bitrate'])connection.elements[name].closest('label').hidden=true;
 const note=document.createElement('p');note.className='field-hint';note.textContent='Chất lượng theo cài đặt mặc định chung. Bạn có thể chỉnh riêng sau khi kết nối trong Cloud PC Settings.';$('#webrtc-fields').append(note);
 const form=view.querySelector('form'),msg=view.querySelector('#defaults-status');
 function fill(p){for(const [key,value] of Object.entries(p)){const el=form.elements[key];if(!el)continue;if(el.type==='checkbox')el.checked=value;else el.value=value;}}
 function load(){try{fill(model.defaults(localStorage));}catch{fill(model.factory);msg.textContent='Trình duyệt đang chặn lưu cài đặt.';}}
 const previous=showView;showView=function(name){previous(name);if(name==='settings'){$('#view-label').textContent='Cài đặt';load();}};
 form.onsubmit=e=>{e.preventDefault();const value={};for(const key of Object.keys(model.factory)){const el=form.elements[key];value[key]=el.type==='checkbox'?el.checked:el.type==='number'||key==='playoutDelay'?Number(el.value):el.value;}try{fill(model.saveDefaults(localStorage,value));msg.textContent='Đã lưu · áp dụng từ lần kết nối tiếp theo.';}catch{msg.textContent='Không lưu được. Kiểm tra quyền lưu trữ của trình duyệt.';}};
 $('#factory-defaults').onclick=()=>{fill(model.factory);msg.textContent='Đã điền mặc định ban đầu. Bấm Lưu mặc định để áp dụng.';};load();
})();
