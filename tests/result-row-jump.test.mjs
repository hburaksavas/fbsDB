import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveResultRowJump} from '../src/resultRowJump.js';
const loaded=Array.from({length:10},(_,index)=>({index,row:[index]}));
test('row jump uses loaded result numbering in sorted and filtered views',()=>{
 const sorted=[...loaded].reverse();
 assert.deepEqual(resolveResultRowJump('3',{rows:sorted,loadedCount:10}),{position:7,number:3,index:2});
 const filtered=loaded.filter(item=>item.index%2===0);
 assert.deepEqual(resolveResultRowJump(' 5 ',{rows:filtered,loadedCount:10}),{position:2,number:5,index:4});
 assert.match(resolveResultRowJump('4',{rows:filtered,loadedCount:10}).error,/hidden by the current filter/);
});
test('row jump finds rows on another page of the filtered view',()=>{
 const filtered=loaded.filter(item=>item.index!==1),page=filtered.slice(0,4);
 assert.deepEqual(resolveResultRowJump('9',{rows:page,viewRows:filtered,loadedCount:10,pageSize:4}),{page:1,number:9,index:8});
 assert.match(resolveResultRowJump('2',{rows:page,viewRows:filtered,loadedCount:10,pageSize:4}).error,/hidden/);
});
test('row jump rejects invalid input and rows beyond the loaded rows; frozen rows are reported',()=>{
 for(const value of ['', '0', '-1', '2.5', 'abc'])assert.match(resolveResultRowJump(value,{rows:loaded}).error,/1 or greater/);
 assert.match(resolveResultRowJump('11',{rows:loaded}).error,/Only 10 rows are loaded/);
 assert.match(resolveResultRowJump('1',{rows:[]}).error,/No result rows/);
 assert.equal(resolveResultRowJump('2',{rows:loaded.filter(item=>item.index!==1),loadedCount:10,frozenRows:[1]}).frozen,true);
});
