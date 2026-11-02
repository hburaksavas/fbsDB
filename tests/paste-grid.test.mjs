import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTsv,planPaste} from '../src/pasteGrid.js';
test('spreadsheet text is split into rows and cells, honouring quotes and Windows line breaks',()=>{
 assert.deepEqual(parseTsv('a\tb\r\nc\t"d\te"\n"x ""q"" y"\t'),[['a','b'],['c','d\te'],['x "q" y','']]);
 assert.deepEqual(parseTsv(''),[]);assert.deepEqual(parseTsv('single'),[['single']]);
});
const items=[{index:0,row:['1','a','x']},{index:1,row:['2','b','y']},{index:2,row:['3','c','z']}];
const targets=[{col:1,name:'CODE',editable:true,text:item=>item.row[1]},{col:2,name:'NOTE',editable:true,text:item=>item.row[2]}];
const base={startRow:0,targets,rowAt:position=>items[position],keyCol:0,findByKey:key=>items.find(item=>item.row[0]===key)};
test('positional paste fills cell by cell, turns empty cells into NULL and reports overflow',()=>{
 const plan=planPaste({...base,pasted:[['A','x'],['','Y'],['C','Z'],['D','W']]});
 assert.deepEqual(plan.changes.map(item=>[item.rowIndex,item.name,item.to]),[[0,'CODE','A'],[1,'CODE',null],[1,'NOTE','Y'],[2,'CODE','C'],[2,'NOTE','Z']]);
 assert.equal(plan.changes[1].isNull,true);assert.match(plan.skipped[0].name,/pasted row 4/);
 assert.match(planPaste({...base,pasted:[['1','2','3']]}).skipped[0].reason,/1 pasted column falls outside/);
});
test('a header row can be skipped and locked columns are reported, not written',()=>{
 const locked=[{...targets[0],editable:false,reason:'Virtual.'},targets[1]];
 const plan=planPaste({...base,targets:locked,header:true,pasted:[['CODE','NOTE'],['Q','R']]});
 assert.deepEqual(plan.changes.map(item=>item.name),['NOTE']);assert.equal(plan.skipped[0].reason,'Virtual.');
 assert.equal(planPaste({...base,pasted:[['only header']],header:true}).error,'The clipboard has no data rows.');
});
test('key-matched paste finds rows by key whatever their position and reports unknown keys',()=>{
 const plan=planPaste({...base,mode:'key',pasted:[['3','C3','Z3'],['9','no','no'],['1','a','X1']]});
 assert.deepEqual(plan.changes.map(item=>[item.rowIndex,item.name,item.to]),[[2,'CODE','C3'],[2,'NOTE','Z3'],[0,'NOTE','X1']]);
 assert.equal(plan.skipped[0].reason,'No loaded row has this key.');assert.match(planPaste({...base,mode:'key',keyCol:null,pasted:[['1']]}).error,/single key column/);
});
