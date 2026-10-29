import test from 'node:test';
import assert from 'node:assert/strict';
import { selectResultRange as select, isResultCellSelected as has, resultSelectionTsv as tsv } from '../src/resultSelection.js';
test('Control toggles separate rows while preserving other selections', () => {
 const opts = {mode:'row', rowCount:5, columnCount:3};
 let s=select(null,0,0,opts); s=select(s,3,0,{...opts,additive:true});
 assert.equal(has(s,0,2),true); assert.equal(has(s,3,2),true); assert.equal(has(s,1,0),false);
 s=select(s,0,0,{...opts,additive:true}); assert.equal(has(s,0,0),false); assert.equal(has(s,3,2),true);
});
test('Control cell selection, Shift extension, and plain click replacement', () => {
 let s=select(null,0,0);s=select(s,2,1,{additive:true});s=select(s,3,1,{extend:true});
 assert.equal(has(s,0,0),true);assert.equal(has(s,2,1),true);assert.equal(has(s,3,1),true);assert.equal(has(s,1,1),false);
 s=select(s,4,0);assert.equal(has(s,0,0),false);assert.equal(has(s,4,0),true);
});
test('copy keeps sparse selections in display order with blank gaps and escaped text', () => {
 let s=select(null,0,0);s=select(s,1,1,{additive:true});
 assert.equal(tsv(s,[{row:['a',1]},{row:[2,'b\tc']}],[0,1]),'a\t\r\n\t"b\tc"');
});

test('dragging row numbers selects every column in a forward or reverse row range', () => {
 let s=select(null,1,0,{mode:'row'});
 s=select(s,4,0,{mode:'row',extend:true});
 for(let r=0;r<6;r++) for(let c=0;c<4;c++) assert.equal(has(s,r,c),r>=1 && r<=4);
 s=select(s,0,0,{mode:'row',extend:true});
 for(let r=0;r<6;r++) for(let c=0;c<4;c++) assert.equal(has(s,r,c),r<=1);
});
