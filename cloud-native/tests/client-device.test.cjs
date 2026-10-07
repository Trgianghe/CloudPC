const {test}=require('node:test'),assert=require('node:assert/strict');
const device=require('../../web/client-device.js');
test('mobile controls stay enabled on iPad with desktop UA or attached mouse; touchscreen Windows stays desktop',()=>{
 assert.equal(device.isMobileDevice({userAgent:'Mozilla iPhone'}),true);
 assert.equal(device.isMobileDevice({userAgent:'Mozilla Android tablet',userAgentData:{mobile:false}}),true);
 assert.equal(device.isMobileDevice({userAgent:'Mozilla Macintosh',platform:'MacIntel',maxTouchPoints:5}),true);
 assert.equal(device.isMobileDevice({userAgent:'Mozilla Macintosh',platform:'MacIntel',maxTouchPoints:0}),false);
 assert.equal(device.isMobileDevice({userAgent:'Windows NT',platform:'Win32',maxTouchPoints:10}),false);
 assert.equal(device.isMobileDevice({userAgentData:{mobile:true}}),true);
});
test('gamepad enumeration survives unsupported or denied APIs and keeps attached controllers on both kinds of device',()=>{
 const pad={connected:true,mapping:'standard'};
 assert.deepEqual(device.gamepads({getGamepads:()=>[null,pad,{connected:false}]}),[pad]);
 assert.deepEqual(device.gamepads({getGamepads(){throw Error('SecurityError');}}),[]);
 assert.deepEqual(device.gamepads({}),[]);
});

test('desktop keeps physical input usable while saved touch preferences cannot show the touch editor',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 const declaration=html.match(/const S=\{[^\n]+/)[0];
 const preference=html.match(/try\{const pref=localStorage.getItem\('pccloud.native.hide-buttons'\)[^\n]+/)[0];
 for(const mobile of [false,true]){
  const context={CloudDevices:{isMobileDevice:()=>mobile},navigator:{},localStorage:{getItem:()=> 'false'}};
  vm.createContext(context);vm.runInContext(declaration+'\n'+preference+'\nthis.result=S;',context);
  assert.equal(context.result.touch,mobile);
  assert.equal(context.result.mobile,mobile);
 }
 const blocked=html.match(/function blocked\(\)\{[^\n]+/)[0];
 const context={S:{open:false,editing:false,selfHost:false,localInput:false,mobile:false,touch:false},document:{hidden:false}};
 vm.createContext(context);vm.runInContext(blocked+'\nthis.result=blocked();',context);
 assert.equal(context.result,false);
});
