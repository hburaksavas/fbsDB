import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryStore,statementKey,summaryHover,summaryLabel} from '../src/executionSummaries.js';
test('statement keys ignore comments, whitespace and terminators',()=>{
 assert.equal(statementKey('SELECT  1\n FROM dual; -- note'),'SELECT 1 FROM dual');
 assert.equal(statementKey('/* a */ select 1 from dual\n/'),'select 1 from dual');
 assert.notEqual(statementKey('select 1'),statementKey('select 2'));assert.equal(statementKey('  ;'),'');
});
test('labels describe duration, rows, affected rows and failures',()=>{
 assert.equal(summaryLabel({ok:true,elapsedMs:42,rows:1}),'  ✓ 42 ms · 1 row');
 assert.equal(summaryLabel({ok:true,elapsedMs:2500,rows:1200,hasMore:true}),'  ✓ 3 s · 1,200 rows+');
 assert.equal(summaryLabel({ok:true,elapsedMs:5,rowsAffected:3}),'  ✓ 5 ms · 3 rows affected');
 assert.equal(summaryLabel({ok:false,elapsedMs:900}),'  ✗ failed · 900 ms');assert.equal(summaryLabel(null),'');
 const hover=summaryHover({ok:false,message:'ORA-00942',profile:'DEV',executedAt:'2026-11-02T10:00:00Z'});
 assert.match(hover,/failed: ORA-00942/);assert.match(hover,/Connection: DEV/);assert.match(hover,/exact statement text/);
});
test('store matches by text per tab, keeps the latest run and stays bounded',()=>{
 const store=createSummaryStore();
 store.record('a','select 1;',{ok:true,elapsedMs:1});store.record('a','SELECT 1',{ok:true,elapsedMs:2});store.record('a','select 1  ',{ok:false,elapsedMs:3});
 assert.equal(store.get('a','select 1 ;').ok,false);assert.equal(store.size('a'),2);assert.equal(store.get('b','select 1'),null);
 for(let i=0;i<600;i++)store.record('c',`select ${i}`,{ok:true,elapsedMs:i});
 assert.equal(store.size('c'),500);assert.equal(store.get('c','select 0'),null);assert.ok(store.get('c','select 599'));
 store.forget('c');assert.equal(store.size('c'),0);
});
