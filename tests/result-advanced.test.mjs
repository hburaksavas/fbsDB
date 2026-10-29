import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTreeMatches,groupedResultSummary,buildServerFilter,visibleWhitespace,textLengths,bytesToHex,binaryMime} from '../src/resultAdvanced.js';
import {matchesCondition,applyResultFeatures} from '../src/resultFeatures.js';
import {getVisibleResultRows} from '../src/resultRows.js';
const columns=[{name:'ID',type:'NUMBER'},{name:'NAME',type:'VARCHAR2'}];
test('case sensitivity, regex and NULL positioning apply consistently',()=>{
 assert.equal(matchesCondition('Abc',{op:'contains',value:'a',caseSensitive:true}),false);
 assert.equal(matchesCondition('Abc',{op:'regex',value:'^a',caseSensitive:false}),true);
 assert.equal(matchesCondition('a',{op:'regex',value:'['}),false);
 const rows=[[2,'B'],[null,'A'],[1,'a']];
 assert.deepEqual(getVisibleResultRows(rows,columns,'',0,'desc',[],{nulls:'first'}).map(x=>x.index),[1,0,2]);
 assert.deepEqual(applyResultFeatures(rows.map((row,index)=>({row,index})),columns,{sorts:[{column:0,direction:'asc'}],nulls:'first'}).map(x=>x.index),[1,2,0]);
});
test('nested AND/OR groups ignore empty branches',()=>{
 const options={filterLogic:'and',filterGroups:[{id:'either',parent:'root',logic:'or'},{id:'empty',parent:'either',logic:'and'}],filters:[{column:0,op:'gt',kind:'number',value:'1'},{column:1,op:'equals',value:'A',group:'either'},{column:1,op:'equals',value:'B',group:'either'}]};
 assert.equal(filterTreeMatches([2,'A'],options),true);assert.equal(filterTreeMatches([2,'C'],options),false);assert.equal(filterTreeMatches([1,'A'],options),false);
});
test('server filters bind values and retain existing parameters',()=>{
 const filter=buildServerFilter('SELECT ID, NAME FROM T WHERE ID > :n;',columns,{filters:[{column:1,op:'contains',value:"a%' OR 1=1 --"}]},[{name:'n',type:'NUMBER',value:'0'}]);
 assert.equal(filter.sql.includes("OR 1=1 --"),false);assert.equal(filter.parameters.length,2);assert.ok(filter.parameters[1].value.includes('\\%'));
 assert.throws(()=>buildServerFilter('DELETE FROM T',columns,{}));assert.throws(()=>buildServerFilter('SELECT 1 FROM DUAL',[columns[0],columns[0]],{}));
});
test('grouped summaries skip NULLs in numeric calculations',()=>{
 const summary=groupedResultSummary([{row:[1,'A']},{row:[3,'A']},{row:[null,'A']},{row:[5,'B']}],columns,[1],0);
 assert.deepEqual(summary.rows.map(x=>x.row),[['A',3,4,2,1,3],['B',1,5,5,5,5]]);
});
test('whitespace, text lengths and binary inspection preserve content',()=>{
 assert.equal(visibleWhitespace('a b\t\n'),'a·b→\t↵\n');assert.deepEqual(textLengths('A😀'),{characters:2,utf16:3,utf8:5});assert.ok(bytesToHex(new Uint8Array([65,0,255])).includes('41 00 ff'));assert.equal(binaryMime(new Uint8Array([137,80])),'image/png');
});
