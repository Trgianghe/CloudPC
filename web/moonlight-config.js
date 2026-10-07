(function(root){
 'use strict';
 function validate(value){
  const host=String(value?.host||'').trim(),name=String(value?.name??'Moonlight PC').trim();
  if(!/^[a-zA-Z0-9.\-:\[\]]{1,253}$/.test(host)||['0.0.0.0','::','[::]'].includes(host)||!name||name.length>80)throw Error('Nhập IP/hostname PC chạy Sunshine hợp lệ.');
  return {mode:'moonlight',name,host};
 }
 function link(value){const machine=validate(value),url=new URL('https://trgianghe.github.io/CloudPC/');url.searchParams.set('moonlightHost',machine.host);url.searchParams.set('name',machine.name);return url.href;}
 function fromLink(raw){const url=new URL(raw);if(!url.searchParams.has('moonlightHost'))return null;return validate({host:url.searchParams.get('moonlightHost'),name:url.searchParams.get('name')||'Moonlight PC'});}
 function text(value){const machine=validate(value);return 'Moonlight / Sunshine\r\nPC: '+machine.name+'\r\nIP / hostname: '+machine.host+'\r\n\r\n1. Chạy Sunshine trên PC.\r\n2. Điện thoại cùng Wi-Fi: mở Moonlight, bấm +, nhập IP trên.\r\n3. Nhập PIN Moonlight hiển thị vào trang PIN của Sunshine trên PC.\r\n4. Chọn Desktop hoặc game trong Moonlight.\r\n\r\nLink thông tin: '+link(machine)+'\r\n';}
 const api={validate,link,fromLink,text};if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudMoonlight=api;
})(typeof globalThis!=='undefined'?globalThis:this);
