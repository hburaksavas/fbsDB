import test from 'node:test';
import assert from 'node:assert/strict';
import {minimapSectionLimit,minimapSections} from '../src/minimapSections.js';
const positionAt=offset=>({lineNumber:Math.floor(offset/10)+1});
test('routines and packages are labeled by start line in source order',()=>{
 const outline=[{kind:'FUNCTION',name:'FUNCTION total RETURN NUMBER IS',start:35,depth:1},{kind:'PACKAGE',name:'CREATE OR REPLACE PACKAGE BODY billing AS',start:0,depth:0},{kind:'PROCEDURE',name:'PROCEDURE "reset it" IS',start:62,depth:1},{kind:'CURSOR',name:'c',start:20,depth:1}];
 assert.deepEqual(minimapSections(outline,positionAt),[{line:1,text:'PKG billing body'},{line:4,text:'FUNC total'},{line:7,text:'PROC reset it'}]);
});
test('deeply nested items, unnamed items and duplicate lines are skipped; labels and count are bounded',()=>{
 const outline=[{kind:'PROCEDURE',name:'deep',start:5,depth:3},{kind:'PROCEDURE',start:15,depth:1},{kind:'FUNCTION',name:'a',start:25,depth:1},{kind:'PROCEDURE',name:'b',start:27,depth:1},{kind:'TYPE',name:'x'.repeat(80),start:50,depth:0}];
 const sections=minimapSections(outline,positionAt);
 assert.deepEqual(sections.map(item=>item.line),[3,6]);assert.equal(sections[0].text,'FUNC a');assert.equal(sections[1].text.length,'TYPE '.length+40);
 const many=Array.from({length:500},(_,i)=>({kind:'PROCEDURE',name:`p${i}`,start:i*10,depth:1}));
 assert.equal(minimapSections(many,positionAt).length,minimapSectionLimit);assert.deepEqual(minimapSections(null,positionAt),[]);
});
