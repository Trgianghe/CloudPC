const {test}=require('node:test'),assert=require('node:assert/strict');
const {CloudMouseController:M}=require('../mouse_controller');
function target(){const handlers=new Map();return {handlers,style:{},addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n),focus(){},videoWidth:1920,videoHeight:1080,clientHeight:1080,getBoundingClientRect:()=>({left:0,top:0,width:1920,height:1080})};}
test('same-host click mode skips continuous motion and suppresses reinjected clicks/wheel',async()=>{
 const video=target(),doc=target(),win=target();global.document=doc;global.window=win;
 const packets=[],mouse=new M(video,{clickOnly:()=>true,channel:{readyState:'open',bufferedAmount:0,send:b=>packets.push([...new Uint8Array(b)])}});
 video.handlers.get('mousemove')({clientX:500,clientY:300});assert.equal(packets.length,0);
 const click={button:0,clientX:500,clientY:300,preventDefault(){}};
 video.handlers.get('mousedown')(click);assert.equal(packets[0][0],1);assert.deepEqual(packets[1],[3,0,1]);
 video.handlers.get('mousedown')(click);assert.equal(packets.length,2);
 await new Promise(r=>setTimeout(r,60));assert.deepEqual(packets.at(-1),[3,0,0]);
 mouse.clickGuardUntil=0;const wheel={clientX:500,clientY:300,deltaY:120,deltaMode:0,preventDefault(){}};
 video.handlers.get('wheel')(wheel);const count=packets.length;video.handlers.get('wheel')(wheel);assert.equal(packets.length,count);
 mouse.destroy();delete global.document;delete global.window;
});
