import test from 'node:test';
import assert from 'node:assert/strict';
import {applyColumnVisibility} from '../src/columnVisibilityBrush.js';
test('brush applies one consistent state regardless of each column starting state',()=>{
 assert.deepEqual(applyColumnVisibility([1],[0,1,2],false,5).hidden,[0,1,2]);
 assert.deepEqual(applyColumnVisibility([0,2,4],[0,1,2],true,5).hidden,[4]);
 assert.deepEqual(applyColumnVisibility([],[7,-1],false,3).hidden,[]);
});
test('brush never hides every column',()=>{
 const result=applyColumnVisibility([2],[0,1],false,3);
 assert.deepEqual(result.hidden,[2]);assert.match(result.error,/At least one column/);
});
