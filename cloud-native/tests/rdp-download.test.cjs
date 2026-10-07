const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const CloudRDP=require('../../web/rdp-config');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../web/app.js'),'utf8');
const prepare=source.slice(source.indexOf('function prepareRDPDownload('),source.indexOf('function describeKeys('));
test('direct download anchor exports Windows-readable UTF16 RDP even when RDP host is disabled',async()=>{
 const blobs=[],revoked=[];const context={CloudRDP,Blob,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:qa-'+blobs.length;},revokeObjectURL(url){revoked.push(url);}}};vm.createContext(context);vm.runInContext(prepare,context);
 const anchor={dataset:{},href:''};const pc={host:'192.0.2.15',port:3390,username:'QA\\player',supported:false,enabled:false};
 context.prepareRDPDownload(anchor,pc);assert.equal(anchor.download,'pc-cloud.rdp');assert.equal(anchor.href,'blob:qa-1');
 const bytes=new Uint8Array(await blobs[0].arrayBuffer());assert.equal(bytes[0],255);assert.equal(bytes[1],254);
 const restored=CloudRDP.parse(CloudRDP.decode(bytes));assert.equal(restored.host,pc.host);assert.equal(restored.port,pc.port);assert.equal(restored.username,pc.username);
 context.prepareRDPDownload(anchor,pc);assert.equal(blobs.length,1);assert.equal(revoked.length,0);
 context.prepareRDPDownload(anchor,{...pc,port:3391});assert.deepEqual(revoked,['blob:qa-1']);assert.equal(anchor.href,'blob:qa-2');
});
