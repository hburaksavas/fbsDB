import test from 'node:test';
import assert from 'node:assert/strict';
import {assignKeyTips,isCleanAltTap,keyTipLimit} from '../src/keyAccess.js';

test('each control prefers a unique letter from its own name in reading order',()=>{
 const tips=assignKeyTips([{id:1,label:'Run'},{id:2,label:'Run script'},{id:3,label:'Explain plan'}]);
 assert.equal(tips.get(1),'r');assert.equal(tips.get(2),'u');assert.equal(tips.get(3),'e');
 assert.equal(new Set(tips.values()).size,tips.size);
});
test('controls without usable letters fall back to free characters and reserved keys are skipped',()=>{
 const tips=assignKeyTips([{id:'a',label:'★'},{id:'b',label:'Ab'}],['a']);
 assert.equal(tips.get('b'),'b');assert.ok(/[a-z0-9]/.test(tips.get('a')));assert.notEqual(tips.get('a'),'a');
});
test('the number of tips is capped and every tip stays unique',()=>{
 const controls=Array.from({length:80},(_,index)=>({id:index,label:'Same name'}));
 const tips=assignKeyTips(controls);
 assert.equal(tips.size,keyTipLimit);assert.equal(new Set(tips.values()).size,keyTipLimit);
});
test('only a short Alt tap that was not part of a chord reveals the tips',()=>{
 assert.equal(isCleanAltTap(1000,1200,false),true);
 assert.equal(isCleanAltTap(1000,1200,true),false);
 assert.equal(isCleanAltTap(1000,2000,false),false);
});
