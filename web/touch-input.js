(function(root){
  'use strict';
  const active=new Set();
  function id(){return root.crypto.randomUUID?.()||[...root.crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  function directions(x,y,deadzone=.2){
    if(!Number.isFinite(x)||!Number.isFinite(y)||Math.hypot(x,y)<deadzone)return [];
    // 8 directions, with a 45 degree diagonal sector; never opposite keys.
    const angle=Math.atan2(y,x),sector=((Math.round(angle/(Math.PI/4))%8)+8)%8;
    return [[3],[3,2],[2],[1,2],[1],[1,0],[0],[3,0]][sector];
  }
  function combo(text){
    const named={CTRL:17,CONTROL:17,SHIFT:16,ALT:18,WIN:91,META:91,SPACE:32,ENTER:13,TAB:9,ESC:27,ESCAPE:27,BACKSPACE:8,DELETE:46,INSERT:45,HOME:36,END:35,PAGEUP:33,PAGEDOWN:34,UP:38,DOWN:40,LEFT:37,RIGHT:39};
    const parts=String(text).toUpperCase().split(/[+,]/).map(s=>s.trim());
    const keys=parts.map(s=>named[s]||(/^[A-Z]$/.test(s)?s.charCodeAt(0):/^F([1-9]|1[0-2])$/.test(s)?111+Number(s.slice(1)):/^[0-9]$/.test(s)?s.charCodeAt(0):/^\d+$/.test(s)?Number(s):0));
    if(!keys.length||keys.some(k=>!Number.isInteger(k)||k<1||k>254))throw Error('Dùng Ctrl + C, Shift + W hoặc mã phím 17, 67.');
    return [...new Set(keys)];
  }
  function withoutMovement(controls){return controls.filter(c=>!c.movement&&!(c.action==='key'&&c.keys?.length===1&&[87,65,83,68,38,37,40,39].includes(c.keys[0])));}
  function bindJoystick(button,control,options){
    button.classList.add('touch-joystick');button.textContent='';
    const knob=button.ownerDocument.createElement('span');knob.className='joystick-knob';knob.textContent=control.label||'Di chuyển';button.append(knob);
    let pointer=null,drag=false,held=new Set(),frame=null,deflection=[0,0],last=0;
    const padMode=control.inputType==='gamepad',looking=!padMode&&control.stickMode==='look';
    function lookFrame(now){frame=null;if(pointer===null||drag)return;if(options.blocked()||options.editing()){reset();return;}const dt=Math.min(32,Math.max(0,now-last))/1000;last=now;const [x,y]=deflection;if(Math.hypot(x,y)>.2)options.look?.(Math.round(x*900*dt),Math.round(y*900*dt));frame=root.requestAnimationFrame(lookFrame);}
    const mapping=control.keys?.length===4?control.keys:[87,65,83,68];
    function reset(){if(frame!==null)root.cancelAnimationFrame(frame);frame=null;deflection=[0,0];if(padMode&&pointer!==null&&!drag)options.axes?.(0,0);for(const vk of held)options.hold(vk,false);held.clear();pointer=null;drag=false;knob.style.transform='translate(0px,0px)';button.classList.remove('held','pressed');}
    function move(e){
      const box=button.getBoundingClientRect(),radius=Math.min(box.width,box.height)/2;
      let x=(e.clientX-box.left-radius)/radius,y=(e.clientY-box.top-radius)/radius;
      const magnitude=Math.hypot(x,y);if(magnitude>1){x/=magnitude;y/=magnitude;}
      if(Math.hypot(x,y)<.2&&padMode)x=y=0;
      deflection=[x,y];if(padMode)options.axes?.(x,y);const next=new Set(looking||padMode?[]:directions(x,y).map(i=>mapping[i]));
      for(const vk of held)if(!next.has(vk))options.hold(vk,false);
      for(const vk of next)if(!held.has(vk))options.hold(vk,true);
      held=next;knob.style.transform=`translate(${x*radius*.55}px,${y*radius*.55}px)`;
    }
    button.onpointerdown=e=>{e.preventDefault();e.stopPropagation();if(pointer!==null)return;if(!options.editing()&&options.blocked())return;pointer=e.pointerId;button.setPointerCapture(pointer);drag=options.editing();if(drag){options.select(control);return;}button.classList.add('held');move(e);if(looking){last=root.performance.now();frame=root.requestAnimationFrame(lookFrame);}};
    button.onpointermove=e=>{if(e.pointerId!==pointer)return;if(drag){options.drag(control,e,button);return;}if(options.blocked()){reset();return;}move(e);};
    const end=e=>{if(e.pointerId===pointer)reset();};button.onpointerup=end;button.onpointercancel=end;button.onlostpointercapture=end;
    active.add(reset);
    return reset;
  }
  function resetAll(){for(const reset of active)reset();}
  function disposeAll(){resetAll();active.clear();}
  root.CloudTouch={id,directions,combo,withoutMovement,bindJoystick,resetAll,disposeAll};
  if(typeof module==='object')module.exports=root.CloudTouch;
})(globalThis);
