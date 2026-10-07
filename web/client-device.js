(function(root){
 'use strict';
 function isMobileDevice(nav={}){
  return nav.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(nav.userAgent||'')||((nav.platform==='MacIntel'||/Macintosh/i.test(nav.userAgent||''))&&Number(nav.maxTouchPoints)>1);
 }
 function gamepads(nav){try{return [...(nav.getGamepads?.()||[])].filter(p=>p?.connected);}catch{return [];}}
 root.CloudDevices={isMobileDevice,gamepads};
 if(root.document)root.document.documentElement.classList.toggle('mobile-client',isMobileDevice(root.navigator));
 if(typeof module==='object')module.exports=root.CloudDevices;
})(globalThis);
