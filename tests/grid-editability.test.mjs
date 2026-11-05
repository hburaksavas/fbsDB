import test from 'node:test';
import assert from 'node:assert/strict';
import {explainEditability} from '../src/gridEditability.js';
import {buildDml,dmlPreviewText} from '../src/dmlPreview.js';
import {editCell,editInserted,emptyDrafts,insertRow,toggleDeleted} from '../src/gridDrafts.js';
const column=(name,type,extra={})=>({name,type,sourceSchema:'APP',sourceTable:'CUSTOMERS',sourceColumn:name,...extra});
const columns=[column('ID','NUMBER'),column('NAME','VARCHAR2'),column('NOTE','CLOB'),{name:'TOTAL',type:'NUMBER'}];
test('a single-table result with its primary key is editable except unsafe columns',()=>{
 const result=explainEditability(columns,{primaryKey:['ID']});
 assert.equal(result.editable,true);assert.deepEqual(result.table,{schema:'APP',name:'CUSTOMERS'});assert.deepEqual(result.identity,[0]);
 assert.deepEqual(result.columns.map(item=>item.editable),[true,true,false,false]);assert.match(result.columns[2].reason,/CLOB/);assert.match(result.columns[3].reason,/expression/);
});
test('missing identity, several tables, computed columns and read-only tabs are explained',()=>{
 assert.match(explainEditability(columns,{primaryKey:null}).reasons[0],/no primary key/);
 assert.match(explainEditability(columns.slice(1),{primaryKey:['ID']}).reasons[0],/ID is not in the result/);
 assert.match(explainEditability([{name:'A',type:'NUMBER'}],{primaryKey:['A']}).reasons[0],/no source table/);
 assert.match(explainEditability([column('ID','NUMBER'),column('X','NUMBER',{sourceTable:'ORDERS'})],{primaryKey:['ID']}).reasons[0],/several tables/);
 assert.equal(explainEditability([column('ID','NUMBER'),column('V','NUMBER',{virtual:true}),column('G','NUMBER',{identityAlways:true})],{primaryKey:['ID']}).columns.filter(item=>!item.editable).length,2);
 assert.equal(explainEditability(columns,{primaryKey:['ID'],readOnly:true}).editable,false);
});
const rows=[['1','Ada',null,'9'],['2','Bob',null,'7']];
const context=drafts=>({table:{schema:'APP',name:'CUSTOMERS'},columns,identity:[0],rowAt:row=>rows[row],drafts});
test('updates use binds, original key values and explicit NULLs',()=>{
 let drafts=editCell(emptyDrafts(),0,1,'Ada',{value:"O'Neil; DROP TABLE x"});drafts=editCell(drafts,0,0,'1',{value:'10'});drafts=editCell(drafts,1,1,'Bob',{isNull:true});
 const {statements,problems}=buildDml(context(drafts));
 assert.deepEqual(problems,[]);assert.equal(statements.length,2);
 assert.equal(statements[0].sql,'UPDATE "APP"."CUSTOMERS" SET "ID" = :c1, "NAME" = :c2 WHERE "ID" = :uk1 AND "ID" = :ok1 AND "NAME" = :ok2');
 assert.deepEqual(statements[0].binds,[{name:'c1',type:'NUMBER',value:'10'},{name:'c2',type:'VARCHAR2',value:"O'Neil; DROP TABLE x"},{name:'uk1',type:'NUMBER',value:'1'},{name:'ok1',type:'NUMBER',value:'1'},{name:'ok2',type:'VARCHAR2',value:'Ada'}]);
 assert.equal(statements[1].binds[0].value,null);assert.equal(statements[1].sql,'UPDATE "APP"."CUSTOMERS" SET "NAME" = :c1 WHERE "ID" = :uk1 AND "NAME" = :ok1');assert.ok(!statements[0].sql.includes('DROP'));assert.equal(statements[0].expectRows,1);
});
test('deletes and inserts are parameterized and omitted columns keep their defaults',()=>{
 let drafts=toggleDeleted(emptyDrafts(),1);drafts=insertRow(drafts,{});drafts=editInserted(drafts,1,1,{value:'Cy'});drafts=editInserted(drafts,1,0,{isNull:true});
 const {statements}=buildDml(context(drafts));
 assert.deepEqual(statements.map(item=>item.kind),['delete','insert']);
 assert.equal(statements[0].sql,'DELETE FROM "APP"."CUSTOMERS" WHERE "ID" = :dk1');assert.equal(statements[0].binds[0].value,'2');
 assert.equal(statements[1].sql,'INSERT INTO "APP"."CUSTOMERS" ("ID", "NAME") VALUES (:i1, :i2)');assert.equal(statements[1].binds[0].value,null);assert.equal(statements[1].binds[1].value,'Cy');
 assert.equal(buildDml(context(insertRow(emptyDrafts(),{}))).problems.length,1);
});
test('a NULL key value cannot identify a row and the preview shows binds explicitly',()=>{
 const nullKey={...context(editCell(emptyDrafts(),0,1,'Ada',{value:'x'})),rowAt:()=>[null,'Ada']};
 const {statements,problems}=buildDml(nullKey);assert.equal(statements.length,0);assert.match(problems[0],/key column ID is NULL/);
 const text=dmlPreviewText(buildDml(context(editCell(emptyDrafts(),0,1,'Ada',{isNull:true}))).statements);
 assert.match(text,/-- :c1 VARCHAR2 = NULL/);assert.match(text,/-- :uk1 NUMBER = "1"/);
});
import {cellEditorKind,fromCalendarValue,toCalendarValue} from '../src/gridEditability.js';
test('editor kinds follow the column type and the value shape',()=>{
 assert.equal(cellEditorKind({type:'DATE'},'2026-11-02 10:30:00'),'datetime');assert.equal(cellEditorKind({type:'TIMESTAMP(6)'},null),'datetime');
 assert.equal(cellEditorKind({type:'TIMESTAMP(6)'},'2026-11-02 10:30:00.123456'),'text','fractional seconds stay typed text');
 assert.equal(cellEditorKind({type:'VARCHAR2'},'x'.repeat(81)),'longtext');assert.equal(cellEditorKind({type:'VARCHAR2'},'a\nb'),'longtext');assert.equal(cellEditorKind({type:'VARCHAR2'},'short'),'text');
});
test('calendar values round-trip to bind text',()=>{
 assert.equal(toCalendarValue('2026-11-02 10:30:00'),'2026-11-02T10:30:00');assert.equal(fromCalendarValue('2026-11-02T10:30'),'2026-11-02 10:30:00');
 assert.equal(fromCalendarValue('2026-11-02'),'2026-11-02 00:00:00');assert.equal(fromCalendarValue(''),'');assert.equal(fromCalendarValue('garbage'),'garbage');
});
import {candidateKeyColumns,validateManualKey} from '../src/gridEditability.js';
test('a missing primary key is flagged so a key can be nominated',()=>{
 assert.equal(explainEditability(columns,{primaryKey:[]}).keyProblem,'absent');assert.equal(explainEditability(columns,{primaryKey:['ID']}).keyProblem,null);
 assert.deepEqual(candidateKeyColumns(columns).map(item=>item.index),[0,1]);
});
test('a nominated key must be non-NULL and unique in the loaded rows and is never called proof',()=>{
 const loaded=[{index:0,row:['1','a']},{index:1,row:['2','a']}];
 assert.equal(validateManualKey(columns,loaded,[0]).ok,true);assert.match(validateManualKey(columns,loaded,[0]).note,/does not prove/);
 assert.match(validateManualKey(columns,loaded,[1]).error,/Rows 1 and 2 have the same values in NAME/);
 assert.match(validateManualKey(columns,[...loaded,{index:2,row:[null,'z']}],[0]).error,/NULL/);assert.match(validateManualKey(columns,loaded,[]).error,/at least one/);
 assert.equal(validateManualKey(columns,loaded,[0,1]).ok,true);
});

test('zoned columns bind with their zone and a session-relative key is refused',()=>{
  const columns=[{name:'ID',type:'NUMBER',sourceColumn:'ID'},{name:'TS',type:'TIMESTAMP WITH TIME ZONE',sourceColumn:'TS'},{name:'L',type:'TIMESTAMP WITH LOCAL TIME ZONE',sourceColumn:'L'}];
  const table={schema:'APP',name:'T'},row=[1,null,'2026-06-01T12:00:00[session:+05:00]'];
  const drafts=editCell(emptyDrafts(),0,1,null,{value:'2026-03-04 05:06:07+03:00'});
  const built=buildDml({table,columns,identity:[0],rowAt:()=>row,drafts});
  assert.deepEqual(built.problems,[]);
  assert.equal(built.statements[0].binds.find(bind=>bind.name==='c1').type,'TIMESTAMPTZ');
  const byLocal=buildDml({table,columns,identity:[2],rowAt:()=>row,drafts});
  assert.equal(byLocal.statements.length,0);
  assert.match(byLocal.problems[0],/cannot be identified exactly/);
});
