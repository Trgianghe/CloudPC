const test=require('node:test');
const assert=require('node:assert/strict');
const {parseConnectionConfig}=require('../../web/connection-config');
const RDP=require('../../web/rdp-config');
test('saved RDP addresses preserve custom ports and bracket IPv6',()=>{
 assert.equal(RDP.address({host:'192.168.1.25',port:3390}),'192.168.1.25:3390');
 assert.equal(RDP.address({host:'2001:db8::1'}),'[2001:db8::1]:3389');
 assert.equal(RDP.address({host:'[2001:db8::1]'}),'[2001:db8::1]:3389');
});
test('RDP config imports without web access code and discards passwords',()=>{
 const value=parseConnectionConfig(JSON.stringify({mode:'rdp',host:'pc.example.com',username:'DOMAIN\\player',password:'not-exported'}),'https://example.com');
 assert.equal(value.mode,'rdp');assert.equal(value.port,3389);assert.equal(value.username,'DOMAIN\\player');assert.equal(value.password,undefined);
});
test('RDP rejects file-line injection, invalid ports and listener addresses',()=>{
 for(const value of [{host:'pc\r\nfoo:s:bar'},{host:'pc',username:'name\nfoo'},{host:'pc',port:0},{host:'pc',port:65536},{host:'0.0.0.0'}]){
  assert.throws(()=>RDP.validate(value));assert.throws(()=>parseConnectionConfig(JSON.stringify({...value,mode:'rdp'}),'https://example.com'));
 }
});
