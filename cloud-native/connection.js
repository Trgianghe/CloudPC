(function(root){
  'use strict';
  function signalingAddress(value, base){
    const page=new URL(base);
    if(!value && page.hostname.endsWith('.github.io')) throw Error('Nhập địa chỉ WSS của PC host hoặc nhập file client.config.json.');
    const url=new URL(value||'/signal',base);
    if(url.protocol==='https:')url.protocol='wss:';
    if(url.protocol==='http:')url.protocol='ws:';
    if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Địa chỉ phải là WSS/HTTPS, không chứa mật khẩu hoặc token.');
    if(page.protocol==='https:'&&url.protocol!=='wss:')throw Error('Trang HTTPS cần host WSS có chứng chỉ hợp lệ.');
    if(url.pathname==='/')url.pathname='/signal';
    return url.href;
  }
  if(typeof module!=='undefined')module.exports={signalingAddress};
  else root.PCCloudConnection={signalingAddress};
})(globalThis);
