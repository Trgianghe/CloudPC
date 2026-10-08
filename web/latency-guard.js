(function(root){
 'use strict';
 // React to sustained measured overload, not to ping or an idle desktop's FPS.
 class CloudLatencyGuard {
  constructor(){this.reset();}
  reset(){this.limit=null;this.bad=0;this.cooldownUntil=0;}
  observe(sample,desired,now){
   if(!sample||sample.frames<=0||!Number.isFinite(sample.bufferMS)||!Number.isFinite(sample.decodeMS)) {this.bad=0;return null;}
   const bitrate=Math.min(desired.bitrate,this.limit?.bitrate??desired.bitrate);
   const fps=this.limit?.fps??desired.fps;
   const frameBudget=1000/(fps||120);
   const network=sample.bufferMS>60||(Number.isFinite(sample.lossRatio)&&sample.lossRatio>.03);
   const decoder=sample.decodeMS>frameBudget*.9;
   if(!network&&!decoder){this.bad=0;return null;}
   if(now<this.cooldownUntil){this.bad=0;return null;}
   if(++this.bad<3)return null;
   this.bad=0;
   const nextBitrate=network?Math.max(5,Math.floor(bitrate*.75)):bitrate;
   const nextFPS=decoder?Math.min(fps||120,Math.max(30,Math.floor((fps||120)*.75))):fps;
   if(nextBitrate===bitrate&&nextFPS===fps)return null;
   this.limit={bitrate:nextBitrate,fps:nextFPS};this.cooldownUntil=now+20000;
   return {...this.limit,reason:network?'Bộ đệm hình tăng':'Thiết bị giải mã không kịp'};
  }
  settings(desired){return this.limit?{...desired,bitrate:Math.min(desired.bitrate,this.limit.bitrate),fps:this.limit.fps,uncapped:this.limit.fps===0}:{...desired};}
 }
 root.CloudLatencyGuard=CloudLatencyGuard;
 if(typeof module==='object')module.exports=CloudLatencyGuard;
})(globalThis);
