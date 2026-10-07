const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const input=require('../../web/input-state');
test('input snapshots include simultaneous combo, mouse and pad with a echoed client clock',()=>{
 const pad=new Uint8Array(12);pad[0]=0x10;const b=input.packet(new Set([82,84,162]),3,pad,4294967295,12.75,true),v=new DataView(b.buffer);
 assert.equal(b.length,58);assert.equal(b[0],8);assert.equal(v.getUint32(1,true),4294967295);assert.equal(v.getFloat64(50,true),12.75);
 for(const vk of [82,84,162])assert.ok(b[6+(vk>>3)]&(1<<(vk&7)));assert.equal(b[5],3);assert.equal(b[38],16);
 const release=input.packet(new Set(),0,new Uint8Array(12),0,14,true);assert.equal(release.slice(5,50).some(x=>x!==0),false);
});
test('latency acknowledgement reports transport round trip separately from host apply duration',()=>{
 const b=new Uint8Array(17),v=new DataView(b.buffer);b[0]=9;v.setUint32(1,42,true);v.setFloat64(5,10,true);v.setFloat32(13,.125,true);
 assert.deepEqual(input.acknowledgement(b.buffer,15),{sequence:42,roundTrip:5,hostMS:.125});assert.equal(input.acknowledgement(new ArrayBuffer(9),15),null);
});
test('keyboard edge sends its snapshot before returning, without waiting for a timer',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),fn=html.match(/function holdKey\([^\n]+/)[0],sent=[];
 const ctx={keys:new Set(),keySources:new Map(),snapshot(){sent.push([...ctx.keys]);}};vm.createContext(ctx);vm.runInContext(fn,ctx);
 ctx.holdKey('physical-W',87,true);assert.deepEqual(sent,[[87]]);
 ctx.holdKey('virtual-W',87,true);assert.equal(sent.length,1);
 ctx.holdKey('physical-W',87,false);assert.equal(sent.length,1);
 ctx.holdKey('virtual-W',87,false);assert.deepEqual(sent,[[87],[]]);
});
