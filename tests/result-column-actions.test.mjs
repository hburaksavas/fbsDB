import test from 'node:test';
import assert from 'node:assert/strict';
import { columnKind, columnStatistics, columnSqlDraft, columnOrder, moveColumn, nextColumnSort, validateColumnRule } from '../src/resultColumnActions.js';

test('column statistics retain exact Oracle decimals and exclude NULL from distinct counts',()=>{
  const values=['123456789012345678901234567890',null,'0.000000000000000000000000000001','1.0','1'];
  const stats=columnStatistics(values.map(value=>({row:[value]})),{type:'NUMBER'},0);
  assert.equal(stats.count,5);assert.equal(stats.nulls,1);assert.equal(stats.nonNulls,4);assert.equal(stats.distinct,3);
  assert.equal(stats.sum,'123456789012345678901234567892.000000000000000000000000000001');
  assert.equal(stats.max,values[0]);assert.equal(stats.min,values[2]);assert.equal(stats.numericCount,4);
  assert.deepEqual(values,['123456789012345678901234567890',null,'0.000000000000000000000000000001','1.0','1']);
});
test('text and binary statistics never coerce text into numeric aggregates',()=>{
  const stats=columnStatistics([{row:['1']},{row:['1']},{row:['01']},{row:[null]}],{type:'VARCHAR2'},0);
  assert.equal(stats.distinct,2);assert.equal(stats.sum,null);
  assert.equal(columnStatistics([],{type:'NUMBER'},0).average,null);
  assert.equal(columnKind({type:'TIMESTAMP WITH TIME ZONE'}),'date');
  assert.equal(columnKind({type:'BINARY_DOUBLE'}),'number');
});
test('column filter/highlight rules validate invariant numbers and calendar dates',()=>{
  assert.doesNotThrow(()=>validateColumnRule({type:'NUMBER'},'equals','123456789012345678901234567890.001'));
  assert.doesNotThrow(()=>validateColumnRule({type:'DATE'},'equals','2026-10-30T12:00:00'));
  assert.throws(()=>validateColumnRule({type:'NUMBER'},'gt','1,23'),/invariant decimal/);
  assert.throws(()=>validateColumnRule({type:'DATE'},'equals','2026-02-30'),/ISO date/);
  assert.doesNotThrow(()=>validateColumnRule({type:'NUMBER'},'null',''));
});
test('header sorting toggles, explicit directions work, and multi-sort removal preserves other priorities',()=>{
  let state=nextColumnSort({},2);assert.deepEqual(state,{sortColumn:2,sortDirection:'asc',sorts:[]});
  state=nextColumnSort(state,2);assert.equal(state.sortDirection,'desc');
  state=nextColumnSort(state,1,{direction:'asc',multi:true});
  assert.deepEqual(state.sorts,[{column:2,direction:'desc'},{column:1,direction:'asc'}]);
  state=nextColumnSort(state,2,{direction:'asc',multi:true});assert.equal(state.sorts[0].direction,'asc');
  state=nextColumnSort(state,2,{clear:true});assert.deepEqual(state.sorts,[{column:1,direction:'asc'}]);
  state=nextColumnSort(state,0,{direction:'desc'});assert.deepEqual(state,{sortColumn:0,sortDirection:'desc',sorts:[]});
  assert.equal(nextColumnSort(state,0,{clear:true}).sortColumn,-1);
});
test('column movement uses source indices and retains hidden columns in the order',()=>{
  const order=[2,0,3,1];
  assert.deepEqual(moveColumn(order,4,0,'last'),[2,3,1,0]);
  assert.deepEqual(moveColumn(order,4,0,'left'),[0,2,3,1]);
  assert.deepEqual(moveColumn(order,4,0,'right'),[2,3,0,1]);
  assert.deepEqual(moveColumn(order,4,3,'first'),[3,2,0,1]);
  assert.deepEqual(order,[2,0,3,1]);assert.deepEqual(columnOrder([2,2,99,-1],3),[2,0,1]);
});
test('generated column SQL quotes metadata and keeps values as bind placeholders',()=>{
  const column={name:'Alias',sourceColumn:'a"b',sourceTable:'Order Items',sourceSchema:'APP'};
  assert.equal(columnSqlDraft(column,'identifier'),'"a""b"');
  assert.equal(columnSqlDraft(column,'select'),'SELECT "a""b"\nFROM "APP"."Order Items";');
  assert.equal(columnSqlDraft(column,'where'),'WHERE "a""b" = :value');
  assert.equal(columnSqlDraft(column,'order'),'ORDER BY "a""b" ASC');
  assert.match(columnSqlDraft({name:'X'},'select'),/source table or query/);
});
