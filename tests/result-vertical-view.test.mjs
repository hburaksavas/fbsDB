import test from 'node:test';
import assert from 'node:assert/strict';
import {verticalOffset,verticalPage,rowSourceValues} from '../src/resultVerticalView.js';
const loaded=Array.from({length:10},(_,index)=>({index,row:[index]}));
test('the vertical view opens on the row the grid had focused',()=>{
 assert.equal(verticalOffset(loaded,4),4);
 const sorted=[...loaded].reverse();
 assert.equal(verticalOffset(sorted,2),7);
 const filtered=loaded.filter(item=>item.index%2===0);
 assert.equal(verticalOffset(filtered,6),3);
});
test('a row that is no longer loaded or was never named falls back to the first row',()=>{
 assert.equal(verticalOffset(loaded.filter(item=>item.index%2===0),5),0);
 assert.equal(verticalOffset(loaded,null),0);
 assert.equal(verticalOffset([],3),0);
 assert.equal(verticalOffset(undefined,3),0);
});
test('returning to the table lands on the page that holds the shown row',()=>{
 assert.equal(verticalPage(0,50),0);
 assert.equal(verticalPage(49,50),0);
 assert.equal(verticalPage(50,50),1);
 assert.equal(verticalPage(249,100),2);
 assert.equal(verticalPage(12,undefined),0);
 assert.equal(verticalPage(12,0),0);
});
test('foreign key lookups get row values keyed by source column',()=>{
 const columns=[{name:'ID',sourceColumn:'ORDER_ID'},{name:'CUST',sourceColumn:'CUSTOMER_ID'},{name:'TOTAL'}];
 assert.deepEqual(rowSourceValues(columns,[7,42,null]),{ORDER_ID:7,CUSTOMER_ID:42,TOTAL:null});
});
