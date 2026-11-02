import test from 'node:test';
import assert from 'node:assert/strict';
import {batchClosePlan} from '../src/batchClose.js';
const tabs=[{id:'a',dirty:true,content:'one'},{id:'b',dirty:true,content:'two'},{id:'c',dirty:true,content:'three'},{id:'clean',content:'four'},{id:'readonly',dirty:true,readOnly:true,content:'server'}];
test('batch close keeps explicit per-document decisions and preserves identity/order',()=>{
 const plan=batchClosePlan(tabs,['a','b','a','c','clean','missing','readonly'],{a:'save',b:'keep',c:'discard'},tabs.slice(0,3));
 assert.deepEqual(plan,[{id:'a',action:'save'},{id:'c',action:'discard'},{id:'clean',action:'close'},{id:'readonly',action:'close'}]);
 assert.deepEqual(batchClosePlan(tabs,['a'],{},[tabs[0]]),[]);
});
test('a changed reviewed document prevents every close decision before effects begin',()=>{
 assert.throws(()=>batchClosePlan([{...tabs[0],content:'new edit'},tabs[1]],['a','b'],{a:'discard',b:'save'},tabs.slice(0,2)),/changed/);
 assert.equal(tabs[0].content,'one');
});
