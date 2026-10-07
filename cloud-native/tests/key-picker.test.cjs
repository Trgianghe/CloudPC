const {test}=require('node:test'),assert=require('node:assert/strict');
const picker=require('../../web/key-picker.js');
const touch=require('../../web/touch-input.js');
test('virtual keyboard selects arbitrary simultaneous R+T without modifiers',()=>{let keys=[];keys=picker.choose(keys,82,false);keys=picker.choose(keys,84,false);assert.deepEqual(keys,[82,84]);assert.equal(picker.label(keys),'R + T');assert.deepEqual(touch.combo('R + T'),[82,84]);assert.deepEqual(picker.choose(keys,82,false),[84]);});
test('direction picker replaces a single key and virtual combos have a bound',()=>{assert.deepEqual(picker.choose([87],38,true),[38]);assert.equal(picker.choose([65,66,67,68,69,70],71,false).length,6);});
test('full keyboard has 108 separate keys, punctuation, numpad and both modifier sides',()=>{const keys=picker.sections.flatMap(s=>s.rows.flat());assert.equal(keys.length,108);assert.equal(new Set(keys).size,108);for(const vk of [9,44,145,19,93,96,105,106,107,109,110,111,144,160,161,162,163,164,165,173,174,175,179,254])assert.ok(keys.includes(vk));assert.equal(picker.label([219,220,221]),'[ + \\ + ]');assert.equal(picker.label([254]),'Num Enter');});
