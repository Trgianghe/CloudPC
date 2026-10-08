const test=require('node:test'),assert=require('node:assert/strict');
const link=require('../../web/session-link.js');
test('copied account carries LAN or HTTPS host without carrying a password',()=>{
 for(const url of ['http://192.168.1.20:8443','https://pc.example.com']){
  const value=link.account('pc-test',url);
  assert.deepEqual(link.route(value),{username:'pc-test',origin:url});
 }
 assert.deepEqual(link.route('legacy-user'),{username:'legacy-user',origin:''});
 assert.deepEqual(link.route('bad~!!!'),{username:'bad~!!!',origin:''});
 assert.throws(()=>link.account('pc','javascript:alert(1)'));
 assert.throws(()=>link.account('pc','https://user:secret@example.com'));
});
