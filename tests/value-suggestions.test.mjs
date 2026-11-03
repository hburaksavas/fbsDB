import test from 'node:test';
import assert from 'node:assert/strict';
import {columnSuggestions,replaceTemporalPart,suggestionScope} from '../src/valueSuggestions.js';
const rows=['b','a','b',null,'','c','b','a'].map(value=>({row:['x',value]}));
test('suggestions are the loaded distinct values, most frequent first, without NULL or empty text',()=>{
 const result=columnSuggestions(rows,1,value=>value);
 assert.deepEqual(result.values,['b','a','c']);assert.equal(result.distinct,3);assert.equal(result.loaded,8);
 assert.deepEqual(columnSuggestions(rows,1,value=>value,{exclude:'b'}).values,['a','c']);assert.deepEqual(columnSuggestions(rows,1,value=>value,{limit:1}).values,['b']);
});
test('the scope sentence says where suggestions come from and that free entry stays',()=>{
 assert.equal(suggestionScope({values:['b','a','c'],distinct:3,loaded:8}),'Suggestions: 3 of 3 distinct values in the 8 loaded rows. Any other text can still be typed.');
 assert.match(suggestionScope({values:['a'],distinct:1,loaded:1}),/1 of 1 distinct value in the 1 loaded row\./);
});
test('replacing only the date or only the time keeps the other part and the fraction',()=>{
 assert.deepEqual(replaceTemporalPart('2026-11-02 10:30:15.123','date','2027-01-05'),{value:'2027-01-05 10:30:15.123'});
 assert.deepEqual(replaceTemporalPart('2026-11-02 10:30:15.123','time','08:05'),{value:'2026-11-02 08:05:00.123'});
 assert.deepEqual(replaceTemporalPart('2026-11-02','time','23:59:59'),{value:'2026-11-02 23:59:59'});
 assert.deepEqual(replaceTemporalPart('2026-11-02 10:30:15','date','2026-11-02'),{value:'2026-11-02 10:30:15'});
});
test('invalid dates, times and values are explained',()=>{
 assert.match(replaceTemporalPart('2026-11-02 10:30:15','date','2026-02-30').error,/valid date/);assert.match(replaceTemporalPart('2026-11-02 10:30:15','time','24:00').error,/valid time/);
 assert.match(replaceTemporalPart('yesterday','date','2026-01-01').error,/not a plain date/);assert.match(replaceTemporalPart('2026-11-02','week','x').error,/date or the time/);
});
