import test from 'node:test';
import assert from 'node:assert/strict';
import {playCompletionTone,postExecutionActions} from '../src/postExecution.js';
test('notifications require the threshold and respect focus modes',()=>{
 assert.deepEqual(postExecutionActions({elapsedMs:12000,focused:true,sound:'always',attention:'unfocused'}),{sound:true,attention:false});
 assert.deepEqual(postExecutionActions({elapsedMs:12000,focused:false,sound:'unfocused',attention:'unfocused'}),{sound:true,attention:true});
 assert.deepEqual(postExecutionActions({elapsedMs:9999,focused:false,sound:'always',attention:'always'}),{sound:false,attention:false});
 assert.deepEqual(postExecutionActions({elapsedMs:0,focused:false,sound:'always',thresholdSeconds:0}),{sound:true,attention:false});
 assert.deepEqual(postExecutionActions({}),{sound:false,attention:false});
});
test('completion tone is generated locally and tolerates a missing audio API',()=>{
 assert.equal(playCompletionTone(true,undefined),false);
 const calls=[];class FakeContext{currentTime=0;destination={};createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}createOscillator(){const tone={frequency:{},connect(){},start(at){calls.push(['start',tone.frequency.value,at])},stop(){}};return tone}close(){}}
 assert.equal(playCompletionTone(false,FakeContext),true);
 assert.deepEqual(calls.map(call=>call[1]),[440,330]);
 assert.equal(playCompletionTone(true,class{constructor(){throw new Error('blocked')}}),false);
});
import {formatElapsed,taskbarProgressState} from '../src/postExecution.js';
test('taskbar state is indeterminate while running and shows an unseen failure afterwards',()=>{
 assert.equal(taskbarProgressState({running:true,failedUnseen:true}),'indeterminate');
 assert.equal(taskbarProgressState({failedUnseen:true}),'error');
 assert.equal(taskbarProgressState({}),'none');
});
test('elapsed time is human readable',()=>{
 assert.equal(formatElapsed(450),'0 s');assert.equal(formatElapsed(12400),'12 s');assert.equal(formatElapsed(125000),'2 min 5 s');assert.equal(formatElapsed(3900000),'1 h 5 min');
});
