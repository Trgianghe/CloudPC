const {test}=require('node:test'),assert=require('node:assert/strict');
const touch=require('../../web/touch-input.js');
test('joystick has 8 sectors and center deadzone without opposite directions',()=>{
 assert.deepEqual(touch.directions(.1,.1),[]);assert.deepEqual(touch.directions(0,-1),[0]);assert.deepEqual(touch.directions(1,-1),[3,0]);assert.deepEqual(touch.directions(-1,1),[1,2]);assert.deepEqual(touch.directions(NaN,1),[]);
});
test('shortcut parser accepts named modifiers, function keys and legacy VK codes',()=>{
 assert.deepEqual(touch.combo('Ctrl + Shift + C'),[17,16,67]);assert.deepEqual(touch.combo('17, 67'),[17,67]);assert.deepEqual(touch.combo('Alt + F4'),[18,115]);assert.deepEqual(touch.combo('1'),[49]);assert.throws(()=>touch.combo('Ctrl + invalid'));assert.throws(()=>touch.combo('Ctrl +'));
});
function fixture(){let editing=false,blocked=false;const calls=[],drags=[];const classes=new Set();const button={classList:{add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v))},ownerDocument:{createElement:()=>({style:{}})},append(x){this.knob=x;},getBoundingClientRect:()=>({left:0,top:0,width:120,height:120}),setPointerCapture(){}};
 touch.bindJoystick(button,{id:'s',label:'Move',keys:[87,65,83,68]},{editing:()=>editing,blocked:()=>blocked,select(){},drag:(...x)=>drags.push(x),hold:(...x)=>calls.push(x)});
 const event=(x,y,id=1)=>({clientX:x,clientY:y,pointerId:id,preventDefault(){},stopPropagation(){}});
 return {button,calls,drags,event,edit:()=>editing=true,block:()=>blocked=true};
}
test('drag changes held directions and cancel releases every key; second finger cannot take stick',()=>{
 touch.disposeAll();const f=fixture();f.button.onpointerdown(f.event(120,0));assert.deepEqual(f.calls,[[68,true],[87,true]]);f.button.onpointerdown(f.event(0,120,2));assert.equal(f.calls.length,2);f.button.onpointermove(f.event(0,60));assert.deepEqual(f.calls.slice(2),[[68,false],[87,false],[65,true]]);f.button.onpointercancel(f.event(0,60));assert.deepEqual(f.calls.at(-1),[65,false]);assert.equal(f.button.knob.style.transform,'translate(0px,0px)');touch.disposeAll();
});
test('edit drag never injects keys; disconnect reset releases input',()=>{
 touch.disposeAll();const f=fixture();f.edit();f.button.onpointerdown(f.event(120,60));f.button.onpointermove(f.event(80,60));assert.equal(f.calls.length,0);assert.equal(f.drags.length,1);touch.disposeAll();const g=fixture();g.button.onpointerdown(g.event(120,60));touch.resetAll();assert.deepEqual(g.calls,[[68,true],[68,false]]);g.block();g.button.onpointerdown(g.event(120,60));assert.equal(g.calls.length,2);touch.disposeAll();
});
