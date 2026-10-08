(function(root){
 'use strict';
 const key='pccloud.defaults.v2',prefix='pccloud.pc-settings.v2.';
 const factory=Object.freeze({preset:'1080p120',fps:120,bitrate:15,codec:'h264',playoutDelay:0,adaptive:true,sensitivity:1,volume:100,sound:false,hideControls:false,hud:false,awake:false});
 function clean(value){
  const out={};if(!value||typeof value!=='object')return out;
  for(const [field,v] of Object.entries(value)){
   if(field==='preset'&&['720p120','1080p120','2k60','4k60'].includes(v)||field==='codec'&&['h264','av1','hevc'].includes(v)||field==='playoutDelay'&&[0,30].includes(v)||field==='fps'&&Number.isInteger(v)&&v>=0&&v<=500||field==='bitrate'&&Number.isInteger(v)&&v>=5&&v<=100||field==='sensitivity'&&Number.isFinite(v)&&v>=.2&&v<=3||field==='volume'&&Number.isInteger(v)&&v>=0&&v<=100||['adaptive','sound','hideControls','hud','awake'].includes(field)&&typeof v==='boolean')out[field]=v;
  }return out;
 }
 function read(store,k){try{return clean(JSON.parse(store.getItem(k)||'null'));}catch{return {};}}
 function defaults(store){
  // Migrate the old shared quality once; do not turn it into an override on every PC.
  if(store.getItem(key)===null){const legacy=read(store,'pccloud.stream.preferences.v1');if(Object.keys(legacy).length)store.setItem(key,JSON.stringify({...factory,...legacy}));}
  return {...factory,...read(store,key)};
 }
 function pcKey(id){return typeof id==='string'&&id.length>0&&id.length<=256?prefix+encodeURIComponent(id):null;}
 function override(store,id){const k=pcKey(id);return k?read(store,k):{};}
 function resolve(store,id){return {...defaults(store),...override(store,id)};}
 function saveDefaults(store,value){const next={...factory,...clean(value)};store.setItem(key,JSON.stringify(next));return next;}
 function savePatch(store,id,patch){const k=pcKey(id);if(!k)return;const base=defaults(store),next=override(store,id);for(const [field,value] of Object.entries(clean(patch))){if(value===base[field])delete next[field];else next[field]=value;}if(Object.keys(next).length)store.setItem(k,JSON.stringify(next));else store.removeItem(k);}
 function reset(store,id){const k=pcKey(id);if(k)store.removeItem(k);}
 function diff(before,after){const next=clean(after),out={};for(const [field,value] of Object.entries(next))if(value!==before[field])out[field]=value;return out;}
 root.CloudPCPreferences={factory,key,prefix,clean,defaults,override,resolve,saveDefaults,savePatch,reset,diff};
 if(typeof module==='object')module.exports=root.CloudPCPreferences;
})(globalThis);
