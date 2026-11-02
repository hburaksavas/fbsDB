import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutToolbar,toolbarItems,toolbarMetrics} from '../src/editorToolbarModel.js';
const ids=list=>list.map(item=>item.id);
test('a wide toolbar shows every action inline in left-to-right order with nothing in overflow',()=>{
 const layout=layoutToolbar(1400);
 assert.deepEqual(ids(layout.inline),ids(toolbarItems));assert.deepEqual(layout.overflow,[]);
});
test('narrowing moves the lowest-priority actions to overflow first and keeps the original order',()=>{
 const wide=layoutToolbar(620),narrow=layoutToolbar(430);
 assert.ok(wide.overflow.length>0&&wide.inline.length>narrow.inline.length);
 for(const layout of [wide,narrow]){
  assert.deepEqual([...ids(layout.inline),...ids(layout.overflow)].sort(),ids(toolbarItems).sort());
  const order=ids(toolbarItems);assert.deepEqual(ids(layout.inline),order.filter(id=>ids(layout.inline).includes(id)));
 }
 assert.ok(ids(layoutToolbar(260).inline).every(id=>ids(narrow.inline).includes(id)));
 assert.equal(ids(wide.overflow).includes('rows'),true);
 assert.equal(ids(narrow.inline).includes('commit')&&ids(narrow.inline).includes('format'),true);
});
test('inline width never exceeds the space left after the fixed controls',()=>{
 for(let width=0;width<1500;width+=37){
  const {inline}=layoutToolbar(width);
  const groups=inline.reduce((count,item,index)=>count+(index&&inline[index-1].group!==item.group?1:0),0);
  const used=inline.reduce((sum,item)=>sum+(item.kind==='rows'?toolbarMetrics.rows:toolbarMetrics.button),0)+groups*toolbarMetrics.separator;
  assert.ok(used<=Math.max(0,width-toolbarMetrics.fixed),`${width}: ${used}`);
 }
 assert.deepEqual(layoutToolbar(0).inline,[]);
});
test('toolbar offers the new actions in addition to the original ones',()=>{
 for(const id of ['open','undo','format','commit','rollback','autoCommit','rows','save','new','redo','find','comment','explain'])assert.ok(ids(toolbarItems).includes(id),id);
});
