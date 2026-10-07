const test=require('node:test');
const assert=require('node:assert/strict');
const Moon=require('../../web/moonlight-config');
test('Moonlight share link preserves IPv6 and Vietnamese name without RDP credentials',()=>{
 const source={name:'PC chơi game',host:'2001:db8::2',username:'private',password:'private'};
 const link=Moon.link(source),restored=Moon.fromLink(link);
 assert.deepEqual(restored,{mode:'moonlight',name:source.name,host:source.host});
 assert.doesNotMatch(link,/private|password|username/);
});
test('Moonlight rejects injection, empty names and wildcard listeners',()=>{
 for(const value of [{host:'pc\nfoo'},{host:'0.0.0.0'},{host:'pc',name:''},{host:'pc/<script>'}])assert.throws(()=>Moon.validate(value));
 assert.equal(Moon.fromLink('https://example.com'),null);
});
test('Moonlight exported instructions include host and PIN workflow, exclude credentials',()=>{
 const text=Moon.text({name:'Game PC',host:'192.0.2.20',username:'secret',code:'secret'});
 assert.match(text,/192\.0\.2\.20/);assert.match(text,/PIN/);assert.doesNotMatch(text,/secret/);
});
