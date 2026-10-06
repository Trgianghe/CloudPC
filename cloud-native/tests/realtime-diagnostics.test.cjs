const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('cloud-native/index.html','utf8').split('\n').find(l=>l.startsWith('function describeNetworkRoute'));
const c={};vm.createContext(c);vm.runInContext(source,c);
function stats(type){return new Map([['transport',{type:'transport',selectedCandidatePairId:'pair'}],['pair',{type:'candidate-pair',localCandidateId:'local',remoteCandidateId:'remote',currentRoundTripTime:.014}],['local',{candidateType:type,protocol:'udp'}],['remote',{candidateType:'srflx',protocol:'udp'}]]);}
test('route diagnostics distinguish TURN from direct without exposing IPs',()=>{assert.match(c.describeNetworkRoute(stats('relay')),/TURN relay.*14 ms/);assert.match(c.describeNetworkRoute(stats('host')),/P2P/);assert.match(c.describeNetworkRoute(new Map()),/đang xác định/);});
test('saved 2K160 quality restores',()=>{const line=fs.readFileSync('cloud-native/index.html','utf8').split('\n').find(l=>l.startsWith('function restoreStreamPreferences'));const x={S:{},preferenceKey:'x',localStorage:{getItem:()=>JSON.stringify({bitrate:40,fps:160,preset:'2k60'})},$:()=>({}),selectButtons(){}};vm.createContext(x);vm.runInContext(line,x);x.restoreStreamPreferences();assert.equal(x.S.fps,160);assert.equal(x.S.preset,'2k60');});
