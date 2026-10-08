const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),code=html.match(/function holdCombo\(source,values,down\)\{[^\n]+/)[0];
test('large combo arrives in one complete snapshot and preserves separately held keys on release',()=>{
 const all=require('../../web/key-picker.js').sections.flatMap(s=>s.rows.flat()),pack=require('../../web/input-state.js'),sent=[],ctx={keys:new Set([82]),keySources:new Map([['physical:R',82]])};ctx.snapshot=()=>sent.push(pack.packet(ctx.keys,0,new Uint8Array(12),1,0));vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.holdCombo('touch:combo',all,true);assert.equal(sent.length,1);for(const vk of all)assert.ok(sent[0][6+(vk>>3)]&(1<<(vk&7)));
 ctx.holdCombo('touch:combo',all,false);assert.equal(sent.length,2);assert.deepEqual([...ctx.keys],[82]);ctx.holdCombo('touch:combo',all,false);assert.equal(sent.length,2);
});
