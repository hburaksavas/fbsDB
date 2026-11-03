import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFailureActions,queryFailureActions} from '../src/errorActions.js';
test('a failed update points at the cell and offers to correct it',()=>{
 const actions=applyFailureActions({outcome:{status:'failed'},error:{row:2,col:1}});
 assert.deepEqual(actions.map(a=>a.id),['show','edit','copy']);assert.equal(actions[0].label,'Show cell');
});
test('a failure without a known column can only show the row; an insert has no row to show',()=>{
 assert.deepEqual(applyFailureActions({outcome:{status:'failed'},error:{row:2,col:null}}).map(a=>a.id),['show','copy']);
 assert.deepEqual(applyFailureActions({outcome:{status:'failed'},error:{row:null,col:null,insertId:4}}).map(a=>a.id),['copy']);
 assert.deepEqual(applyFailureActions({outcome:{status:'failed'}}).map(a=>a.id),['copy']);
});
test('only failed statements offer error actions',()=>{
 for(const status of ['applied','mismatch','rolledBack','notRun'])assert.deepEqual(applyFailureActions({outcome:{status},error:{row:1,col:1}}),[]);
});
test('privilege and missing-object errors suggest where to go next',()=>{
 assert.equal(queryFailureActions('ora-01031')[0].id,'connection');
 assert.equal(queryFailureActions('ORA-00942')[0].id,'find');
 assert.deepEqual(queryFailureActions('ORA-00001'),[]);assert.deepEqual(queryFailureActions(null),[]);
});
