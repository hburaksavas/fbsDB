import test from 'node:test';
import assert from 'node:assert/strict';
import {planBulkEdit,previewText} from '../src/bulkEdit.js';
import {cellDraft,editCells,emptyDrafts,undo} from '../src/gridDrafts.js';
const cell=(rowIndex,text,extra={})=>({rowIndex,col:1,name:'PRICE',text,editable:true,...extra});
test('setting a value or NULL skips cells that already match',()=>{
 const cells=[cell(0,'5'),cell(1,'7'),cell(2,null)];
 assert.deepEqual(planBulkEdit(cells,{mode:'set',value:'7'}).changes.map(item=>item.rowIndex),[0,2]);
 assert.deepEqual(planBulkEdit(cells,{mode:'null'}).changes.map(item=>[item.rowIndex,item.isNull]),[[0,true],[1,true]]);
});
test('find and replace is literal, case-aware on request and skips NULL',()=>{
 const cells=[cell(0,'a.b A.B'),cell(1,null),cell(2,'none')];
 const plan=planBulkEdit(cells,{mode:'replace',find:'a.b',replacement:'X'});
 assert.deepEqual(plan.changes.map(item=>item.to),['X X']);assert.equal(plan.skipped[0].reason,'The value is NULL.');
 assert.equal(planBulkEdit(cells,{mode:'replace',find:'a.b',replacement:'X',matchCase:true}).changes[0].to,'X A.B');
 assert.equal(planBulkEdit(cells,{mode:'replace',find:''}).error,'Enter the text to find.');
});
test('arithmetic works on numbers only, keeps sensible decimals and reports what it skipped',()=>{
 const cells=[cell(0,'100'),cell(1,'19.99'),cell(2,'abc'),cell(3,null)];
 assert.deepEqual(planBulkEdit(cells,{mode:'percent',amount:'10'}).changes.map(item=>item.to),['110','21.99']);
 assert.deepEqual(planBulkEdit(cells,{mode:'add',amount:'0.5'}).changes.map(item=>item.to),['100.5','20.49']);
 assert.deepEqual(planBulkEdit(cells,{mode:'multiply',amount:'2'}).changes.map(item=>item.to),['200','39.98']);
 const plan=planBulkEdit(cells,{mode:'add',amount:'1'});assert.deepEqual(plan.skipped.map(item=>item.reason),['The value is not a number.','The value is NULL.']);
 assert.equal(planBulkEdit(cells,{mode:'add',amount:'x'}).error,'Enter a number.');
});
test('locked cells are skipped with their reason and the preview summarizes the plan',()=>{
 const plan=planBulkEdit([cell(0,'1',{editable:false,reason:'A virtual column cannot be set.'}),cell(1,'2')],{mode:'set',value:'9'});
 assert.equal(plan.skipped[0].reason,'A virtual column cannot be set.');
 const preview=previewText(plan);assert.equal(preview.summary,'1 cell would change, 1 skipped.');assert.deepEqual(preview.lines,['Row 2 PRICE: 2 → 9']);
});
test('a bulk edit is a single undo step',()=>{
 let state=editCells(emptyDrafts(),[{row:0,col:1,original:'1',value:'9'},{row:1,col:1,original:'2',value:'9'}]);
 assert.ok(cellDraft(state,0,1)&&cellDraft(state,1,1));state=undo(state);assert.equal(cellDraft(state,0,1),null);assert.equal(cellDraft(state,1,1),null);
});
