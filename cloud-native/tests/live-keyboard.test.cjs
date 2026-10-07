const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('virtual mouse and keyboard press immediately, coexist and release on cancel, blur and close',()=>{
 const nodes=[],events={},sent=[];
 class Node{constructor(tag){this.tag=tag;this.dataset={};this.children=[];this.hidden=false;this.classList={add(){},remove(){}};nodes.push(this);}append(...n){this.children.push(...n);}setAttribute(){}setPointerCapture(){}focus(){}contains(n){return this===n||this.children.some(c=>c.contains(n));}}
 const body=new Node('body'),video=new Node('video'),open=new Node('button');
 const ctx={document:{body,createElement:t=>new Node(t),addEventListener:(n,f)=>events['document:'+n]=f},window:{addEventListener:(n,f)=>events[n]=f},S:{editing:false},rtcReady:true,blocked:()=>false,CloudKeyPicker:{label:keys=>String(keys[0])},holdKey:(s,k,d)=>sent.push(['key',k,d]),holdMouse:(s,k,d)=>sent.push(['mouse',k,d]),mouse:{wheel:d=>sent.push(['wheel',d])},$:s=>s==='#video'?video:open,panelAnimation:null,originalCloseSettings(){},toast(){},disconnect:async()=>{}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../../web/key-picker.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../../web/live-keyboard.js'),'utf8'),ctx);
 assert.equal(nodes.filter(n=>n.dataset.vk!==undefined).length,108);open.onclick();const panel=nodes.find(n=>n.id==='live-keyboard'),button=t=>nodes.find(n=>n.textContent===t),event={preventDefault(){},stopPropagation(){},pointerId:1};
 button('W').onpointerdown(event);button('Chuột trái').onpointerdown({...event,pointerId:2});
 assert.deepEqual(sent,[['key',87,true],['mouse',0,true]],'no timer or menu wait before sending');
 button('Chuột trái').onpointercancel();assert.deepEqual(sent.at(-1),['mouse',0,false]);
 events.blur();assert.deepEqual(sent.at(-1),['key',87,false]);
 button('Chuột phải').onpointerdown(event);events['document:pointerdown']({target:video});assert.equal(panel.hidden,true);assert.deepEqual(sent.at(-1),['mouse',1,false]);
 open.onclick();button('Cuộn lên').onpointerdown(event);assert.deepEqual(sent.at(-1),['wheel',120]);
 ctx.rtcReady=false;const length=sent.length;button('Chuột giữa').onpointerdown(event);assert.equal(sent.length,length,'disconnected input cannot be injected');
});
