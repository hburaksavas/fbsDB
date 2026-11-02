import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeStackProblems} from '../src/runtimeStack.js';

test('runtime frames retain exact object identity and explicitly unknown compiled versions',()=>{
 const items=runtimeStackProblems('ORA-01476: divisor is equal to zero\nORA-06512: at "App.Billing", line 7\nORA-06512: konum "APP.PROC", satır 3\nORA-06512: at line 2',{},'q');
 assert.equal(items.length,3);
 assert.deepEqual(items[0].definition,{owner:'App',name:'Billing',type:'PLSQL FRAME',originTabId:'q'});
 assert.equal(items[0].versionStatus,'Execution source version unknown');
 assert.equal(items[0].offset,null);
 assert.equal(items[1].oracleLine,3);
 assert.equal(items[2].definition,null);
});
test('anonymous frame offsets only map to the exact captured submitted block',()=>{
 const sql='BEGIN\n  fail;\nEND;',editor='SELECT 1;\n'+sql;
 const context={executedSql:sql,statementOffset:10,editorSnapshot:editor};
 const item=runtimeStackProblems('ORA-06512: at line 2',context,'q')[0];
 assert.equal(item.offset,16);assert.equal(item.line,3);
 assert.match(item.versionStatus,/Exact submitted/);
 assert.equal(runtimeStackProblems('ORA-06512: at line 2',{...context,statementOffset:0},'q')[0].offset,null);
 assert.equal(runtimeStackProblems('ORA-06512: at line 2',{...context,executedSql:'SELECT 1'},'q')[0].offset,null);
});
test('ambiguous identities, malformed lines and unbounded frames never create guessed navigation targets',()=>{
 assert.equal(runtimeStackProblems('ORA-06512: at "A.B.C", line 2\nORA-06512: at "A.B", line 0\nORA-06512: at line 9999999999999',{},'q').length,0);
 assert.equal(runtimeStackProblems(Array(200).fill('ORA-06512: at "A.B", line 1').join('\n'),{},'q').length,128);
});
