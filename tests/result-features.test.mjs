import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResultFeatures, matchesCondition, uniqueResultValues, formatResultValue, selectionStatistics, copyResultData } from '../src/resultFeatures.js';
const columns=[{name:'ID',type:'NUMBER'},{name:'NAME',type:'VARCHAR2'},{name:'DATE',type:'DATE'}];
const rows=[[2,'B','2026-02-01'],[1,'B','2026-01-01'],[3,'A','2025-01-01'],[null,null,null]].map((row,index)=>({row,index}));
test('typed filters combine null, range, date and text rules',()=>{
 assert.equal(matchesCondition(4,{kind:'number',op:'between',value:'2',to:'5'}),true);
 assert.equal(matchesCondition('2026-01-02',{kind:'date',op:'gt',value:'2026-01-01'}),true);
 assert.deepEqual(applyResultFeatures(rows,columns,{filters:[{column:1,op:'equals',value:'B'},{column:0,kind:'number',op:'gt',value:'1'}]}).map(x=>x.index),[0]);
 assert.deepEqual(applyResultFeatures(rows,columns,{filters:[{column:0,op:'null'}]}).map(x=>x.index),[3]);
});
test('multi sort has priority, stable ties and nulls last',()=>{
 assert.deepEqual(applyResultFeatures(rows,columns,{sorts:[{column:1,direction:'asc'},{column:0,direction:'asc'}]}).map(x=>x.index),[2,1,0,3]);
});
test('duplicate keys preserve type and marks filter source identity',()=>{
 assert.deepEqual(applyResultFeatures(rows,columns,{duplicateColumns:[1],duplicatesOnly:true}).map(x=>x.index),[0,1]);
 assert.deepEqual(applyResultFeatures(rows,columns,{marks:[2],markedOnly:true}).map(x=>x.index),[2]);
 assert.deepEqual(uniqueResultValues(rows,1)[0],{value:'B',count:2});
});
test('display formatting leaves raw values intact',()=>{
 assert.equal(formatResultValue(1234.5,'NUMBER',{locale:'en-US',grouping:true,decimals:2}),'1,234.50');
 assert.equal(formatResultValue('2026-01-01T00:00:00Z','DATE',{dateFormat:'iso'}),'2026-01-01T00:00:00');
 assert.equal(formatResultValue(null,'NUMBER'),'NULL');
 assert.deepEqual(selectionStatistics([1,2,null,'x']),{count:4,numericCount:2,sum:3,average:1.5,min:1,max:2});
});
test('copy formats escape delimiters, duplicate headers and SQL strings',()=>{
 assert.equal(copyResultData([["O'Brien"],[null]],[columns[1]],'in'),"IN ('O''Brien')");
 assert.equal(copyResultData([['a,b']],[columns[1]],'csv',true),'NAME\r\n"a,b"');
 assert.deepEqual(JSON.parse(copyResultData([[1,2]],[{name:'X'},{name:'X'}],'json')),[{X:1,X_2:2}]);
 assert.equal(copyResultData([[1,'A']],columns.slice(0,2),'vertical'),'ID = 1\r\nNAME = A');
});
