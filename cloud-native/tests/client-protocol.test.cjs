const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const lines=html.split('\n');
function functionSource(name){const line=lines.find(l=>l.startsWith(`function ${name}(`));if(!line)throw Error(`missing ${name}`);return line;}
test('actual client binary packets use exact byte lengths and little endian fields',()=>{
  const context=vm.createContext({Uint8Array,DataView,Math});for(const n of ['movePacket','mousePacket','keyPacket'])vm.runInContext(functionSource(n),context);
  const move=context.movePacket(-123,32767);assert.equal(move.byteLength,5);assert.deepEqual([...move],[1,133,255,255,127]);
  assert.deepEqual([...context.keyPacket(87,true)],[3,1,87,0]);assert.deepEqual([...context.keyPacket(87,false)],[3,0,87,0]);assert.deepEqual([...context.mousePacket(3)],[2,3]);
});
test('input gate blocks editing, menu, hidden page and same-host test; essential releases still send',()=>{
  const sent=[],context=vm.createContext({S:{open:false,editing:false,selfHost:false},document:{hidden:false},dc:{readyState:'open',bufferedAmount:0,send:b=>sent.push([...b])}});
  vm.runInContext(functionSource('blocked')+'\n'+functionSource('sendBinary'),context);
  for(const key of ['open','editing','selfHost']){context.S[key]=true;context.sendBinary(Uint8Array.of(3,1,87,0));assert.equal(sent.length,0);context.S[key]=false;}
  context.document.hidden=true;context.sendBinary(Uint8Array.of(1,0,0,0,0));assert.equal(sent.length,0);context.sendBinary(Uint8Array.of(6),true);assert.deepEqual(sent,[[6]]);
});
test('two touch controls bound to one key hold it until the last source releases',()=>{
  const sent=[],keys=new Set(),context=vm.createContext({keySources:new Map(),keys,snapshot:()=>sent.push([...keys]),Uint8Array,DataView});
  vm.runInContext(functionSource('keyPacket')+'\n'+functionSource('holdKey'),context);
  context.holdKey('touch:a',87,true);context.holdKey('touch:b',87,true);
  context.holdKey('touch:a',87,false);assert.equal(keys.has(87),true);
  context.holdKey('touch:b',87,false);assert.equal(keys.has(87),false);
  assert.deepEqual(sent,[[87],[]]);
});
