import test from 'node:test';
import assert from 'node:assert/strict';
import {queryFailureActions} from '../src/errorActions.js';
test('privilege and missing-object errors suggest where to go next',()=>{
 assert.equal(queryFailureActions('ora-01031')[0].id,'connection');
 assert.equal(queryFailureActions('ORA-00942')[0].id,'find');
 assert.deepEqual(queryFailureActions('ORA-00001'),[]);assert.deepEqual(queryFailureActions(null),[]);
});
