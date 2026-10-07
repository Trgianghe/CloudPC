// Emulator-style tools extend the existing native player; edits never inject input.
(() => {
 $('#control-size').oninput=$('#control-size').onchange;
 const editor=$('#editor'),palette=document.createElement('div');palette.className='control-palette';
 const kinds=[['Phím / combo','key'],['Di chuyển','move'],['Nhìn quanh','look'],['Chuột trái','left'],['Chuột phải','right']];
 for(const [label,kind] of kinds){const b=document.createElement('button');b.type='button';b.className='small-action';b.textContent=label;b.onclick=()=>{
  if(!S.editing||controls.length>=40)return;releaseAll();
  if(kind==='key'){createPlacedControl(50,50);return;}
  const stick=kind==='move'||kind==='look',c={id:crypto.randomUUID(),label,action:stick?'joystick':kind,stickMode:kind==='look'?'look':'move',vk:87,keys:stick?[87,65,83,68]:[87],hold:true,opacity:.65,x:kind==='look'?78:50,y:70,size:stick?120:60,shape:'circle',movement:kind==='move'};
  controls.push(c);renderControls();selectControl(c);
 };palette.append(b);}editor.prepend(palette);
 const kindLabel=document.createElement('label');kindLabel.textContent='Chức năng joystick';const selector=document.createElement('select');selector.className='input';selector.innerHTML='<option value="move">Di chuyển · 4 phím tùy chọn</option><option value="look">Nhìn xung quanh · chuột tương đối</option>';kindLabel.append(selector);editor.querySelector('.editor-grid').append(kindLabel);
 const oldSelect=selectControl;selectControl=function(c){oldSelect(c);kindLabel.hidden=c.action!=='joystick';selector.value=c.stickMode==='look'?'look':'move';$('#direction-keys').hidden=c.action==='joystick'&&c.stickMode==='look';$('#pick-control-keys').hidden=c.action==='joystick';$('#control-size').max=c.action==='joystick'?240:200;const look=c.action==='joystick'&&c.stickMode==='look';$('#movement-kind').closest('label').hidden=look;$('#add-movement').hidden=look;};
 selector.onchange=()=>{const c=controls.find(c=>c.id===selectedControl);if(!c)return;releaseAll();c.stickMode=selector.value;c.movement=selector.value==='move';renderControls();selectControl(c);};
 const oldRender=renderControls;renderControls=function(){oldRender();if(!S.editing)return;for(const b of $$('.touch-key')){
  const c=controls.find(c=>c.id===b.dataset.id);if(!c)continue;const handle=document.createElement('span');handle.className='control-resize';handle.textContent='↘';handle.setAttribute('aria-label','Kéo để đổi kích thước');let start=null;
  handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();releaseAll();selectControl(c);start={id:e.pointerId,x:e.clientX,y:e.clientY,size:c.size};handle.setPointerCapture(e.pointerId);};
  handle.onpointermove=e=>{if(!start||e.pointerId!==start.id)return;e.preventDefault();e.stopPropagation();c.size=Math.round(Math.max(36,Math.min(c.action==='joystick'?240:200,start.size+Math.max(e.clientX-start.x,e.clientY-start.y)*2)));b.style.width=b.style.height=c.size+'px';$('#control-size').value=c.size;};
  const end=e=>{e.stopPropagation();start=null;};handle.onpointerup=end;handle.onpointercancel=end;handle.onlostpointercapture=end;b.append(handle);
 }};
})();
