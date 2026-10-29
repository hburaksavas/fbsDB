import test from 'node:test';
import assert from 'node:assert/strict';
import { resultToolbarLayout } from '../src/resultToolbarLayout.js';
test('one overflow menu retains every action and its disabled/active state exactly once',()=>{
 const groups=[[['view',null,'Table view',false],['pivot',null,'Pivot',false,true]],[['inspect',null,'Inspect',true]],[['export',null,'Export',true]]];
 for(const capacity of [0,1,2,3,4,100]){
  const layout=resultToolbarLayout(groups,capacity),visible=groups.flat().filter(item=>layout.visibleIds.has(item[0]));
  assert.deepEqual([...visible,...layout.overflow],groups.flat());
  assert.equal(new Set([...visible,...layout.overflow].map(item=>item[0])).size,4);
  assert.equal([...visible,...layout.overflow].find(item=>item[0]==='inspect')[3],true);
  assert.equal([...visible,...layout.overflow].find(item=>item[0]==='pivot')[4],true);
 }
});
test('wide toolbars need no overflow and an empty result still has a valid layout',()=>{
 assert.equal(resultToolbarLayout([[['export']]],10).overflow.length,0);
 assert.deepEqual(resultToolbarLayout([],0).overflow,[]);
});
