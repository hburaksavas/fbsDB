import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsedQueryTime,formatQueryDuration,queryFailureDetails,LONG_QUERY_MS} from '../src/resultStatus.js';

test('elapsed query time is stable across remounts and handles clock changes',()=>{
 assert.equal(elapsedQueryTime(1000,5000),4000);
 assert.equal(elapsedQueryTime(5000,1000),0);
 assert.equal(elapsedQueryTime(undefined,1000),0);
 assert.equal(formatQueryDuration(1999),'1s');
 assert.equal(formatQueryDuration(61000),'1m 01s');
 assert.equal(LONG_QUERY_MS,2000);
});
test('query errors retain exact database diagnostics alongside a clear explanation',()=>{
 const message='ORA-00942: table or view does not exist\nline 2';
 const result=queryFailureDetails({kind:'error',message});
 assert.equal(result.code,'ORA-00942');assert.equal(result.message,message);
 assert.match(result.title,/inaccessible/);assert.match(result.hint,/permissions/);
 assert.equal(queryFailureDetails({kind:'timeout',message:'Timeout after 30s'}).title,'Query timed out');
 assert.equal(queryFailureDetails({kind:'cancelled'}).kind,'cancelled');
 assert.equal(queryFailureDetails({message:'Network request failed'}).title,'Query failed');
});
