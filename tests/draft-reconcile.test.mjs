import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDrafts,resolveConflict} from '../src/draftReconcile.js';
import {cellDraft,editCell,emptyDrafts,toggleDeleted} from '../src/gridDrafts.js';
const oldRows=new Map([[0,['1','a']],[1,['2','b']],[2,['3','c']]]);
test('drafts follow their rows to new positions by the original key',()=>{
 let drafts=editCell(emptyDrafts(),1,1,'b',{value:'B'});drafts=toggleDeleted(drafts,2);
 const newRows=[{index:0,row:['3','c']},{index:1,row:['2','b']},{index:2,row:['9','z']}];
 const result=reconcileDrafts({drafts,oldRows,newRows,identity:[0]});
 assert.deepEqual(result.conflicts,[]);assert.equal(cellDraft(result.drafts,1,1).value,'B');assert.deepEqual(result.drafts.deleted,[0]);
});
test('a vanished row and a value changed underneath are conflicts, never silent overwrites or losses',()=>{
 let drafts=editCell(emptyDrafts(),0,1,'a',{value:'A'});drafts=editCell(drafts,1,1,'b',{value:'B'});
 const newRows=[{index:0,row:['2','changed']}];
 const result=reconcileDrafts({drafts,oldRows,newRows,identity:[0]});
 assert.deepEqual(result.conflicts.map(item=>item.kind).sort(),['changed','missing']);
 const changed=result.conflicts.find(item=>item.kind==='changed');assert.match(changed.message,/changed from "b" to "changed"/);
 assert.ok(cellDraft(result.drafts,0,1),'the edit is kept until the user decides');
 assert.match(result.conflicts.find(item=>item.kind==='missing').message,/Row 1 is no longer/);
});
test('resolving keeps the edit on top of the current value or takes the database value',()=>{
 const drafts=editCell(emptyDrafts(),0,1,'b',{value:'B'});
 const conflict={kind:'changed',row:0,col:1,current:'changed'};
 assert.equal(cellDraft(resolveConflict(drafts,conflict,'mine'),0,1).original,'changed');
 assert.equal(cellDraft(resolveConflict(drafts,conflict,'theirs'),0,1),null);
});
test('rows without a usable key cannot be matched and are reported',()=>{
 const drafts=editCell(emptyDrafts(),0,1,'a',{value:'A'});
 const nullKey=new Map([[0,[null,'a']]]);
 assert.equal(reconcileDrafts({drafts,oldRows:nullKey,newRows:[{index:0,row:[null,'a']}],identity:[0]}).conflicts[0].kind,'missing');
});
