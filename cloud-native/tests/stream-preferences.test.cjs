const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').split('\n').find(l=>l.startsWith('function restoreStreamPreferences()'));
function restore(value){
  const nodes=new Map();
  const c={S:{bitrate:20,fps:120,preset:'1080p120'},preferenceKey:'test',localStorage:{getItem:()=>value},$:s=>{if(!nodes.has(s))nodes.set(s,{});return nodes.get(s);},selectButtons:()=>{}};
  vm.createContext(c);vm.runInContext(source,c);c.restoreStreamPreferences();return c.S;
}
test('saved stream quality restores bitrate, FPS and resolution',()=>{
  const s=restore(JSON.stringify({bitrate:15,fps:60,preset:'2k60'}));
  assert.equal(s.bitrate,15);assert.equal(s.fps,60);assert.equal(s.preset,'2k60');
});
test('corrupt or unsupported saved settings cannot break startup',()=>{
  for(const raw of ['{broken',JSON.stringify({bitrate:10000,fps:999,preset:'invalid'}),'null']){
    const s=restore(raw);assert.equal(s.bitrate,20);assert.equal(s.fps,120);assert.equal(s.preset,'1080p120');
  }
});
