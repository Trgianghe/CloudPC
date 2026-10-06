(function(root){
  'use strict';
  function validate(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Cấu hình RDP không hợp lệ.');
    const host=String(value.host||'').trim(),port=Number(value.port??3389),username=String(value.username||'').trim();
    if(!/^[a-zA-Z0-9.\-:\[\]]{1,253}$/.test(host)||['0.0.0.0','::','[::]'].includes(host)||!Number.isInteger(port)||port<1||port>65535||username.length>150||/[\r\n]/.test(username))throw new Error('IP, cổng hoặc tài khoản RDP không hợp lệ.');
    return {...value,host,port,username};
  }
  function address(value){const machine=validate(value);const host=machine.host.includes(':')&&!machine.host.startsWith('[')?'['+machine.host+']':machine.host;return host+':'+machine.port;}
  const api={validate,address};if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudRDP=api;
})(typeof globalThis!=='undefined'?globalThis:this);
