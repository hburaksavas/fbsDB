import test from 'node:test';
import assert from 'node:assert/strict';
import {stageOverview,stepAdvice} from '../src/connectionAdvice.js';
test('known ORA codes and probe stages get plain-language meanings and checks',()=>{
 const auth=stepAdvice({stage:'Authentication',status:'Failed',message:'ORA-01017: invalid username/password; logon denied'});
 assert.equal(auth.code,1017);assert.match(auth.meaning,/rejected/);assert.ok(auth.checks.length>=2);
 assert.match(stepAdvice({stage:'Oracle service',status:'Failed',message:'ORA-12514: listener does not currently know of service'}).checks[0],/service name/);
 assert.match(stepAdvice({stage:'Network',status:'Warning',message:'TCP probe failed'}).meaning,/TCP port/);
 assert.match(stepAdvice({stage:'Oracle session',status:'Failed',message:'ORA-99999: odd'}).meaning,/no built-in explanation/);
 assert.equal(stepAdvice({stage:'DNS',status:'Succeeded',message:'ok'}),null);assert.equal(stepAdvice({stage:'Network',status:'Skipped',message:''}),null);assert.equal(stepAdvice(null),null);
});
test('overview orders the four stages and marks what was not reached after a failure',()=>{
 const failed=stageOverview([{stage:'DNS',status:'Succeeded'},{stage:'Network',status:'Warning'},{stage:'Target',status:'Failed',message:'ORA-12154'}]);
 assert.deepEqual(failed.map(item=>[item.stage,item.state]),[['DNS','passed'],['Network','warning'],['Oracle service','failed'],['Authentication','not reached']]);
 const ok=stageOverview([{stage:'DNS',status:'Succeeded'},{stage:'Network',status:'Succeeded'},{stage:'Authentication',status:'Succeeded'},{stage:'Oracle session',status:'Succeeded'}]);
 assert.deepEqual(ok.map(item=>item.state),['passed','passed','passed','passed']);assert.equal(ok[2].implied,true);
 const delegated=stageOverview([{stage:'DNS',status:'Skipped'},{stage:'Network',status:'Skipped'},{stage:'Authentication',status:'Failed',message:'ORA-01017'}]);
 assert.deepEqual(delegated.map(item=>item.state),['skipped','skipped','not reached','failed'].map((state,index)=>index===2?'not run':state));
});
