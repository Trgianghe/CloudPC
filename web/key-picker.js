(function(root){
  'use strict';
  const names={8:'Backspace',9:'Tab',13:'Enter',16:'Shift',17:'Ctrl',18:'Alt',27:'Esc',32:'Space',33:'PgUp',34:'PgDn',35:'End',36:'Home',37:'←',38:'↑',39:'→',40:'↓',45:'Ins',46:'Del',91:'Win',186:';',187:'=',188:',',189:'-',190:'.',191:'/',192:'`',219:'[',220:']',221:'\\',222:"'"};
  for(let k=48;k<=90;k++)if(k<=57||k>=65)names[k]=String.fromCharCode(k);
  for(let k=112;k<=123;k++)names[k]='F'+(k-111);
  const label=keys=>keys.map(k=>names[k]||'VK '+k).join(' + ');
  const rows=[[27,...Array.from({length:12},(_,i)=>112+i)],[192,...Array.from({length:10},(_,i)=>i===9?48:49+i),189,187,8],[9,...'QWERTYUIOP'.split('').map(c=>c.charCodeAt(0)),219,220,221],[20,...'ASDFGHJKL'.split('').map(c=>c.charCodeAt(0)),186,222,13],[16,...'ZXCVBNM'.split('').map(c=>c.charCodeAt(0)),188,190,191],[17,91,18,32,45,46,36,35,33,34,37,38,40,39]];
  names[20]='Caps';
  let dialog,state,output,manual,error,mouseRow;
  function choose(keys,vk,single){if(single)return [vk];return keys.includes(vk)?keys.filter(k=>k!==vk):keys.length<6?[...keys,vk]:keys;}
  function refresh(){output.textContent=state.keys.length?label(state.keys):'Chạm một hoặc nhiều phím';manual.value=state.keys.length?state.keys.join(', '):'';for(const b of dialog.querySelectorAll('[data-vk]'))b.setAttribute('aria-pressed',String(state.keys.includes(Number(b.dataset.vk))));}
  function build(){
    dialog=document.createElement('dialog');dialog.className='key-picker';dialog.setAttribute('aria-label','Bàn phím chọn nút');
    const header=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');title.id='key-picker-title';close.type='button';close.textContent='×';close.setAttribute('aria-label','Đóng bàn phím');close.onclick=()=>dialog.close();header.append(title,close);dialog.append(header);
    output=document.createElement('p');output.className='key-picker-selection';dialog.append(output);
    const keyboard=document.createElement('div');keyboard.className='key-picker-board';
    for(const row of rows){const line=document.createElement('div');line.className='key-picker-row';for(const vk of row){const b=document.createElement('button');b.type='button';b.dataset.vk=vk;b.textContent=names[vk];b.setAttribute('aria-label',names[vk]);b.onclick=()=>{state.keys=choose(state.keys,vk,state.single);error.textContent='';refresh();};line.append(b);}keyboard.append(line);}dialog.append(keyboard);
    mouseRow=document.createElement('div');mouseRow.className='key-picker-row';for(const [name,action] of [['Chuột trái','left'],['Chuột phải','right'],['Chuột giữa','middle']]){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{state.onMouse?.(action);dialog.close();};mouseRow.append(b);}dialog.append(mouseRow);
    const manualLabel=document.createElement('label');manualLabel.textContent='Nhập thủ công (R + T hoặc mã phím 82, 84)';manual=document.createElement('input');manual.type='text';manual.autocomplete='off';manualLabel.append(manual);dialog.append(manualLabel);
    error=document.createElement('p');error.className='key-picker-error';error.setAttribute('role','alert');dialog.append(error);
    const footer=document.createElement('footer'),clear=document.createElement('button'),apply=document.createElement('button');clear.type=apply.type='button';clear.textContent='Xóa chọn';clear.onclick=()=>{state.keys=[];refresh();};apply.textContent='Dùng các phím đã chọn';apply.onclick=()=>{try{const keys=CloudTouch.combo(manual.value);if(state.single&&keys.length!==1)throw Error('Chọn một phím cho hướng này.');state.onApply(keys);dialog.close();}catch(e){error.textContent=e.message;}};footer.append(clear,apply);dialog.append(footer);
    dialog.addEventListener('pointerdown',e=>e.stopPropagation());dialog.addEventListener('keydown',e=>e.stopPropagation());document.body.append(dialog);
  }
  function open(options){if(!dialog)build();state={keys:[...(options.keys||[])],single:options.single===true,onApply:options.onApply,onMouse:options.onMouse};mouseRow.hidden=typeof options.onMouse!=='function';dialog.querySelector('#key-picker-title').textContent=options.title||'Chọn phím bất kỳ · tối đa 6 phím cùng lúc';error.textContent='';refresh();if(!dialog.open)dialog.showModal();}
  root.CloudKeyPicker={open,label,choose};
  if(typeof module==='object')module.exports=root.CloudKeyPicker;
})(globalThis);
