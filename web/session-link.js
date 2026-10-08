(function(root){
 'use strict';
 function origin(text){const u=new URL(text);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Link PC phải dùng HTTP hoặc HTTPS.');return u.origin;}
 const encode=s=>(typeof btoa==='function'?btoa(s):Buffer.from(s).toString('base64')).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 const decode=s=>typeof atob==='function'?atob(s.replace(/-/g,'+').replace(/_/g,'/')):Buffer.from(s,'base64url').toString();
 function account(name,url){return name+'~'+encode(origin(url));}
 function route(value){const at=value.lastIndexOf('~');if(at<1)return {username:value,origin:''};try{return {username:value.slice(0,at),origin:origin(decode(value.slice(at+1)))};}catch{return {username:value,origin:''};}}
 root.CloudSessionLink={origin,account,route};if(typeof module==='object')module.exports=root.CloudSessionLink;
})(globalThis);
