const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const fn=html.split('\n').find(l=>l.startsWith('function inputState()'));
test('input status explains menu, editing, host view-only and channel readiness',()=>{
 const c={S:{selfHost:false,editing:false,open:false},rtcReady:true,mouseGeometry:{},mouse:{channel:{readyState:'open'}}};vm.createContext(c);vm.runInContext(fn,c);
 assert.match(c.inputState(),/Sẵn sàng/);c.S.open=true;assert.match(c.inputState(),/Menu/);c.S.editing=true;assert.match(c.inputState(),/chỉnh nút/);c.S.selfHost=true;assert.match(c.inputState(),/Chỉ xem/);c.S.selfHost=false;c.S.editing=false;c.S.open=false;c.mouse.channel.readyState='connecting';assert.match(c.inputState(),/kênh chuột/);
});
