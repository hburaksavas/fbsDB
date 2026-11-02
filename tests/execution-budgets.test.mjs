import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateResultBytes,evaluateBudget} from '../src/executionBudgets.js';
test('memory estimate scales with row count and value size using sampling',()=>{
 const small=Array.from({length:1000},()=>['1','ab']),large=Array.from({length:1000},()=>['1','x'.repeat(500)]);
 assert.ok(estimateResultBytes(large)>estimateResultBytes(small)*5);
 assert.equal(estimateResultBytes([]),0);assert.equal(estimateResultBytes(null),0);
 const double=estimateResultBytes([...small,...small]);assert.ok(Math.abs(double/estimateResultBytes(small)-2)<0.05);
 assert.ok(estimateResultBytes([[{kind:'binary',byteLength:1048576}]])>=1048576);
});
test('limits of zero are off; row and memory budgets stop or warn with explicit wording',()=>{
 assert.deepEqual(evaluateBudget({rows:1e9,bytes:1e12},{}),{exceeded:null,stop:false,message:''});
 const rows=evaluateBudget({rows:5000,bytes:1000},{maxRows:5000});
 assert.equal(rows.exceeded,'rows');assert.equal(rows.stop,true);assert.match(rows.message,/5,000 row limit/);assert.match(rows.message,/does not limit database resources/);
 const memory=evaluateBudget({rows:10,bytes:60*1048576},{maxMemoryMb:50,action:'warn'});
 assert.equal(memory.exceeded,'memory');assert.equal(memory.stop,false);assert.match(memory.message,/client-side warning only/);
 assert.equal(evaluateBudget({rows:4999,bytes:0},{maxRows:5000}).exceeded,null);
});
