const test=require('node:test');
const assert=require('node:assert/strict');
const {WebSocket}=require('ws');
const {createSignaling}=require('../server');
test('only explicitly allowed Pages origin can open cross-origin signaling',async t=>{
  const app=createSignaling({rooms:{test:{client_token:'c'.repeat(40),host_token:'h'.repeat(40)}},client_origins:['https://trgianghe.github.io']});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const url=`ws://127.0.0.1:${app.server.address().port}/signal`;
  const accepted=await new Promise((resolve,reject)=>{const ws=new WebSocket(url,{origin:'https://trgianghe.github.io'});ws.once('open',()=>resolve(ws));ws.once('error',reject);});
  accepted.close();
  const denied=await new Promise(resolve=>{const ws=new WebSocket(url,{origin:'https://trgianghe.github.io.evil.example'});ws.once('error',error=>resolve(error.message));});
  assert.match(denied,/403/);
});
