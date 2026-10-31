import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyFeedback,dismissFeedback,feedbackSnapshot,subscribeFeedback,setFeedbackScopes,configureFeedback} from '../src/feedbackStore.js';
const clear=()=>feedbackSnapshot().forEach(item=>dismissFeedback(item.id));
test('operation progress updates in place, completes without stale Cancel and retains SQL owner',()=>{
 clear();setFeedbackScopes({'tab-a':'Invoice.sql','tab-b':'Report.sql'});let cancelled=null;
 notifyFeedback({id:'export:a',scope:'tab-a',kind:'progress',title:'Export',message:'10 rows',actions:[{label:'Cancel',onClick:()=>cancelled='tab-a'}]});
 notifyFeedback({id:'export:b',scope:'tab-b',kind:'progress',title:'Export',message:'20 rows'});
 notifyFeedback({id:'export:a',scope:'tab-a',kind:'progress',title:'Export',message:'30 rows',actions:[{label:'Cancel',onClick:()=>cancelled='tab-a'}]});
 assert.equal(feedbackSnapshot().length,2);const item=feedbackSnapshot().find(i=>i.id==='export:a');assert.equal(item.scopeLabel,'Invoice.sql');item.actions[0].onClick();assert.equal(cancelled,'tab-a');
 notifyFeedback({id:'export:a',scope:'tab-a',kind:'success',message:'Done'});
 assert.equal(feedbackSnapshot().find(i=>i.id==='export:a').actions,undefined);assert.equal(feedbackSnapshot().find(i=>i.id==='export:b').kind,'progress');clear();
});
test('duplicate errors do not flood the stack and dismissed errors can be reported again',()=>{
 clear();let updates=0;const stop=subscribeFeedback(()=>updates++);
 const error={kind:'error',scope:'tab-a',title:'Save failed',message:'Access denied'};
 const id=notifyFeedback(error);assert.equal(notifyFeedback(error),id);assert.equal(feedbackSnapshot().length,1);assert.equal(updates,1);
 notifyFeedback({...error,scope:'tab-b'});assert.equal(feedbackSnapshot().length,2);
 dismissFeedback(id);notifyFeedback(error);assert.equal(feedbackSnapshot().length,2);stop();clear();
});
test('removing progress does not discard unrelated errors or truncate a large error queue',()=>{
 clear();for(let i=0;i<12;i++)notifyFeedback({id:`error:${i}`,kind:'error',message:`Failure ${i}`});
 notifyFeedback({id:'progress',kind:'progress',message:'Loading'});dismissFeedback('progress');assert.equal(feedbackSnapshot().length,12);
 const before=feedbackSnapshot();dismissFeedback('missing');assert.equal(feedbackSnapshot(),before);clear();
});

test('every notification expires at the configured maximum, including actions and updating progress',t=>{
 clear();t.mock.timers.enable({apis:['setTimeout','Date'],now:10000});
 configureFeedback({max:1,error:15,warning:10,info:5,success:4,progress:60});
 for(const kind of ['error','warning','info','success','progress'])notifyFeedback({id:'expires:'+kind,kind,message:kind,actions:[{label:'Action',onClick(){}}]});
 t.mock.timers.tick(500);notifyFeedback({id:'expires:progress',kind:'progress',message:'Still working'});
 t.mock.timers.tick(501);assert.equal(feedbackSnapshot().length,0);
 notifyFeedback({id:'expires:progress',kind:'progress',message:'Still working again'});assert.equal(feedbackSnapshot().length,0);
 notifyFeedback({id:'expires:progress',kind:'success',message:'Done'});assert.equal(feedbackSnapshot().length,1);
 clear();configureFeedback({max:60,error:15,warning:10,info:5,success:4,progress:60});t.mock.timers.reset();
});
