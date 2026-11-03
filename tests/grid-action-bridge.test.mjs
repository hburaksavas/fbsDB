import test from 'node:test';
import assert from 'node:assert/strict';
import {activeGridActions,registerGridActions} from '../src/gridActionBridge.js';
const element=shown=>({isConnected:true,getClientRects:()=>shown?[{}]:[]});
test('no edit bar on screen means no grid commands',()=>{
 assert.deepEqual(activeGridActions(),[]);
 const off=registerGridActions({element:element(false),get:()=>[{id:'newRow',label:'Add a new row draft',run(){}}]});
 assert.deepEqual(activeGridActions(),[]);off();
});
test('the visible bar supplies prefixed commands that keep their enabled state and run the bar callback',()=>{
 let ran=0;
 const off=registerGridActions({element:element(true),get:()=>[
  {id:'newRow',label:'Add a new row draft',detail:'Stays local',run:()=>{ran++}},
  {id:'bulk',label:'Bulk edit…',disabled:true,why:'Select cells first',run(){}}]});
 const [first,second]=activeGridActions();
 assert.equal(first.id,'grid.newRow');assert.equal(first.label,'Grid: Add a new row draft');assert.equal(first.disabled,false);first.run();assert.equal(ran,1);
 assert.equal(second.disabled,true);assert.equal(second.detail,'Select cells first');
 off();assert.deepEqual(activeGridActions(),[]);
});
test('a hidden bar is ignored in favour of the one that is shown',()=>{
 const hidden=registerGridActions({element:element(false),get:()=>[{id:'a',label:'Hidden tab action',run(){}}]});
 const shown=registerGridActions({element:element(true),get:()=>[{id:'b',label:'Shown tab action',run(){}}]});
 assert.deepEqual(activeGridActions().map(item=>item.label),['Grid: Shown tab action']);
 hidden();shown();
});
