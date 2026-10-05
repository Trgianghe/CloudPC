const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const lines=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').split('\n');
test('drawer ignores taps, opens intentional left drags, rejects short flicks and right drags',()=>{
  const nodes=new Map();let opens=0,closes=0;
  const c={$:s=>{if(!nodes.has(s))nodes.set(s,{style:{}});return nodes.get(s);},openSettings:()=>opens++,closeSettings:()=>closes++,setTimeout:fn=>fn(),handleDrag:null,ignoreHandleClick:false};vm.createContext(c);
  for(const prefix of ["$('#edge-handle').onclick=","$('#edge-handle').onpointerup="])vm.runInContext(lines.find(l=>l.startsWith(prefix)),c);
  nodes.get('#edge-handle').onclick({preventDefault(){}});assert.equal(opens,0);
  for(const [pull,velocity,expected] of [[0,0,false],[10,-2,false],[70,0,true],[30,-.5,true],[-90,0,false]]){
    const before=opens;c.handleDrag={start:200,velocity};nodes.get('#edge-handle').onpointerup({clientX:200-pull});assert.equal(opens>before,expected);
  }
  assert.equal(closes,3);
});
