import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluationParameters,prepareEvaluation} from '../src/quickEval.js';
test('a pure expression becomes a one-row query without confirmation',()=>{
 const result=prepareEvaluation("TO_CHAR(SYSDATE, 'YYYY') || :suffix;");
 assert.equal(result.sql,`SELECT (TO_CHAR(SYSDATE, 'YYYY') || :suffix) AS "RESULT" FROM dual`);assert.deepEqual(result.binds,['SUFFIX']);assert.deepEqual(result.calls,[]);
});
test('user-defined, package and quoted calls require confirmation and are listed once',()=>{
 assert.deepEqual(prepareEvaluation('my_func(1) + my_func(2)').calls,['my_func']);
 assert.deepEqual(prepareEvaluation('pkg.calc(:x) + UPPER(:y)').calls,['pkg.calc']);
 assert.deepEqual(prepareEvaluation('"Weird"(1)').calls,['"Weird"']);
});
test('statements, DML and malformed input are refused with an explanation',()=>{
 for(const text of ['','  ','SELECT 1 FROM dual','DELETE FROM t','1 + 1; DROP TABLE t','BEGIN NULL; END','(1 + 2','1 + 2)','1 /* open'])assert.ok(prepareEvaluation(text).error,text);
 assert.equal(prepareEvaluation('1 + 1').error,undefined);
});
test('parameters carry typed values and default to empty text',()=>{
 assert.deepEqual(evaluationParameters(['a','b'],{a:{type:'NUMBER',value:'5'}}),[{name:'a',type:'NUMBER',value:'5',direction:'IN'},{name:'b',type:'VARCHAR2',value:'',direction:'IN'}]);
});
