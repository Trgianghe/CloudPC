(function(root){
 'use strict';
 function sliderFPS(value){const n=Number(value);if(!Number.isInteger(n)||n<1||n>501)throw Error('FPS không hợp lệ');return n===501?0:n;}
 function profileFile(text,validate){
  const data=JSON.parse(text.replace(/^\uFEFF/,''));
  const list=Array.isArray(data.profiles)?data.profiles:data.profile?[data.profile]:data.controls?[{name:data.name||'Profile nhập',controls:data.controls}]:null;
  if(!list||!list.length||list.length>50)throw Error('File cần có profile và danh sách controls (tối đa 50 profile).');
  return list.map(p=>{if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>50||!Array.isArray(p.controls)||p.controls.length>40)throw Error('Profile không hợp lệ.');return {name:p.name.trim(),controls:validate(p.controls.map(c=>({...c,vk:c.vk||c.keys?.[0]||32})))};});
 }
 root.CloudSettingsModel={sliderFPS,profileFile};
 if(typeof module==='object')module.exports=root.CloudSettingsModel;
})(globalThis);
