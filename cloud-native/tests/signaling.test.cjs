const {test}=require('node:test');
const assert=require('node:assert/strict');
const {WebSocket}=require('ws');
const {createSignaling}=require('../server');
function connect(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.inbox=[];ws.waiters=[];ws.on('message',raw=>{const m=JSON.parse(raw);const waiter=ws.waiters.shift();if(waiter)waiter(m);else ws.inbox.push(m);});ws.on('open',()=>resolve(ws));ws.once('error',reject);});}
function next(ws){if(ws.inbox.length)return Promise.resolve(ws.inbox.shift());return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('signaling timeout')),2000);ws.waiters.push(m=>{clearTimeout(timer);resolve(m)});});}
const send=(ws,data)=>ws.send(JSON.stringify(data));
test('authenticated room relay, role isolation, self-host protection and private-file denial',async t=>{
  const clientToken='c'.repeat(40),hostToken='h'.repeat(40);
  const app=createSignaling({rooms:{test:{client_token:clientToken,host_token:hostToken}},ice_servers:[]});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const port=app.server.address().port,url=`ws://127.0.0.1:${port}/signal`;
  const wrong=await connect(url);const denied=new Promise(resolve=>wrong.once('close',code=>resolve(code)));send(wrong,{type:'join',room:'test',role:'host',token:clientToken});assert.equal(await denied,4003);
  const host=await connect(url);send(host,{type:'join',room:'test',role:'host',token:hostToken});assert.equal((await next(host)).type,'joined');
  const client=await connect(url);send(client,{type:'join',room:'test',role:'client',token:clientToken});assert.equal((await next(client)).type,'joined');assert.equal((await next(client)).selfHost,true);assert.equal((await next(host)).type,'client-online');
  send(client,{type:'offer',sdp:'test-sdp',settings:{codec:'h264'},selfHost:false,role:'host'});const offer=await next(host);assert.equal(offer.sdp,'test-sdp');assert.equal(offer.selfHost,true);assert.equal(offer.role,undefined);
  send(client,{type:'answer',sdp:'spoofed'});assert.equal((await next(client)).type,'error');
  send(host,{type:'answer',sdp:'real-answer'});assert.equal((await next(client)).sdp,'real-answer');
  send(client,{type:'ice',candidate:{candidate:'candidate:1'}});assert.equal((await next(host)).candidate.candidate,'candidate:1');
  send(client,{type:'command',action:'reboot',confirmed:true});assert.equal((await next(host)).action,'reboot');
  const duplicate=await connect(url);const busy=new Promise(resolve=>duplicate.once('close',code=>resolve(code)));send(duplicate,{type:'join',room:'test',role:'client',token:clientToken});assert.equal(await busy,4009);
  const response=await fetch(`http://127.0.0.1:${port}/host.config.json`);assert.equal(response.status,404);
  send(client,{type:'bye'});assert.equal((await next(host)).type,'peer-left');
});
