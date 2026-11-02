import test from 'node:test';
import assert from 'node:assert/strict';
import {newQueryMainLabel,newQueryProfileItems,newQueryTemplates} from '../src/newQueryOptions.js';
const profiles=[{id:'DEV',name:'Dev',environment:'development'},{id:'PROD',name:'Prod',environment:'production',available:false},{id:'QA'}];
test('profile choices put the current profile first and keep unavailable profiles visible but marked',()=>{
 const items=newQueryProfileItems(profiles,'QA');
 assert.deepEqual(items.map(item=>[item.id,item.current,item.available]),[['QA',true,true],['DEV',false,true],['PROD',false,false]]);
 assert.equal(items[0].name,'QA');
});
test('main action names the current profile and templates contain no executed side effects',()=>{
 assert.equal(newQueryMainLabel(profiles,'DEV'),'New SQL file on Dev (Ctrl+N)');
 assert.equal(newQueryMainLabel(profiles,null),'New SQL file (Ctrl+N)');
 assert.ok(newQueryTemplates.every(template=>template.content.trim()&&!/\b(COMMIT|DROP|DELETE|TRUNCATE)\b/i.test(template.content)));
});
