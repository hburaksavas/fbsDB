import test from 'node:test';
import assert from 'node:assert/strict';
import {foreignKeyTargets,pickedCells,pickerCellText,pickerQuery} from '../src/relatedPicker.js';
import {normalizeRelations} from '../src/relatedChecks.js';

const column=name=>({name,type:'NUMBER',sourceColumn:name,sourceTable:'ORDERS'});
const columns=[column('ID'),column('CUST_ID'),column('REGION'),column('SHOP')];
const editable=columns.map(()=>({editable:true}));
const parents=[{owner:'APP',table:'CUSTOMERS',constraint:'FK_C',pairs:[{child:'CUST_ID',parent:'ID'}]},{owner:'APP',table:'SHOPS',constraint:'FK_S',pairs:[{child:'REGION',parent:'R'},{child:'SHOP',parent:'S'}]}];

test('a key is offered only when all of it is in the result and editable',()=>{
  const targets=foreignKeyTargets(columns,parents,editable);
  assert.equal(targets.get(1).table,'CUSTOMERS');
  assert.equal(targets.get(2).table,'SHOPS');assert.equal(targets.get(3),targets.get(2),'Either column of a composite key opens the same key');
  assert.equal(targets.has(0),false);
  assert.equal(foreignKeyTargets(columns.slice(0,3),parents,editable).has(2),false,'A missing key column');
  assert.equal(foreignKeyTargets(columns,parents,editable.map((item,at)=>at===3?{editable:false}:item)).has(2),false,'A locked key column');
});
test('the search is a bind, escapes wildcards and covers keys and known text columns',()=>{
  const target=foreignKeyTargets(columns,parents,editable).get(1);
  const all=pickerQuery(target);
  assert.equal(all.sql,'SELECT * FROM "APP"."CUSTOMERS" ORDER BY "ID"');assert.deepEqual(all.parameters,[]);
  const found=pickerQuery(target,"O'Neil 10%_",[{name:'ID',type:'NUMBER'},{name:'NAME',type:'VARCHAR2'},{name:'BORN',type:'DATE'}]);
  assert.equal(found.sql,`SELECT * FROM "APP"."CUSTOMERS" WHERE TO_CHAR("ID") LIKE :search ESCAPE '\\' OR UPPER("NAME") LIKE UPPER(:search) ESCAPE '\\' ORDER BY "ID"`);
  assert.equal(found.parameters[0].value,"%O'Neil 10\\%\\_%");assert.doesNotMatch(found.sql,/Neil/,'The text is never part of the SQL');
  assert.deepEqual(pickerQuery(target,'   ').parameters,[],'Blank means all rows');
});
test('choosing a row gives the value of each key column',()=>{
  const targets=foreignKeyTargets(columns,parents,editable);
  assert.deepEqual(pickedCells(targets.get(1),[{name:'ID'},{name:'NAME'}],[42,'Ada']),{cells:[{col:1,value:'42'}]});
  assert.deepEqual(pickedCells(targets.get(2),[{name:'S'},{name:'R'}],['s1',null]).cells,[{col:2,value:null},{col:3,value:'s1'}],'By name, not position, and a NULL stays NULL');
  assert.match(pickedCells(targets.get(1),[{name:'NAME'}],['x']).error,/ID is not in the answer/);
  assert.match(pickedCells(targets.get(1),[{name:'ID'}],[{kind:'binary'}]).error,/cannot be used as text/);
  assert.equal(pickedCells(targets.get(1),[{name:'ID'}],[{kind:'temporal',value:'2026-01-02T03:04:05'}]).cells[0].value,'2026-01-02T03:04:05');
});
test('values are shown as text',()=>{
  assert.equal(pickerCellText(null),'NULL');assert.equal(pickerCellText(7),'7');assert.equal(pickerCellText({kind:'binary'}),'(not shown)');
  assert.equal(pickerCellText({kind:'temporal',value:'2026-01-02T03:04:05',offset:'+03:00'}),'2026-01-02T03:04:05+03:00');
});
test('relations from the host name the parent table',()=>{
  const {parents:read}=normalizeRelations({children:[],parents:[{Owner:'APP',Table:'CUSTOMERS',Constraint:'FK',Pairs:[{Child:'CUST_ID',Parent:'ID'}]}]});
  assert.deepEqual(read[0].pairs,[{child:'CUST_ID',parent:'ID'}]);assert.equal(read[0].table,'CUSTOMERS');
});
