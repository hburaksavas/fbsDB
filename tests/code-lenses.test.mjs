import test from 'node:test';
import assert from 'node:assert/strict';
import {codeLensItems,referenceCount} from '../src/codeLenses.js';
const text='CREATE OR REPLACE PACKAGE BODY billing AS\n  FUNCTION total RETURN NUMBER IS BEGIN RETURN 1; END;\n  PROCEDURE reset IS x NUMBER; BEGIN x := total; x := total + total; END;\nEND;';
const positionAt=offset=>({lineNumber:text.slice(0,offset).split('\n').length});
const outline=[{kind:'PACKAGE',name:'CREATE OR REPLACE PACKAGE BODY billing AS',start:0,end:text.length,depth:0},{kind:'FUNCTION',name:'FUNCTION total RETURN NUMBER IS',start:text.indexOf('  FUNCTION')+2,end:text.indexOf('  PROCEDURE'),depth:1},{kind:'PROCEDURE',name:'PROCEDURE reset IS',start:text.indexOf('PROCEDURE'),end:text.indexOf('\nEND;'),depth:1},{kind:'CURSOR',name:'c',start:5,end:6,depth:1}];
test('references exclude the declaration, quoted and cased names are matched',()=>{
 assert.equal(referenceCount(text,'total'),3);assert.equal(referenceCount('PROCEDURE "Odd" IS BEGIN NULL; END; "Odd"','"Odd"'),0);assert.equal(referenceCount('','x'),0);
});
test('packages and routines get a reference count and only the actions that apply',()=>{
 const lenses=codeLensItems(outline,text,positionAt);
 assert.deepEqual(lenses.map(item=>[item.line,item.name]),[[1,'billing'],[2,'total'],[3,'reset']]);
 assert.deepEqual(lenses[0].actions.map(action=>action.id),['references','switch','compile','run']);
 assert.equal(lenses[0].actions[1].title,'Go to specification');
 assert.deepEqual(lenses[1].actions.map(action=>action.id),['references','run']);
 assert.deepEqual(lenses.map(item=>item.actions[0].title),['0 references in this file','3 references in this file','0 references in this file']);
});
test('triggers have no call action, unrecognized items and duplicate lines are skipped and the count is bounded',()=>{
 const trigger=codeLensItems([{kind:'TRIGGER',name:'CREATE TRIGGER trg BEFORE INSERT ON t',start:0,end:10,depth:0}],'CREATE TRIGGER trg',()=>({lineNumber:1}));
 assert.deepEqual(trigger[0].actions.map(action=>action.id),['references','compile']);
 assert.deepEqual(codeLensItems([{kind:'FUNCTION',name:'???',start:0,end:1,depth:0},{kind:'FUNCTION',name:'FUNCTION a IS',start:0,end:1,depth:0},{kind:'FUNCTION',name:'FUNCTION b IS',start:0,end:1,depth:0}],'a b',()=>({lineNumber:1})).length,1);
 const many=Array.from({length:300},(_,i)=>({kind:'PROCEDURE',name:`PROCEDURE p${i} IS`,start:i,end:i+1,depth:1}));
 assert.equal(codeLensItems(many,'',offset=>({lineNumber:offset+1})).length,100);
});
