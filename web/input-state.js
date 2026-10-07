(function(root){
 'use strict';
 function packet(keys,buttons,pad,sequence,timestamp,ack=false){
  const bytes=new Uint8Array(ack?58:50),view=new DataView(bytes.buffer);bytes[0]=ack?8:5;view.setUint32(1,sequence>>>0,true);bytes[5]=buttons&7;
  for(const vk of keys)if(Number.isInteger(vk)&&vk>0&&vk<255)bytes[6+(vk>>3)]|=1<<(vk&7);
  bytes.set(pad.subarray(0,12),38);if(ack)view.setFloat64(50,timestamp,true);return bytes;
 }
 function acknowledgement(buffer,now){const v=new DataView(buffer);if(v.byteLength!==17||v.getUint8(0)!==9)return null;const latency=now-v.getFloat64(5,true),host=v.getFloat32(13,true);if(!Number.isFinite(latency)||latency<0||!Number.isFinite(host)||host<0)return null;return {sequence:v.getUint32(1,true),roundTrip:latency,hostMS:host};}
 const api={packet,acknowledgement};if(typeof module==='object')module.exports=api;else root.CloudInputState=api;
})(globalThis);
