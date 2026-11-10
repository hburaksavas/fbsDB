import test from 'node:test';
import assert from 'node:assert/strict';
import {matchRowIds,rowIdColumn,rowIdRefusal} from '../src/gridRowIds.js';
import {buildDml} from '../src/dmlPreview.js';
import {editCell,emptyDrafts,toggleDeleted} from '../src/gridDrafts.js';
const columns=[{name:'ID',type:'NUMBER',sourceColumn:'ID',sourceTable:'T'},{name:'NAME',type:'VARCHAR2',sourceColumn:'NAME',sourceTable:'T'},{name:'DOC',type:'CLOB',sourceColumn:'DOC',sourceTable:'T'}];
const read=[{name:rowIdColumn},...columns];
test('ROWIDs are paired with the loaded rows by value, in any order, and identical rows each get their own',()=>{
 const rows=[{index:0,row:['1','a',{lob:1}]},{index:1,row:['2','same',null]},{index:2,row:['2','same',null]},{index:5,row:['9',null,null]}];
 const reply={columns:read,rows:[['R9','9',null,'x'],['R2','2','same','x'],['R3','2','same','x'],['R1','1','a','other handle']]};
 const {ids,missing}=matchRowIds({columns,rows,reply});
 assert.equal(missing,0);assert.equal(ids.get(0),'R1');assert.deepEqual([ids.get(1),ids.get(2)].sort(),['R2','R3']);assert.equal(ids.get(5),'R9');
});
test('a row that changed since it was read gets no ROWID, and other columns are refused',()=>{
 const result=matchRowIds({columns,rows:[{index:0,row:['1','old',null]},{index:1,row:['2','b',null]}],reply:{columns:read,rows:[['R1','1','new',null],['R2','2','b',null]]}});
 assert.equal(result.missing,1);assert.equal(result.ids.has(0),false);assert.equal(result.ids.get(1),'R2');
 assert.match(matchRowIds({columns,rows:[],reply:{columns:[{name:rowIdColumn},{name:'OTHER'}],rows:[]}}).error,/different columns/);
 assert.match(matchRowIds({columns,rows:[],reply:{columns:columns,rows:[]}}).error,/different columns/);
});
test('temporal values are compared by value and zone',()=>{
 const cols=[{name:'D',type:'DATE'}],d=v=>({kind:'temporal',value:v,oracleType:'DATE'});
 const {ids}=matchRowIds({columns:cols,rows:[{index:0,row:[d('2026-01-31 00:00:00')]}],reply:{columns:[{name:rowIdColumn},...cols],rows:[['RA',d('2026-02-01 00:00:00')],['RB',d('2026-01-31 00:00:00')]]}});
 assert.equal(ids.get(0),'RB');
});
test('Oracle refusals are explained',()=>{
 assert.match(rowIdRefusal('ORA-01446: cannot select ROWID from, or sample, a view with DISTINCT, GROUP BY, etc.'),/FETCH FIRST/);
 assert.match(rowIdRefusal('x\nORA-00918: column ambiguously defined\nmore'),/could not be identified: ORA-00918: column ambiguously defined$/);
});
test('statements find their row by ROWID and refuse a row without one',()=>{
 let drafts=editCell(emptyDrafts(),0,1,'a',{value:'b'});drafts=toggleDeleted(drafts,1);drafts=editCell(drafts,2,1,'c',{value:'d'});
 const built=buildDml({table:{schema:'APP',name:'T'},columns,identity:[],rowAt:index=>[String(index),'x',null],drafts,rowIds:new Map([[0,'AAA'],[1,'BBB']])});
 assert.deepEqual(built.statements.map(item=>item.sql),['DELETE FROM "APP"."T" WHERE ROWID = :dk1','UPDATE "APP"."T" SET "NAME" = :c1 WHERE ROWID = :uk1 AND "NAME" = :ok1']);
 assert.deepEqual(built.statements[1].binds.map(bind=>[bind.name,bind.type,bind.value]),[['c1','VARCHAR2','b'],['uk1','VARCHAR2','AAA'],['ok1','VARCHAR2','a']]);
 assert.equal(built.problems.length,1);assert.match(built.problems[0],/^Row 3: it changed in the database/);
});
