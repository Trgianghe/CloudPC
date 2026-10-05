const {test}=require('node:test'),assert=require('node:assert/strict');
const {CloudMouseController:M}=require('../mouse_controller.js');
test('absolute, relative and wheel binary packets have exact endian layouts',()=>{
 assert.deepEqual([...M.packet(1,65535,32768)],[1,255,255,0,128]);
 assert.deepEqual([...M.packet(2,-123,-32768)],[2,133,255,0,128]);
 assert.deepEqual([...M.packet(4,-120)],[4,136,255]);
});
test('letterbox, pillarbox and encoded padding are excluded from mouse coordinates',()=>{
 const r={left:10,top:20,width:1000,height:1000};
 assert.equal(M.mapPoint(r,1920,1080,510,100),null);
 assert.deepEqual(M.mapPoint(r,1920,1080,510,520),{x:32768,y:32768});
 assert.deepEqual(M.mapPoint(r,1920,1080,10,238.75),{x:0,y:0});
 const wide={left:0,top:0,width:1600,height:900};
 assert.equal(M.mapPoint(wide,800,800,200,450),null);
 assert.deepEqual(M.mapPoint(wide,800,800,350,0),{x:0,y:0});
 assert.equal(M.mapPoint(wide,1920,1080,20,450,{x:.05,y:0,width:.9,height:1}),null);
 assert.deepEqual(M.mapPoint(wide,1920,1080,800,450,{x:.05,y:0,width:.9,height:1}),{x:32768,y:32768});
 assert.equal(M.mapPoint(r,0,0,0,0),null);
});
function target(){const handlers=new Map();return {style:{},handlers,addEventListener(n,f){handlers.set(n,f)},removeEventListener(n){handlers.delete(n)},focus(){},getBoundingClientRect(){return {left:0,top:0,width:1920,height:1080}},videoWidth:1920,videoHeight:1080,clientHeight:1080};}
test('mode changes, raw lock fallback, multi-source buttons and releases use actual controller',async()=>{
 const video=target(),doc=target(),win=target();global.document=doc;global.window=win;doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.handlers.get('pointerlockchange')()};
 let attempts=0;video.requestPointerLock=async options=>{attempts++;if(options){const e=Error('unsupported');e.name='NotSupportedError';throw e;}doc.pointerLockElement=video;doc.handlers.get('pointerlockchange')();};
 const packets=[];let enabled=true;const m=new M(video,{channel:{readyState:'open',bufferedAmount:0,send:b=>packets.push([...new Uint8Array(b)])},enabled:()=>enabled});
 m.setButton(2,true,'a');m.setButton(2,true,'b');m.setButton(2,false,'a');assert.deepEqual(packets,[[3,2,1]]);
 m.release();assert.deepEqual(packets.at(-1),[3,2,0]);
 await m.setMode('gaming');assert.equal(attempts,2);assert.equal(m.mode,'gaming');assert.equal(video.style.cursor,'none');
 await m.setMode('desktop');assert.equal(m.mode,'desktop');assert.equal(video.style.cursor,'default');
 enabled=false;const n=packets.length;m.relative(5,6);m.absolute(100,100);assert.equal(packets.length,n);
 m.destroy();assert.equal(video.handlers.size,0);delete global.document;delete global.window;
});

test('FPS sensitivity preserves subpixel movement and ignores invalid deltas',()=>{
 const packets=[];const c={sensitivity:.25,fractionX:0,fractionY:0,send:p=>{packets.push([...p]);return true;}};
 for(let i=0;i<4;i++)M.prototype.relative.call(c,1,-1);
 assert.deepEqual(packets,[[2,1,0,255,255]]);
 M.prototype.relative.call(c,Infinity,0);assert.equal(c.fractionX,0);
});
