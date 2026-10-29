import test from 'node:test';
import assert from 'node:assert/strict';
import {ExactDecimal,compileArithmetic,compareExact,formatExact} from '../src/exactDecimal.js';
import {deriveResultData,extractJsonPath,pivotResult,csvText,generateMerge,estimateResultMemory} from '../src/resultWorkbench.js';
import {matchesCondition,selectionStatistics} from '../src/resultFeatures.js';
test('exact decimal arithmetic and formatting never round a 38 digit integer',()=>{
 const huge='12345678901234567890123456789012345678';assert.equal(new ExactDecimal(huge).add(1).toString(),'12345678901234567890123456789012345679');assert.equal(compareExact(huge,'12345678901234567890123456789012345679'),-1);assert.equal(formatExact(huge,{decimals:2}),huge+'.00');assert.equal(new ExactDecimal('0.1').add('0.2').toString(),'0.3');assert.equal(new ExactDecimal('-125').round(-1).toString(),'-130');
 assert.equal(matchesCondition(huge,{kind:'number',op:'equals',value:'12345678901234567890123456789012345679'}),false);
 assert.equal(selectionStatistics([{exactNumber:huge},{exactNumber:'1'}]).sum,'12345678901234567890123456789012345679');
});
test('formula parser supports safe math, functions, NULL and rejects JavaScript',()=>{
 const fn=compileArithmetic('ROUND((SALARY + .5) * 12, 2)',[{name:'SALARY'}]);assert.equal(fn(['100.25']),'1209');assert.equal(compileArithmetic('COALESCE(NULL, 2)',[])([]),'2');assert.throws(()=>compileArithmetic('globalThis.alert(1)',[]));assert.throws(()=>compileArithmetic('SALARY.constructor', [{name:'SALARY'}]));assert.throws(()=>compileArithmetic('1/0',[])([]));
});
test('derived numeric and JSONPath columns keep source rows immutable',()=>{
 const raw=[['2','{"items":[{"price":3},{"price":4}]}']];const data=deriveResultData(raw,[{name:'N',type:'NUMBER'},{name:'JSON'}],[{name:'DOUBLE',kind:'expression',expression:'N * 2'},{name:'PRICES',kind:'json',source:1,expression:'$.items[*].price'}]);assert.deepEqual(data.rows,[['2',raw[0][1],'4','[3,4]']]);assert.equal(raw[0].length,2);assert.equal(extractJsonPath('{"a.b":[1]}',"$['a.b'][0]"),1);assert.throws(()=>extractJsonPath('{}','$.x()'));
});
test('pivot aggregates use exact decimal strings',()=>{
 const result=pivotResult([{row:['A','X','0.1']},{row:['A','X','0.2']},{row:['B','Y','2']}],[{name:'G'},{name:'P'},{name:'N'}],{pivotRows:[0],pivotColumn:1,pivotValue:2,pivotAggregate:'sum'});assert.deepEqual(result.rows.map(item=>item.row),[['A','0.3',null],['B',null,'2']]);
});
test('CSV preferences, metadata memory and MERGE guardrails work',()=>{
 assert.equal(csvText([[null,'a;b']],[{name:'A'},{name:'B'}],{delimiter:';',newline:'lf',quote:'needed',nullValue:'NULL'}),'A;B\nNULL;"a;b"');assert.ok(estimateResultMemory({columns:[],rows:[['abcdef']]})>0);const sql=generateMerge([['1',"O'Brien"]],[{name:'ID',type:'NUMBER'},{name:'NAME'}],[0],'QA.T');assert.ok(sql.includes('WHEN MATCHED THEN UPDATE'));assert.ok(sql.includes("O''Brien"));assert.throws(()=>generateMerge([[null]],[{name:'ID'}],[0],'T'));
});
import {qualifiedIdentifier,typedSqlLiteral} from '../src/resultWorkbench.js';
test('script literals quote identifiers, timestamps and binary without implicit date conversion',()=>{
 assert.equal(qualifiedIdentifier('"Mixed.Schema"."T"'),'"Mixed.Schema"."T"');assert.throws(()=>qualifiedIdentifier('T; DELETE FROM X'));
 assert.equal(typedSqlLiteral('2026-01-02T03:04:05',{type:'DATE'}),"TO_TIMESTAMP('2026-01-02 03:04:05','YYYY-MM-DD HH24:MI:SS')");assert.equal(typedSqlLiteral({kind:'binary',base64:'QUI=',byteLength:2},{type:'RAW'}),"HEXTORAW('4142')");
});
test('small Oracle exponents remain nonzero through arithmetic and averages',()=>{assert.equal(new ExactDecimal('1e-100').div(2).compare('5e-101'),0);assert.equal(compileArithmetic('N / 2',[{name:'N'}])(['1e-100']),new ExactDecimal('5e-101').toString());});

import {mergeDraftData} from '../src/resultWorkbench.js';
test('MERGE export omits large binary columns only explicitly and preserves exact values',()=>{
 const columns=[{name:'ID',type:'NUMBER'},{name:'PAYLOAD',type:'BLOB'},{name:'NAME',type:'VARCHAR2'}];
 const rows=[['12345678901234567890123456789012345678',{kind:'binary',byteLength:2001,base64:''},"O'Brien"]];
 const before=JSON.stringify(rows);
 assert.throws(()=>mergeDraftData(rows,columns,[0],'QA.T'),/Enable omission/);
 const sql=mergeDraftData(rows,columns,[0],'QA.T',true);
 assert.match(sql,/Omitted binary columns: PAYLOAD/);
 assert.match(sql,/12345678901234567890123456789012345678/);
 assert.match(sql,/O''Brien/);
 assert.doesNotMatch(sql.slice(sql.indexOf('MERGE INTO')),/PAYLOAD|COMMIT/);
 assert.throws(()=>mergeDraftData(rows,columns,[1],'QA.T',true),/matching key/);
 assert.equal(JSON.stringify(rows),before);
 assert.match(mergeDraftData([['1',{kind:'binary',byteLength:2,base64:'QUI='},'ok']],columns,[0],'T'),/TO_BLOB\(HEXTORAW\('4142'\)\)/);
});
