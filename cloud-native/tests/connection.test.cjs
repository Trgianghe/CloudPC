const test=require('node:test');
const assert=require('node:assert/strict');
const {signalingAddress}=require('../connection.js');
test('Pages requires an explicit secure backend and supports project subpaths',()=>{
  const page='https://trgianghe.github.io/CloudPC/';
  assert.throws(()=>signalingAddress('',page));
  assert.equal(signalingAddress('https://pc.example.com',page),'wss://pc.example.com/signal');
  assert.equal(signalingAddress('wss://pc.example.com/signal',page),'wss://pc.example.com/signal');
  for(const url of ['ws://pc.example.com','javascript:alert(1)','https://user:pass@pc.example.com','wss://pc.example.com/?token=secret'])assert.throws(()=>signalingAddress(url,page));
});
test('local backend remains same origin',()=>assert.equal(signalingAddress('','http://127.0.0.1:8443/native/'),'ws://127.0.0.1:8443/signal'));
