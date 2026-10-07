const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const validate=html.match(/function validateControls\(list\)\{[^\n]+/)[0];
const sync=html.match(/function syncDashboardProfile\(name\)\{[\s\S]*?\n\}/)[0];
const migrate=html.match(/function importDashboardProfiles\(\)\{[\s\S]*?\n\}/)[0];
test('dashboard profiles preserve combinations, opacity and identity across migration and save',()=>{
 const store=new Map(),context={CloudTouch:{id:()=> 'fallback-id'},crypto:{randomUUID:()=> 'new-id'},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},profiles:[],controls:[]};
 store.set('pccloud.profiles',JSON.stringify({version:1,activeId:'old-id',profiles:[{id:'old-id',name:'FPS',controls:[{id:'ctrl',label:'Ctrl+C',keys:[17,67],action:'key',x:24,y:78,shape:'circle',size:64,opacity:65,hold:false}]}]}));
 vm.createContext(context);vm.runInContext(validate+'\n'+sync+'\n'+migrate+'\nimportDashboardProfiles();',context);
 assert.equal(context.controls[0].opacity,.65);assert.deepEqual([...context.controls[0].keys],[17,67]);assert.equal(context.controls[0].hold,false);
 vm.runInContext("syncDashboardProfile('FPS');",context);
 const saved=JSON.parse(store.get('pccloud.profiles'));assert.equal(saved.profiles.length,1);assert.equal(saved.activeId,'old-id');assert.equal(saved.profiles[0].controls[0].opacity,65);assert.deepEqual(saved.profiles[0].controls[0].keys,[17,67]);
});
test('custom joystick directions and non-modifier combo survive profile migration',()=>{
 const store=new Map(),context={CloudTouch:{id:()=> 'fallback-id'},crypto:{randomUUID:()=> 'id'},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},profiles:[],controls:[]};
 store.set('pccloud.profiles',JSON.stringify({version:1,activeId:'layout',profiles:[{id:'layout',name:'Custom',controls:[{id:'rt',label:'R+T',keys:[82,84],action:'key',x:50,y:50,hold:true},{id:'stick',label:'Move',keys:[38,65,83,68],action:'joystick',shape:'circle',size:150,x:18,y:75},{id:'look',label:'Look',keys:[87,65,83,68],action:'joystick',stickMode:'look',size:200,x:78,y:70}]}]}));
 vm.createContext(context);vm.runInContext(validate+'\n'+sync+'\n'+migrate+'\nimportDashboardProfiles();syncDashboardProfile("Custom");',context);
 const saved=JSON.parse(store.get('pccloud.profiles')).profiles[0].controls;
 assert.deepEqual(saved[0].keys,[82,84]);assert.deepEqual(saved[1].keys,[38,65,83,68]);assert.equal(saved[1].action,'joystick');assert.equal(saved[1].size,150);assert.equal(saved[2].stickMode,'look');assert.equal(saved[2].size,200);
});
