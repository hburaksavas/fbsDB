import test from 'node:test';
import assert from 'node:assert/strict';
import {idleGuidance,noRowsGuidance,pendingEmptyGuidance} from '../src/emptyGuidance.js';
test('the idle result area points to the next step for the current situation',()=>{
 assert.deepEqual(idleGuidance({connected:false}).action,'connect');
 assert.match(idleGuidance({connected:false}).detail,/Connect to a database first/);
 const ready=idleGuidance({connected:true,hasSql:true,runShortcut:'F5'});
 assert.equal(ready.action,'run');assert.match(ready.detail,/Press F5 to run/);
 assert.equal(idleGuidance({connected:true,hasSql:false}).action,'edit');
 assert.match(idleGuidance({connected:true}).detail,/Ctrl\+Enter/);
});
test('nothing is offered while a statement is running',()=>{
 const running=idleGuidance({connected:true,hasSql:true,executing:true});
 assert.equal(running.action,null);assert.equal(running.title,'Running…');
});
test('an empty result and an empty draft list explain what to check or do next',()=>{
 assert.match(noRowsGuidance().detail,/WHERE conditions/);
 assert.match(pendingEmptyGuidance(),/press F2/);assert.match(pendingEmptyGuidance(),/apply or discard/);
});
