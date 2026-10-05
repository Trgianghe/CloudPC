const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {WebSocket}=require('ws');
const {createSignaling}=require('../server');
async function client(url){const ws=new WebSocket(url);ws.messages=[];ws.pending=[];ws.on('message',b=>{const m=JSON.parse(b);const resolve=ws.pending.shift();if(resolve)resolve(m);else ws.messages.push(m);});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;}
function next(ws){return ws.messages.length?Promise.resolve(ws.messages.shift()):new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('timeout')),2000);ws.pending.push(m=>{clearTimeout(timer);r(m);});});}
for(const valid of [false,true])test(`proxy guard ${valid?'accepts signed remote address':'rejects forged override'}`,async t=>{
 const secret='h'.repeat(40),token='c'.repeat(40),app=createSignaling({rooms:{test:{host_token:secret,client_token:token}}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const url=`ws://127.0.0.1:${app.server.address().port}/signal`,host=await client(url);
 host.send(JSON.stringify({type:'join',role:'host',room:'test',token:secret}));await next(host);
 const viewer=await client(url),stamp=Math.floor(Date.now()/1000),nonce=crypto.randomBytes(16).toString('hex');
 const signature=crypto.createHmac('sha256',valid?secret:'fake').update(`test|0|${stamp}|${nonce}`).digest('hex');
 viewer.send(JSON.stringify({type:'join',role:'client',room:'test',token,proxySelfHost:false,proxyTime:stamp,proxyNonce:nonce,proxySignature:signature}));
 await next(viewer);assert.equal((await next(viewer)).selfHost,!valid);await next(host);
 viewer.send(JSON.stringify({type:'offer',sdp:'test',localInput:true}));const offer=await next(host);assert.equal(offer.selfHost,!valid);assert.equal(offer.localInput,!valid);
});
