const test=require('node:test');
const assert=require('node:assert/strict');
const {parseConnectionConfig}=require('../../web/connection-config');
test('dashboard imports native client config for embedded sessions',()=>{
  const config={signaling:'wss://pc.example.com/signal',room:'pc-2',client_token:'c'.repeat(40)};
  const machine=parseConnectionConfig(JSON.stringify(config),'https://trgianghe.github.io');
  assert.equal(machine.url,'https://pc.example.com');
  assert.equal(machine.nativeRoom,'pc-2');
  assert.equal(machine.nativeSignaling,config.signaling);
  assert.equal(machine.code,config.client_token);
  assert.equal(machine.fps,120);
  assert.throws(()=>parseConnectionConfig(JSON.stringify({...config,host_token:'secret'}),'https://trgianghe.github.io'));
  assert.throws(()=>parseConnectionConfig(JSON.stringify({...config,signaling:'ws://pc.example.com'}),'https://trgianghe.github.io'));
});
test('existing host dashboard config remains supported',()=>{
  const machine=parseConnectionConfig(JSON.stringify({access_code:'a'.repeat(32),public_origin:'https://pc.example.com',name:'My PC'}),'https://trgianghe.github.io');
  assert.equal(machine.name,'My PC');assert.equal(machine.url,'https://pc.example.com');assert.equal(machine.nativeSignaling,undefined);
});
