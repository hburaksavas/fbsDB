import test from 'node:test';
import assert from 'node:assert/strict';
import {distinctColumnValues,typedFilterRule} from '../src/typedFilters.js';
import {matchesCondition} from '../src/resultFeatures.js';
test('value lists are distinct, counted, naturally sorted and bounded',()=>{
 const rows=[['b'],['a10'],['a2'],[null],['b'],[{kind:'binary'}]].map((row,index)=>({row,index}));
 const list=distinctColumnValues(rows,0);
 assert.deepEqual(list.values,[{value:'a2',count:1},{value:'a10',count:1},{value:'b',count:2}]);assert.equal(list.nulls,1);assert.equal(list.truncated,false);
 assert.equal(distinctColumnValues(rows,0,2).truncated,true);
});
test('typed rules map ranges and lists to the loaded-row filter engine',()=>{
 assert.deepEqual(typedFilterRule('number',1,{from:'10',to:''}).rule,{column:1,kind:'number',group:'root',op:'gte',value:'10'});
 assert.match(typedFilterRule('number',1,{from:'5',to:'1'}).error,/greater/);
 assert.match(typedFilterRule('number',1,{from:'x'}).error,/numbers/);
 assert.deepEqual(typedFilterRule('date',0,{from:'2026-01-01',to:'2026-01-31T12:30'}).rule,{column:0,kind:'date',group:'root',op:'between',value:'2026-01-01 00:00:00',to:'2026-01-31 12:30:00'});
 assert.match(typedFilterRule('date',0,{}).error,/bound/);
 const list=typedFilterRule('list',2,{values:['A'],includeNull:true}).rule;
 assert.equal(matchesCondition('A',list),true);assert.equal(matchesCondition('B',list),false);assert.equal(matchesCondition(null,list),true);
 assert.equal(matchesCondition(null,{...list,includeNull:false}),false);
 assert.match(typedFilterRule('list',2,{values:[]}).error,/at least one/);
});
test('range rules evaluate exact numbers and Oracle temporal values',()=>{
 const number=typedFilterRule('number',0,{from:'10.5',to:'20'}).rule;
 assert.equal(matchesCondition('12345678901234567890',number),false);assert.equal(matchesCondition('10.50',number),true);
 const date=typedFilterRule('date',0,{from:'2026-01-01',to:'2026-01-31'}).rule;
 assert.equal(matchesCondition({kind:'temporal',oracleType:'DATE',value:'2026-01-15 08:00:00'},date),true);
 assert.equal(matchesCondition({kind:'temporal',oracleType:'DATE',value:'2026-02-01 00:00:00'},date),false);
});
test('value-list filters translate to bound IN conditions for an explicit server filter',async()=>{
 const {buildServerFilter}=await import('../src/resultAdvanced.js');
 const result=buildServerFilter('SELECT status FROM t',[{name:'STATUS',type:'VARCHAR2'}],{filters:[{column:0,op:'in',kind:'text',values:['A','B'],includeNull:true,group:'root'}]});
 assert.match(result.sql,/\("STATUS" IN \(:fbs_filter_\w+_0, :fbs_filter_\w+_1\) OR "STATUS" IS NULL\)/);
 assert.deepEqual(result.parameters.map(p=>p.value),['A','B']);
});
