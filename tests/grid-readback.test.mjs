import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDml} from '../src/dmlPreview.js';
import {editCell,editInserted,emptyDrafts,insertRow} from '../src/gridDrafts.js';
import {appliedReadbackCells,readbackDetails} from '../src/gridReadback.js';

const source=(name,type='VARCHAR2')=>({name,type,sourceTable:'T',sourceColumn:name});
const columns=[source('ID','NUMBER'),source('NAME'),source('NOTES','CLOB'),{name:'EXPR',type:'NUMBER'},source('CREATED','DATE')];
const build=drafts=>buildDml({table:{schema:'APP',name:'T'},columns,identity:[0],rowAt:()=>[1,'old','text',5,null],drafts}).statements;
const insert=()=>{const started=insertRow(emptyDrafts());return build(editInserted(started,started.inserted.at(-1).id,1,{value:'typed'}))[0]};
const update=()=>build(editCell(emptyDrafts(),0,1,'old',{value:'typed'}))[0];

test('statements ask only for readable source columns',()=>{
  const statement=update();
  assert.deepEqual(statement.readColumns,['"ID"','"NAME"','"CREATED"'],'No LOB and no expression');
  assert.deepEqual(statement.readIndexes,[0,1,4]);
  assert.equal(build({...emptyDrafts(),deleted:[0]})[0].readColumns,undefined,'A deleted row has nothing to read');
});
test('a new row names what the database filled in',()=>{
  const {note,cells}=readbackDetails(insert(),{status:'applied',readback:[42,'typed',{kind:'temporal',oracleType:'DATE',value:'2026-03-04T05:06:07'}]});
  assert.equal(note,'Oracle set ID = 42, CREATED = 2026-03-04T05:06:07.');
  assert.equal(cells[0],42);
  assert.equal(readbackDetails(insert(),{readback:[null,'typed',null]}).note,'','Nothing filled in, nothing to say');
});
test('an update names only what differs from what was sent or read',()=>{
  assert.equal(readbackDetails(update(),{readback:[1,'typed',null]}).note,'','It stored what was sent');
  const changed=readbackDetails(update(),{readback:[1,'TYPED',{kind:'temporal',oracleType:'DATE',value:'2026-03-04T05:06:07'}]});
  assert.equal(changed.note,'Oracle set NAME = TYPED (sent typed), CREATED = 2026-03-04T05:06:07.','A trigger changed the sent value and another column');
  assert.equal(changed.cells[1],'TYPED');
  assert.equal(changed.cells[0],undefined,'An unchanged column is left alone');
});
test('a failed read is reported apart and never hides that the change applied',()=>{
  const {note,cells}=readbackDetails(update(),{status:'applied',readbackError:'ORA-00942: table or view does not exist'});
  assert.match(note,/^The change applied, but its stored values could not be read back: ORA-00942/);
  assert.deepEqual(cells,{});
  assert.deepEqual(readbackDetails(update(),{status:'applied'}),{cells:{},note:''},'A statement without a read says nothing');
});
test('the grid shows stored values of applied updates only',()=>{
  const statements=[update(),update(),insert()];
  const outcomes=[{index:0,status:'applied',readback:[1,'TYPED',null]},{index:1,status:'failed',readback:[1,'x',null]},{index:2,status:'applied',readback:[9,'typed',null]}];
  assert.deepEqual(appliedReadbackCells(statements,outcomes),{'0:1':'TYPED'});
});
