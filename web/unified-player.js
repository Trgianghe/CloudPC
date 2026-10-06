// The existing dashboard authenticates once; the native engine runs in its player.
(() => {
  let frame=null, pending=0;
  const playerURL=()=>window.PCCloudDeployment?.static?new URL(window.PCCloudDeployment.player,document.baseURI).href:'/native/';
  function immersive(on){document.documentElement.classList.toggle('native-playing',on);for(const el of document.querySelectorAll('body > main,body > aside'))el.inert=on;}
  const oldConnect=connect, oldDisconnect=disconnect;
  disconnect=async function(){immersive(false);pending++;frame?.remove();frame=null;$('#session').classList.remove('native-session');await oldDisconnect();};
  window.addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==frame?.contentWindow)return;
    if(e.data?.type==='pccloud-exit')disconnect();
  });
  connect=async function(machine,code){
    if(!machine.nativeSignaling&&machine.url!==location.origin)return oldConnect(machine,code);
    if(!code)throw new Error('Nhập mã truy cập của PC host.');
    await disconnect();const current=++pending;
    let config;
    if(machine.nativeSignaling){config={room:machine.nativeRoom,client_token:code,signaling:machine.nativeSignaling};}
    else{
      if(window.PCCloudDeployment?.static)throw Error('Nhập config client có địa chỉ WSS của PC host vào trang web.');
      const auth=await responseJSON(await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})}));
      if(current!==pending)return;
      config=await responseJSON(await fetch('/api/native-session',{method:'POST',headers:{Authorization:`Bearer ${auth.token}`}}));
    }
    if(current!==pending)return;
    openSession(machine.name);activeSession=false; // Input belongs exclusively to the iframe.
    $('#session').classList.add('native-session');immersive(true);
    frame=document.createElement('iframe');frame.id='native-player';frame.title='Cloud PC';
    frame.allow='autoplay; fullscreen; gamepad';frame.src=playerURL();
    frame.onload=()=>{if(current===pending){if(config.signaling)frame.contentDocument.getElementById('signal-url').value=config.signaling;frame.contentWindow.postMessage({type:'pccloud-connect',config,touchControls:controls,localInput:true,bitrate:machine.bitrate||15,fps:machine.fps??120,preset:machine.width>=3840?'4k60':machine.width>=2560?'2k60':machine.width<=1280?'720p120':'1080p120'},location.origin);}};
    $('#session').append(frame);
  };
  $('#disconnect').onclick=()=>disconnect();
  $('#demo-button').onclick=async()=>{
    await disconnect();openSession('Xem player',true);activeSession=false;
    $('#session').classList.add('native-session');immersive(true);
    frame=document.createElement('iframe');frame.id='native-player';frame.title='Cloud PC';frame.allow='autoplay; fullscreen; gamepad';frame.src=playerURL();frame.onload=()=>frame.contentWindow.postMessage({type:'pccloud-layout',touchControls:controls},location.origin);$('#session').append(frame);
  };
  window.addEventListener('storage',e=>{
    if(e.key!=='pccloud.profiles')return;
    const data=readStore('pccloud.profiles',null);if(!Array.isArray(data?.profiles))return;
    profileData=data;const selected=data.profiles.find(p=>p.id===data.activeId);
    if(selected?.controls.every(validControl)){controls=cloneLayout(selected.controls);persistControls();renderControls();}
  });
})();
