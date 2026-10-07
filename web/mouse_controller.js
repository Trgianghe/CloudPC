/* Mouse protocol v2: little endian, dedicated unordered mouse-v2 channel. */
(function(root){
'use strict';
class CloudMouseController {
  constructor(video,{channel=null,enabled=()=>true,geometry=()=>null,onModeChange=()=>{},onButtonsChanged=()=>{},onActivate=()=>{},clickOnly=()=>false,sendButtonPackets=true}={}){
    this.doc=video.ownerDocument||document;this.win=this.doc.defaultView||window;this.video=video;this.channel=channel;this.enabled=enabled;this.geometry=geometry;
    this.onModeChange=onModeChange;this.onButtonsChanged=onButtonsChanged;this.onActivate=onActivate;this.sendButtonPackets=sendButtonPackets;
    this.sensitivity=1;this.fractionX=0;this.fractionY=0;this.clickOnly=clickOnly;this.clickGuardUntil=0;this.mode='desktop';this.sources=new Map();this.buttons=0;this.listeners=[];this.touch=null;
    this.bind(video,'mousemove',e=>{if(this.mode==='desktop'&&!this.clickOnly())this.absolute(e.clientX,e.clientY);});
    this.bind(this.doc,'mousemove',e=>{if(this.doc.pointerLockElement===video&&this.enabled())this.relative(e.movementX,e.movementY);});
    this.bind(video,'mousedown',e=>{if(!this.enabled()||e.button>2||performance.now()<this.clickGuardUntil)return;if(this.mode==='desktop'&&!this.absolute(e.clientX,e.clientY))return;e.preventDefault();video.focus();this.onActivate();this.setButton(e.button,true,'physical:'+e.button);if(this.clickOnly()){this.clickGuardUntil=performance.now()+350;setTimeout(()=>this.setButton(e.button,false,'physical:'+e.button),40);}});
    this.bind(this.doc,'mouseup',e=>{if(e.button<=2)this.setButton(e.button,false,'physical:'+e.button);});
    this.bind(video,'wheel',e=>{if(!this.enabled()||performance.now()<this.clickGuardUntil)return;if(this.mode==='desktop'&&!this.absolute(e.clientX,e.clientY))return;e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?video.clientHeight:1);this.wheel(-Math.round(pixels));if(this.clickOnly())this.clickGuardUntil=performance.now()+350;},{passive:false});
    this.bind(video,'contextmenu',e=>e.preventDefault());
    this.bind(this.doc,'pointerlockchange',()=>{this.release();this.mode=this.doc.pointerLockElement===video?'gaming':'desktop';video.style.cursor=this.mode==='gaming'?'none':'default';this.onModeChange(this.mode);});
    this.bind(this.win,'blur',()=>this.release());
    this.bind(this.doc,'visibilitychange',()=>{if(this.doc.hidden)this.release();});
    video.style.cursor='default';video.style.touchAction='none';video.tabIndex=0;
    this.bind(video,'pointerdown',e=>{if(e.pointerType!=='touch'||!this.enabled())return;e.preventDefault();video.setPointerCapture(e.pointerId);video.focus();this.onActivate();this.absolute(e.clientX,e.clientY);this.touch={id:e.pointerId,x:e.clientX,y:e.clientY,start:performance.now(),distance:0};});
    this.bind(video,'pointermove',e=>{const t=this.touch;if(!t||t.id!==e.pointerId||!this.enabled())return;t.distance+=Math.abs(e.clientX-t.x)+Math.abs(e.clientY-t.y);t.x=e.clientX;t.y=e.clientY;if(this.mode==='gaming')this.relative(e.movementX,e.movementY);else this.absolute(e.clientX,e.clientY);});
    this.bind(video,'pointerup',e=>{const t=this.touch;if(!t||t.id!==e.pointerId)return;this.touch=null;if(this.enabled()&&t.distance<8&&performance.now()-t.start<300){this.setButton(0,true,'tap');setTimeout(()=>this.setButton(0,false,'tap'),40);}});
    this.bind(video,'pointercancel',()=>{this.touch=null;this.release();});
  }
  bind(target,event,fn,options){target.addEventListener(event,fn,options);this.listeners.push(()=>target.removeEventListener(event,fn,options));}
  setChannel(channel){this.release();this.channel=channel;if(channel)channel.binaryType='arraybuffer';}
  send(packet,release=false){if(!release&&!this.enabled())return false;const c=this.channel;if(c?.readyState!=='open'||c.bufferedAmount>=512)return false;c.send(packet.buffer);return true;}
  static packet(type,x,y){const b=new Uint8Array(type===4?3:5),v=new DataView(b.buffer);b[0]=type;if(type===1){v.setUint16(1,x,true);v.setUint16(3,y,true);}else{v.setInt16(1,x,true);if(type===2)v.setInt16(3,y,true);}return b;}
  static mapPoint(rect,vw,vh,cx,cy,content={x:0,y:0,width:1,height:1}){
    if(!(vw>0&&vh>0&&rect.width>0&&rect.height>0))return null;
    const scale=Math.min(rect.width/vw,rect.height/vh),w=vw*scale,h=vh*scale;
    const left=rect.left+(rect.width-w)/2+w*content.x,top=rect.top+(rect.height-h)/2+h*content.y;
    const cw=w*content.width,ch=h*content.height;if(cw<=0||ch<=0||cx<left||cy<top||cx>left+cw||cy>top+ch)return null;
    return {x:Math.round(Math.max(0,Math.min(1,(cx-left)/cw))*65535),y:Math.round(Math.max(0,Math.min(1,(cy-top)/ch))*65535)};
  }
  absolute(x,y){if(!this.enabled())return false;const p=CloudMouseController.mapPoint(this.video.getBoundingClientRect(),this.video.videoWidth,this.video.videoHeight,x,y,this.geometry()?.content);return p?this.send(CloudMouseController.packet(1,p.x,p.y)):false;}
  relative(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy))return;this.fractionX+=dx*this.sensitivity;this.fractionY+=dy*this.sensitivity;dx=Math.trunc(this.fractionX);dy=Math.trunc(this.fractionY);this.fractionX-=dx;this.fractionY-=dy;if(!Number.isFinite(dx)||!Number.isFinite(dy))return;while(dx||dy){const x=Math.max(-32768,Math.min(32767,dx)),y=Math.max(-32768,Math.min(32767,dy));if(!this.send(CloudMouseController.packet(2,x,y)))break;dx-=x;dy-=y;}}
  wheel(delta){if(delta)this.send(CloudMouseController.packet(4,Math.max(-32768,Math.min(32767,delta))));}
  setButton(id,down,source='virtual:'+id){if(id<0||id>2||!Number.isInteger(id)||down&&!this.enabled())return;const before=this.buttons;if(down)this.sources.set(source,id);else this.sources.delete(source);this.buttons=0;for(const b of this.sources.values())this.buttons|=1<<b;if(this.sendButtonPackets)for(let b=0;b<3;b++)if((before^(this.buttons))&(1<<b))this.send(Uint8Array.of(3,b,Number(!!(this.buttons&(1<<b)))),!down);this.onButtonsChanged((this.buttons&1)|((this.buttons&4)>>1)|((this.buttons&2)<<1));}
  release(){this.fractionX=0;this.fractionY=0;this.sources.clear();if(this.sendButtonPackets)for(let b=0;b<3;b++)if(this.buttons&(1<<b))this.send(Uint8Array.of(3,b,0),true);this.buttons=0;this.touch=null;this.onButtonsChanged(0);}
  async setMode(mode){if(mode==='desktop'){this.release();if(this.doc.pointerLockElement===this.video)this.doc.exitPointerLock();this.mode='desktop';this.video.style.cursor='default';this.onModeChange('desktop');return;}if(mode!=='gaming')throw Error('Unknown mouse mode');if(!this.enabled())throw Error('Mouse input is unavailable');try{await this.video.requestPointerLock({unadjustedMovement:true});}catch(e){if(e.name!=='NotSupportedError'&&e.name!=='TypeError')throw e;await this.video.requestPointerLock();}}
  destroy(){this.release();if(this.doc.pointerLockElement===this.video)this.doc.exitPointerLock();for(const remove of this.listeners)remove();this.listeners=[];}
}
if(typeof module!=='undefined'&&module.exports)module.exports={CloudMouseController};else root.CloudMouseController=CloudMouseController;
})(typeof window!=='undefined'?window:this);
