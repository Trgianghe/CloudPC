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
const content='full address:s:192.0.2.20:3390\r\nusername:s:Player\r\ndomain:s:LAB\r\npassword 51:b:ignored\r\n';
test('imports normal Windows RDP files and ignores protected passwords',()=>{
 const value=RDP.parse(content,'Gaming.rdp');
 assert.deepEqual(value,{mode:'rdp',name:'Gaming',host:'192.0.2.20',port:3390,username:'LAB\\Player'});
});
test('decodes UTF16 Windows RDP and UTF8 JSON files',()=>{
 const data=Buffer.concat([Buffer.from([255,254]),Buffer.from(content,'utf16le')]);
 assert.equal(RDP.parse(RDP.decode(data)).port,3390);
 assert.equal(RDP.parse(RDP.decode(Buffer.from(JSON.stringify({host:'pc.example.com',username:'Player'}))),'PC.json').host,'pc.example.com');
 const be=Buffer.from(content,'utf16le');be.swap16();
 assert.equal(RDP.parse(RDP.decode(Buffer.concat([Buffer.from([254,255]),be]))).port,3390);
});
test('imports IPv6 and rejects missing addresses or conflicting fields',()=>{
 assert.equal(RDP.parse('full address:s:[2001:db8::2]:3391\nusername:s:a').port,3391);
 assert.throws(()=>RDP.parse('username:s:Player'));
 assert.throws(()=>RDP.parse('full address:s:one\nfull address:s:two'));
 assert.throws(()=>RDP.decode(new Uint8Array(65537)));
 assert.throws(()=>RDP.parse('{"mode":"webrtc","host":"pc"}'));
});
test('exported RDP uses UTF16 and preserves Windows usernames without passwords',()=>{
 const source={host:'192.0.2.20',port:3390,username:'TEST\\Nguyễn'};
 const bytes=RDP.file(source);assert.equal(bytes[0],255);assert.equal(bytes[1],254);
 const restored=RDP.parse(RDP.decode(bytes));assert.equal(restored.username,source.username);assert.equal(restored.port,3390);
 assert.doesNotMatch(RDP.decode(bytes),/password/i);
});
