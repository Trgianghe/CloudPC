(function(root) {
  'use strict';
  function parseConnectionConfig(text, currentOrigin) {
    let config;
    try { config=JSON.parse(text.replace(/^\uFEFF/,'')); }
    catch { throw new Error('File không phải JSON hợp lệ. Hãy chọn config.json của PC host.'); }
    if(!config || typeof config!=='object' || Array.isArray(config)) throw new Error('Cấu hình phải là một đối tượng JSON.');
    if(config.host_token)throw new Error('Chọn cấu hình client; không nhập khóa host quản trị.');
    if(config.client_token){
      if(typeof config.client_token!=='string'||config.client_token.length<32||config.client_token.startsWith('REPLACE-'))throw new Error('Mã client không hợp lệ.');
      let endpoint;try{endpoint=new URL(config.signaling);}catch{throw new Error('Config client cần địa chỉ signaling WSS của host.');}
      if(!['wss:','ws:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error('Địa chỉ signaling phải là WS/WSS và không chứa token.');
      if(currentOrigin.startsWith('https:')&&endpoint.protocol!=='wss:')throw new Error('Trang HTTPS cần host WSS.');
      const room=config.room||'my-pc';if(typeof room!=='string'||room.length>64||!room)throw new Error('Phòng PC không hợp lệ.');
      return {name:config.name||'My Gaming PC',url:endpoint.origin.replace(/^wss:/,'https:').replace(/^ws:/,'http:'),code:config.client_token,nativeRoom:room,nativeSignaling:endpoint.href,width:1280,fps:120,bitrate:15};
    }
    if(config.mode==='rdp'||config.type==='rdp'){
      const host=String(config.host||'').trim(),port=Number(config.port??3389),username=String(config.username||'').trim(),name=config.name||'Remote PC';
      if(!/^[a-zA-Z0-9.\-:\[\]]{1,253}$/.test(host)||['0.0.0.0','::','[::]'].includes(host)||!Number.isInteger(port)||port<1||port>65535||typeof name!=='string'||name.length>80||username.length>150||/[\r\n]/.test(username))throw new Error('Thông tin RDP không hợp lệ.');
      return {mode:'rdp',name,host,port,username};
    }
    const code=config.access_code ?? config.code;
    if(typeof code!=='string' || !code.trim() || code.length>512) throw new Error('File thiếu mã access_code hợp lệ.');
    if(code.startsWith('CHANGE-')) throw new Error('Đây là file cấu hình mẫu. Hãy chọn config.json thật của PC host.');
    const name=config.name ?? 'My Gaming PC';
    if(typeof name!=='string' || !name.trim() || name.length>80) throw new Error('Tên PC trong cấu hình không hợp lệ.');
    let address=config.url || config.public_origin;
    if(!address) {
      const host=config.host;
      if(host===undefined || ['0.0.0.0','::','[::]','localhost','127.0.0.1'].includes(host)) address=currentOrigin;
      else {
        if(typeof host!=='string' || !/^[a-zA-Z0-9.\-:\[\]]{1,253}$/.test(host)) throw new Error('Địa chỉ host trong cấu hình không hợp lệ.');
        const port=Number(config.port ?? 8443);
        if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Cổng host trong cấu hình không hợp lệ.');
        const normalizedHost=host.includes(':')&&!host.startsWith('[')?`[${host}]`:host;
        address=`${config.tls_cert&&config.tls_key?'https':'http'}://${normalizedHost}:${port}`;
      }
    }
    let url;
    try { url=new URL(address); } catch { throw new Error('URL trong cấu hình không hợp lệ.'); }
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('URL cần dùng HTTP/HTTPS và không chứa tài khoản hoặc mật khẩu.');
    return {name:name.trim(),url:url.origin,code,
      width:[1280,1920,2560,3840].filter(w=>w<=Number(config.width??config.max_width??1920)).at(-1)||1280,
      fps:[30,60,90,120,144,160].filter(f=>f<=Number(config.fps??config.max_fps??60)).at(-1)||30,
      bitrate:[12,20,35,50].filter(b=>b<=Number(config.bitrate??config.max_bitrate_mbps??20)).at(-1)||12};
  }
  if(typeof module==='object'&&module.exports) module.exports={parseConnectionConfig};
  else root.parseConnectionConfig=parseConnectionConfig;
})(typeof globalThis!=='undefined'?globalThis:this);
