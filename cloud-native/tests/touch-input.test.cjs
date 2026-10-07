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

test('switching movement style removes old directions but keeps shortcut and action buttons',()=>{
 const list=[{action:'key',keys:[87]},{action:'key',keys:[17,87]},{action:'left',keys:[]},{action:'joystick',movement:true,keys:[87,65,83,68]}];
 assert.deepEqual(touch.withoutMovement(list),[list[1],list[2]]);
});

test('look stick sends continuous relative movement and stops on cancel or blocked input',()=>{
 touch.disposeAll();let pending=null,blocked=false;const sent=[],held=[];
 const oldRAF=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;
 global.requestAnimationFrame=callback=>{pending=callback;return 1;};global.cancelAnimationFrame=()=>{pending=null;};
 try{
 const b={classList:{add(){},remove(){}},ownerDocument:{createElement:()=>({style:{}})},append(){},getBoundingClientRect:()=>({left:0,top:0,width:120,height:120}),setPointerCapture(){}};
 touch.bindJoystick(b,{stickMode:'look',keys:[87,65,83,68]},{editing:()=>false,blocked:()=>blocked,hold:(...x)=>held.push(x),look:(...x)=>sent.push(x)});
 const e={clientX:120,clientY:60,pointerId:1,preventDefault(){},stopPropagation(){}};
 b.onpointerdown(e);pending(performance.now()+16);assert.ok(sent[0][0]>0);assert.equal(sent[0][1],0);assert.deepEqual(held,[]);
 blocked=true;const nextFrame=pending;pending=null;nextFrame(performance.now()+32);assert.equal(pending,null);assert.equal(sent.length,1);
 blocked=false;b.onpointerdown(e);b.onpointercancel(e);assert.equal(pending,null);
 }finally{touch.disposeAll();global.requestAnimationFrame=oldRAF;global.cancelAnimationFrame=oldCancel;}
});
