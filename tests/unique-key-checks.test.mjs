import test from 'node:test';
import assert from 'node:assert/strict';
import {findDuplicateKeys} from '../src/uniqueKeyChecks.js';
import {editCell,editInserted,emptyDrafts,insertRow,toggleDeleted} from '../src/gridDrafts.js';
const columns=[{name:'ID'},{name:'REGION'},{name:'NAME'}];
const rows=[{index:0,row:['1','EU','a']},{index:1,row:['2','EU','b']},{index:2,row:['3',null,'c']}];
const check=(drafts,identity=[0])=>findDuplicateKeys({columns,identity,rows,drafts});
test('editing a key to another row key, or inserting an existing key, is reported with both rows',()=>{
 let drafts=editCell(emptyDrafts(),0,0,'1',{value:'2'});
 assert.deepEqual(check(drafts).map(item=>item.rows),[['Row 1','Row 2']]);assert.match(check(drafts)[0].message,/ID = 2/);
 drafts=insertRow(emptyDrafts(),{});drafts=editInserted(drafts,1,0,{value:'3'});
 assert.deepEqual(check(drafts).map(item=>item.rows),[['Row 3','New row 1']]);
 drafts=insertRow(drafts,{});drafts=editInserted(drafts,2,0,{value:'3'});assert.equal(check(drafts)[0].rows.length,3);
});
test('deleted rows free their key and unchanged data has no duplicates',()=>{
 assert.deepEqual(check(emptyDrafts()),[]);
 let drafts=toggleDeleted(emptyDrafts(),1);drafts=editCell(drafts,0,0,'1',{value:'2'});assert.deepEqual(check(drafts),[]);
});
test('keys with NULL never collide and omitted new-row keys are unknown',()=>{
 let drafts=editCell(emptyDrafts(),0,1,'EU',{isNull:true});drafts=editCell(drafts,1,1,'EU',{isNull:true});
 assert.deepEqual(check(drafts,[1]),[],'NULL region values do not collide');
 drafts=insertRow(emptyDrafts(),{});drafts=editInserted(drafts,1,2,{value:'x'});assert.deepEqual(check(drafts),[]);
});
test('composite keys collide only when every part matches',()=>{
 let drafts=editCell(emptyDrafts(),0,0,'1',{value:'2'});assert.equal(check(drafts,[0,1]).length,1);
 drafts=editCell(drafts,0,1,'EU',{value:'US'});assert.deepEqual(check(drafts,[0,1]),[]);
});
