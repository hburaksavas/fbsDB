import test from 'node:test';
import assert from 'node:assert/strict';
import { getResultWindow, RESULT_ROW_HEIGHT } from '../src/resultWindow.js';
test('large pages render only a bounded visible window',()=>{
 for (const count of [1000,10000]) for(const top of [0,500,20000,count*26]) {
  const view=getResultWindow(count,top,500);
  assert.ok(view.end-view.start<=Math.ceil(500/26)+17);
  assert.equal(view.top+(view.end-view.start)*26+view.bottom,count*RESULT_ROW_HEIGHT);
  assert.ok(view.start>=0 && view.end<=count);
 }
});
test('empty results and final rows keep valid bounds',()=>{
 assert.deepEqual(getResultWindow(0,0,400),{start:0,end:0,top:0,bottom:0});
 assert.equal(getResultWindow(1000,26000,300).end,1000);
 assert.equal(getResultWindow(5,0,400).end,5);
});
test('comfortable and wrapped rows keep virtualization offsets consistent',()=>{
 for(const height of [34,64]) {
  const window=getResultWindow(1000,5000,300,height);
  assert.equal(window.top+(window.end-window.start)*height+window.bottom,1000*height);
  assert.ok(window.end-window.start<40);
 }
});
