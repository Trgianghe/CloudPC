const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../web/app.js'),'utf8');
const read=source.match(/function readMachine\(\)\{?[\s\S]*?(?=\nfunction storeMachine)/)?.[0]||source.match(/function readMachine\(\) \{[\s\S]*?(?=\nfunction storeMachine)/)[0];
const store=source.match(/function storeMachine\(machine\) \{[^\n]+/)[0];
const adopt=source.match(/function adoptConnectionMatch\(match\)\{[^\n]+/)[0];
function fixture(){
 const values={name:'My PC',url:'https://pc.example.com',width:1920,fps:60,bitrate:20,code:'test-code',host:'192.0.2.1',port:3389,username:'user',moonlightHost:'192.0.2.1',external:'https://remote.example.com',cloudAuth:'broadcast',broadcastUsername:'session-user'};
 const form={dataset:{editId:'original'},elements:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value:String(value)}]))};form.elements.rememberConfig={checked:true};
 const context={URL,form,$:()=>form,uid:()=> 'new-id',editingMachine:null,activeMode:'webrtc',machines:[{id:'original',mode:'webrtc',name:'My PC'}],saveStore(){},renderMachines(){},CloudRDP:require('../../web/rdp-config'),CloudMoonlight:require('../../web/moonlight-config'),safeURL:raw=>new URL(raw)};
 vm.createContext(context);vm.runInContext(read+'\n'+store+'\n'+adopt,context);return context;
}
test('editing switches every connection mode in place, even after scan/import finds another PC',()=>{
 const ctx=fixture();for(const mode of ['rdp','moonlight','parsec','external','webrtc']){
  ctx.activeMode=mode;vm.runInContext("adoptConnectionMatch({id:'another'});storeMachine(readMachine());",ctx);
  assert.equal(ctx.machines.length,1);assert.equal(ctx.machines[0].id,'original');assert.equal(ctx.machines[0].mode,mode);
 }
 assert.equal(ctx.machines[0].authType,'broadcast');assert.equal(ctx.machines[0].broadcastUsername,'session-user');assert.equal(ctx.machines[0].code,undefined);
});
test('add mode can reuse a matched PC; account password is never included in saved machine',()=>{
 const ctx=fixture();ctx.form.dataset.editId='';ctx.form.elements.broadcastPassword={value:'not-to-be-saved'};
 vm.runInContext("adoptConnectionMatch({id:'original'});storeMachine(readMachine());",ctx);
 assert.equal(ctx.machines.length,1);assert.ok(!JSON.stringify(ctx.machines).includes('not-to-be-saved'));
});
test('Moonlight details preserve the identity of the PC being edited',()=>{
 const text=fs.readFileSync(require('node:path').join(__dirname,'../../web/moonlight-ui.js'),'utf8');
 const show=text.match(/function showMoonlightDetails\(machine\)\{[\s\S]*?\n\}/)[0];
 const ctx={CloudMoonlight:require('../../web/moonlight-config'),moonlightDetails:null,$:()=>({open:true}),toast(){}};vm.createContext(ctx);
 vm.runInContext(show+"\nshowMoonlightDetails({id:'original',name:'PC',host:'192.0.2.1'});",ctx);
 assert.equal(ctx.moonlightDetails.id,'original');
});
