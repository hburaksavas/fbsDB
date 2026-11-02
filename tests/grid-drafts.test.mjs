import test from 'node:test';
import assert from 'node:assert/strict';
import {adjacentEdit,cellDraft,editCell,editInserted,emptyDrafts,insertRow,isDeleted,isDirty,pendingChanges,pendingSummary,redo,removeInserted,revertCell,revertRow,toggleDeleted,undo} from '../src/gridDrafts.js';
test('edits are staged with the original and an explicit NULL differs from an empty string',()=>{
 let state=editCell(emptyDrafts(),0,1,'old',{value:'new'});
 assert.deepEqual(cellDraft(state,0,1),{original:'old',value:'new',isNull:false});
 state=editCell(state,0,2,'x',{isNull:true});assert.deepEqual(cellDraft(state,0,2),{original:'x',value:'',isNull:true});
 state=editCell(state,0,3,'x',{value:''});assert.equal(cellDraft(state,0,3).isNull,false);assert.equal(isDirty(state),true);
});
test('setting a cell back to its original value removes the marker instead of staging a no-op',()=>{
 let state=editCell(emptyDrafts(),2,0,5,{value:'6'});
 state=editCell(state,2,0,5,{value:'5'});assert.equal(cellDraft(state,2,0),null);assert.equal(isDirty(state),false);
 assert.equal(editCell(emptyDrafts(),0,0,null,{isNull:true}).cells['0:0'],undefined);
 const untouched=emptyDrafts();assert.equal(editCell(untouched,0,0,'a',{value:'a'}),untouched);
});
test('undo and redo walk the draft history and new edits clear redo',()=>{
 let state=editCell(emptyDrafts(),0,0,'a',{value:'b'});state=editCell(state,0,1,'c',{value:'d'});
 state=undo(state);assert.equal(cellDraft(state,0,1),null);assert.ok(cellDraft(state,0,0));
 state=redo(state);assert.ok(cellDraft(state,0,1));
 state=undo(undo(state));assert.equal(isDirty(state),false);assert.equal(undo(state),state);
 state=editCell(state,3,0,'x',{value:'y'});assert.equal(redo(state),state);
});
test('reverting one cell or one row keeps all other draft changes',()=>{
 let state=editCell(emptyDrafts(),0,0,'a',{value:'1'});state=editCell(state,0,1,'b',{value:'2'});state=editCell(state,1,0,'c',{value:'3'});state=toggleDeleted(state,0);
 state=revertCell(state,0,0);assert.equal(cellDraft(state,0,0),null);assert.ok(cellDraft(state,0,1));
 state=revertRow(state,0);assert.equal(cellDraft(state,0,1),null);assert.equal(isDeleted(state,0),false);assert.ok(cellDraft(state,1,0));
 assert.equal(revertRow(state,9),state);assert.equal(revertCell(state,9,9),state);
});
test('summary and ordered change list cover updates, inserts and deletes',()=>{
 let state=editCell(emptyDrafts(),3,1,'a',{value:'b'});state=editCell(state,1,0,'c',{isNull:true});state=editCell(state,1,2,'x',{value:'y'});
 state=toggleDeleted(state,5);state=insertRow(state,{});state=editInserted(state,1,0,{value:'new'});
 assert.deepEqual(pendingSummary(state),{updates:2,cells:3,inserts:1,deletes:1,total:4});
 assert.deepEqual(pendingChanges(state).map(item=>item.kind==='update'?`u${item.row}:${item.col}`:item.kind==='delete'?`d${item.row}`:`i${item.id}`),['d5','u1:0','u1:2','u3:1','i1']);
 assert.deepEqual(pendingChanges(state).at(-1).values,{0:{value:'new'}});
 state=removeInserted(state,1);assert.equal(pendingSummary(state).inserts,0);
});
test('deleting a row hides its cell edits from the pending list and counts it once',()=>{
 let state=editCell(emptyDrafts(),2,0,'a',{value:'b'});state=toggleDeleted(state,2);
 assert.deepEqual(pendingSummary(state),{updates:0,cells:1,inserts:0,deletes:1,total:1});assert.deepEqual(pendingChanges(state).map(item=>item.kind),['delete']);
 assert.equal(isDeleted(toggleDeleted(state,2),2),false);
});
test('stepping between edited cells wraps in both directions',()=>{
 let state=editCell(emptyDrafts(),1,0,'a',{value:'b'});state=editCell(state,4,2,'c',{value:'d'});
 assert.deepEqual(adjacentEdit(state,null,1),{row:1,col:0});assert.deepEqual(adjacentEdit(state,{row:1,col:0},1),{row:4,col:2});
 assert.deepEqual(adjacentEdit(state,{row:4,col:2},1),{row:1,col:0});assert.deepEqual(adjacentEdit(state,{row:1,col:0},-1),{row:4,col:2});
 assert.deepEqual(adjacentEdit(state,null,-1),{row:4,col:2});assert.equal(adjacentEdit(emptyDrafts(),null,1),null);
});
import {settleApplied} from '../src/gridDrafts.js';
test('applied statements leave the drafts while failed, mismatched and skipped ones stay editable',()=>{
 let state=editCell(emptyDrafts(),0,1,'a',{value:'b'});state=editCell(state,2,1,'c',{isNull:true});state=editCell(state,3,1,'d',{value:'e'});state=toggleDeleted(state,5);state=toggleDeleted(state,6);
 const statements=[{kind:'delete',row:5},{kind:'delete',row:6},{kind:'update',row:0},{kind:'update',row:2},{kind:'update',row:3}];
 const outcomes=[{index:0,status:'applied'},{index:1,status:'mismatch'},{index:2,status:'applied'},{index:3,status:'failed'},{index:4,status:'skipped'}];
 const result=settleApplied(state,statements,outcomes);
 assert.deepEqual(result.appliedCells,{'0:1':'b'});assert.deepEqual(result.appliedDeleted,[5]);
 assert.deepEqual(Object.keys(result.drafts.cells).sort(),['2:1','3:1']);assert.deepEqual(result.drafts.deleted,[6]);
 assert.deepEqual([result.drafts.past.length,result.drafts.future.length],[0,0]);
 assert.equal(cellDraft(result.drafts,2,1).isNull,true);
});
import {missingRequired} from '../src/gridDrafts.js';
test('new rows keep only filled columns, distinguish NULL and count missing required inputs',()=>{
 let state=insertRow(emptyDrafts(),{});
 state=editInserted(state,1,0,{value:'7'});state=editInserted(state,1,1,{isNull:true});state=editInserted(state,1,2,{value:''});
 assert.deepEqual(state.inserted[0].values,{0:{value:'7'},1:{isNull:true}});
 state=editInserted(state,1,0,{omit:true});assert.deepEqual(Object.keys(state.inserted[0].values),['1']);
 const columns=[{nullable:false},{nullable:false,hasDefault:true},{nullable:false,identity:true},{nullable:true},{nullable:false}];
 const editable=columns.map(()=>({editable:true}));
 assert.deepEqual(missingRequired(columns,editable,{4:{value:'x'}}).map(item=>item.index),[0]);
 assert.deepEqual(missingRequired(columns,editable,{}).map(item=>item.index),[0,4]);
});
