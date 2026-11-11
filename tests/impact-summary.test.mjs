import test from 'node:test';
import assert from 'node:assert/strict';
import {statementKey} from '../src/dmlPreview.js';
test('statement keys identify rows and new rows',()=>{
 const statements=[{kind:'update',row:1,table:'"A"."T"'},{kind:'update',row:2,table:'"A"."T"'},{kind:'delete',row:3,table:'"A"."T"'},{kind:'insert',id:7,table:'"A"."U"'}];
 assert.deepEqual(statements.map(statementKey),['u:1','u:2','d:3','i:7']);
});
