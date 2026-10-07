'use strict';
const fs=require('node:fs');
const http=require('node:http');
const https=require('node:https');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');

function createSignaling(config){
  for(const room of Object.values(config.rooms||{})){
    if([room.client_token,room.host_token].some(t=>typeof t!=='string'||t.length<32||t.startsWith('REPLACE-'))||room.client_token===room.host_token)throw Error('Set two distinct private tokens per room.');
  }
  const rooms=new Map(), attempts=new Map(), peers=new Set();
  const send=(socket,data)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data));};
  const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);};
  const ip=value=>String(value||'').replace(/^::ffff:/,'').replace(/^::1$/,'127.0.0.1');
  const isSelfHost=room=>typeof room.client?.proxySelfHost==='boolean'?room.client.proxySelfHost:!config.public_origin&&room.host?.address===room.client?.address&&/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(room.host?.address||'');
  const handler=(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' wss: ws:; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const route=req.url.split('?')[0];
    if(route==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,hostOnline:[...rooms.values()].some(room=>!!room.host)}));return;}
    if(route==='/connection.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');fs.createReadStream(path.join(__dirname,'connection.js')).pipe(res);return;}
    if(route==='/mouse_controller.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');fs.createReadStream(path.join(__dirname,'mouse_controller.js')).pipe(res);return;}
    if(route!=='/'&&route!=='/index.html'){res.writeHead(404);res.end('Not found');return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(path.join(__dirname,'index.html')).pipe(res);
  };
  const server=config.tls_cert&&config.tls_key?https.createServer({cert:fs.readFileSync(config.tls_cert),key:fs.readFileSync(config.tls_key)},handler):http.createServer(handler);
  const wss=new WebSocketServer({noServer:true,maxPayload:256*1024,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    const origin=req.headers.origin;
    const expected=`${config.tls_cert?'https':'http'}://${req.headers.host}`;
    if(req.url!=='/signal'||(origin&&origin!==expected&&origin!==config.public_origin&&!(config.client_origins||[]).includes(origin))){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',(socket,req)=>{
    peers.add(socket);socket.alive=true;socket.address=ip(req.socket.remoteAddress);
    const deadline=setTimeout(()=>socket.close(4001,'Authenticate first'),10000);
    socket.on('pong',()=>socket.alive=true);
    socket.on('error',()=>{});
    socket.on('message',(raw,binary)=>{
      if(binary){socket.close(1003,'Input belongs on the WebRTC channel');return;}
      let message;try{message=JSON.parse(raw);}catch{socket.close(1007,'Invalid signaling JSON');return;}
      if(!socket.role){
        const now=Date.now(),recent=(attempts.get(socket.address)||[]).filter(t=>now-t<60000);
        if(recent.length>=8){socket.close(4008,'Too many attempts');return;}
        recent.push(now);attempts.set(socket.address,recent);
        const setting=config.rooms?.[message.room];
        if(message.type!=='join'||!['host','client'].includes(message.role)||!setting||!equal(message.token,setting[`${message.role}_token`])){socket.close(4003,'Authentication failed');return;}
        const room=rooms.get(message.room)||{};
        if(room[message.role]){socket.close(4009,`${message.role} already connected`);return;}
        if(message.role==='client'&&socket.address==='127.0.0.1'&&typeof message.proxySelfHost==='boolean'&&Number.isInteger(message.proxyTime)&&Math.abs(Date.now()/1000-message.proxyTime)<30&&/^[a-f0-9]{32}$/.test(message.proxyNonce||'')){
          const payload=`${message.room}|${Number(message.proxySelfHost)}|${message.proxyTime}|${message.proxyNonce}`;
          const signature=crypto.createHmac('sha256',setting.host_token).update(payload).digest('hex');
          if(equal(message.proxySignature,signature))socket.proxySelfHost=message.proxySelfHost;
        }
        clearTimeout(deadline);attempts.delete(socket.address);socket.role=message.role;socket.room=message.room;room[socket.role]=socket;rooms.set(socket.room,room);
        send(socket,{type:'joined',role:socket.role,hostOnline:!!room.host,iceServers:config.ice_servers||[]});
        if(room.host&&room.client){const selfHost=isSelfHost(room);send(room.client,{type:'host-online',selfHost});send(room.host,{type:'client-online',selfHost});}
        return;
      }
      const room=rooms.get(socket.room);if(!room)return;
      const other=room[socket.role==='host'?'client':'host'];
      if(message.type==='bye'){
        send(other,{type:'peer-left'});
        if(socket.role==='client')socket.close(1000,'Disconnected');
        return;
      }
      const allowed=socket.role==='client'?['offer','ice','settings','command']:['answer','ice','status','error','capabilities'];
      if(!allowed.includes(message.type)){send(socket,{type:'error',message:'Unsupported signaling message'});return;}
      if(message.type==='offer'){
        if(typeof message.sdp!=='string'||message.sdp.length>128*1024)return;
        const selfHost=isSelfHost(room);
        send(other,{type:'offer',sdp:message.sdp,settings:message.settings,selfHost,localInput:selfHost&&message.localInput===true});return;
      }
      if(message.type==='answer'&&(typeof message.sdp!=='string'||message.sdp.length>128*1024))return;
      if(message.type==='command'&&(message.action!=='reboot'||message.confirmed!==true))return;
      if(!other){send(socket,{type:'error',message:'PC host is offline'});return;}
      // Reconstruct a whitelist: the peer cannot override role/room/selfHost.
      const forwarded={type:message.type};
      for(const key of ['sdp','candidate','settings','action','confirmed','message','capabilities','status'])if(message[key]!==undefined)forwarded[key]=message[key];
      send(other,forwarded);
    });
    socket.on('close',()=>{
      clearTimeout(deadline);peers.delete(socket);
      const room=rooms.get(socket.room);if(!room||room[socket.role]!==socket)return;
      delete room[socket.role];send(room[socket.role==='host'?'client':'host'],{type:'peer-left',role:socket.role});
      if(!room.host&&!room.client)rooms.delete(socket.room);
    });
  });
  const heartbeat=setInterval(()=>{for(const peer of peers){if(!peer.alive){peer.terminate();continue;}peer.alive=false;peer.ping();}const now=Date.now();for(const [key,times] of attempts)if(times.every(t=>now-t>60000))attempts.delete(key);},15000);
  heartbeat.unref();
  return {server,wss,close:()=>{clearInterval(heartbeat);for(const peer of peers)peer.terminate();wss.close();server.close();}};
}
module.exports={createSignaling};
if(require.main===module){
  const file=process.env.PC_CLOUD_CONFIG||path.join(__dirname,'server.config.json');
  const config=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const app=createSignaling(config);app.server.listen(config.port||9443,config.bind||'127.0.0.1',()=>console.log(`PC Cloud signaling: ${config.tls_cert?'https':'http'}://${config.bind||'127.0.0.1'}:${config.port||9443}`));
  process.on('SIGINT',()=>app.close());process.on('SIGTERM',()=>app.close());
}
