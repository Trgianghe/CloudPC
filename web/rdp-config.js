(function(root){
  'use strict';
  function validate(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Cấu hình RDP không hợp lệ.');
    const host=String(value.host||'').trim(),port=Number(value.port??3389),username=String(value.username||'').trim();
    if(!/^[a-zA-Z0-9.\-:\[\]]{1,253}$/.test(host)||['0.0.0.0','::','[::]'].includes(host)||!Number.isInteger(port)||port<1||port>65535||username.length>150||/[\r\n]/.test(username))throw new Error('IP, cổng hoặc tài khoản RDP không hợp lệ.');
    return {...value,host,port,username};
  }
  function address(value){const machine=validate(value);const host=machine.host.includes(':')&&!machine.host.startsWith('[')?'['+machine.host+']':machine.host;return host+':'+machine.port;}

  function decode(bytes){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(data.length>65536)throw new Error('File quá lớn. Giới hạn 64 KB.');
    let encoding='utf-8';
    if(data[0]===255&&data[1]===254)encoding='utf-16le';
    else if(data[0]===254&&data[1]===255)encoding='utf-16be';
    else if(data.length>3&&data[1]===0&&data[3]===0)encoding='utf-16le';
    else if(data.length>3&&data[0]===0&&data[2]===0)encoding='utf-16be';
    return new TextDecoder(encoding,{fatal:true}).decode(data).replace(/^\uFEFF/,'');
  }
  function parse(text,filename='Remote PC.rdp'){
    text=text.replace(/^\uFEFF/,'');
    const name=filename.replace(/\.(rdp|json)$/i,'').slice(0,80)||'Remote PC';
    if(text.trimStart().startsWith('{')){
      let config;try{config=JSON.parse(text);}catch{throw new Error('File JSON không hợp lệ.');}
      const source=config?.rdp||config;
      if(source?.mode&&source.mode!=='rdp')throw new Error('Chọn cấu hình Remote Desktop, không phải cấu hình WebRTC.');
      const machine=validate(source);
      return {mode:'rdp',name:typeof source.name==='string'&&source.name.trim()?source.name.trim().slice(0,80):name,host:machine.host,port:machine.port,username:machine.username};
    }
    const fields=new Map();
    for(const line of text.split(/\r?\n/)){
      const match=line.match(/^([^:]+):([si]):(.*)$/i);if(!match)continue;
      const key=match[1].trim().toLowerCase();
      if(!['full address','server port','username','domain'].includes(key))continue;
      const expected=key==='server port'?'i':'s';if(match[2].toLowerCase()!==expected)throw new Error('File RDP có kiểu dữ liệu không hợp lệ.');
      const value=match[3].trim();
      if(fields.has(key)&&fields.get(key)!==value)throw new Error('File RDP có thông tin trùng lặp không nhất quán.');
      fields.set(key,value);
    }
    let host=fields.get('full address')||'',port=Number(fields.get('server port')||3389);
    const endpoint=host.match(/^(\[[^\]]+\]|[^:]+):(\d+)$/);
    if(endpoint){host=endpoint[1];port=Number(endpoint[2]);}
    let username=fields.get('username')||'';
    const domain=fields.get('domain');if(username&&domain&&!/[\\@]/.test(username))username=domain+'\\'+username;
    const machine=validate({host,port,username});
    return {mode:'rdp',name,...machine};
  }

  function file(machine){
    machine=validate(machine);
    const text='\uFEFFfull address:s:'+address(machine)+'\r\nusername:s:'+machine.username+'\r\nprompt for credentials:i:1\r\nauthentication level:i:2\r\nscreen mode id:i:2\r\ndesktopwidth:i:1920\r\ndesktopheight:i:1080\r\naudiomode:i:0\r\nredirectclipboard:i:1\r\n';
    const bytes=new Uint8Array(text.length*2),view=new DataView(bytes.buffer);
    for(let index=0;index<text.length;index++)view.setUint16(index*2,text.charCodeAt(index),true);
    return bytes;
  }
  const api={validate,address,decode,parse,file};if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudRDP=api;
})(typeof globalThis!=='undefined'?globalThis:this);
