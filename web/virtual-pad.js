(function(root){
 'use strict';
 const buttons=Object.freeze({a:0x1000,b:0x2000,x:0x4000,y:0x8000,lb:0x0100,rb:0x0200,back:0x20,start:0x10,l3:0x40,r3:0x80,up:1,down:2,left:4,right:8,lt:0,rt:0});
 const labels=Object.freeze({a:'A',b:'B',x:'X',y:'Y',lb:'LB',rb:'RB',lt:'LT',rt:'RT',back:'Back',start:'Start',l3:'LS',r3:'RS',up:'↑',down:'↓',left:'←',right:'→'});
 function clean(value){return [...new Set(Array.isArray(value)?value.filter(name=>Object.hasOwn(buttons,name)):[])].slice(0,6);}
 function binding(c){return {inputType:c.inputType==='gamepad'?'gamepad':'keyboard',padButtons:clean(c.padButtons),padStick:c.padStick==='right'?'right':'left'};}
 function report(sources,physical=new Uint8Array(12)){
  const bytes=new Uint8Array(12);bytes.set(physical.subarray(0,12));const view=new DataView(bytes.buffer);let mask=view.getUint16(0,true);
  for(const source of sources.values()){
   for(const name of clean(source.buttons)){mask|=buttons[name];if(name==='lt')bytes[10]=255;if(name==='rt')bytes[11]=255;}
   if(source.stick==='left'||source.stick==='right'){const offset=source.stick==='right'?6:2;for(const [axis,n] of [[source.x,offset],[Number.isFinite(source.y)?-source.y:0,offset+2]]){const value=Math.round(Math.max(-1,Math.min(1,Number.isFinite(axis)?axis:0))*32767);if(Math.abs(value)>Math.abs(view.getInt16(n,true)))view.setInt16(n,value,true);}}
  }view.setUint16(0,mask,true);return bytes;
 }
 root.CloudVirtualPad={buttons,labels,clean,binding,report,label:value=>clean(value).map(name=>labels[name]).join(' + ')};
 if(typeof module==='object')module.exports=root.CloudVirtualPad;
})(globalThis);
