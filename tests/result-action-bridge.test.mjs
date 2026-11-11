import test from 'node:test';
import assert from 'node:assert/strict';
import {activeResultActions,registerResultActions} from '../src/resultActionBridge.js';
const element=shown=>({isConnected:true,getClientRects:()=>shown?[{}]:[]});
test('no result toolbar on screen means no result commands',()=>{
 assert.deepEqual(activeResultActions(),[]);
 const off=registerResultActions({element:element(false),get:()=>[{id:'pin',label:'Pin result',run(){}}]});
 assert.deepEqual(activeResultActions(),[]);off();
});
test('the visible toolbar supplies prefixed commands that keep their enabled state and run its callback',()=>{
 let ran=0;
 const off=registerResultActions({element:element(true),get:()=>[{id:'pin',label:'Pin result',disabled:false,run:()=>{ran++}},{id:'memory',label:'Result memory',disabled:true,run(){}}]});
 const [first,second]=activeResultActions();
 assert.equal(first.id,'result.pin');assert.equal(first.label,'Result: Pin result');assert.equal(first.disabled,false);first.run();assert.equal(ran,1);
 assert.equal(second.disabled,true);assert.equal(second.detail,'Not available right now');
 off();assert.deepEqual(activeResultActions(),[]);
});
