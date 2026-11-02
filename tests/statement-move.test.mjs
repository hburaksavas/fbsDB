import test from 'node:test';
import assert from 'node:assert/strict';
import {planStatementMove} from '../src/statementMove.js';
const apply=(source,plan)=>source.slice(0,plan.edit.start)+plan.edit.after+source.slice(plan.edit.end);

test('moves adjacent PL/SQL statements with their original indentation',()=>{
  const source='BEGIN\n  a := 1;\n  b := 2;\nEND;';
  const plan=planStatementMove(source,source.indexOf('b :='),-1);
  assert.equal(plan.error,undefined);
  assert.equal(apply(source,plan),'BEGIN\n  b := 2;\n  a := 1;\nEND;');
});

test('moves SELECT expressions while preserving comma layout',()=>{
  const source='SELECT a,\n  b,\n  c FROM dual;';
  const plan=planStatementMove(source,source.indexOf('b,'),-1);
  assert.equal(plan.error,undefined);
  assert.equal(apply(source,plan),'SELECT b,\n  a,\n  c FROM dual;');
});

test('moves simple AND conditions and refuses OR',()=>{
  const source='SELECT * FROM t WHERE a = 1 AND b = 2;';
  const plan=planStatementMove(source,source.indexOf('b ='),-1);
  assert.equal(plan.error,undefined);
  assert.equal(apply(source,plan),'SELECT * FROM t WHERE b = 2 AND a = 1;');
  assert.match(planStatementMove(source.replace(' AND ',' OR '),source.indexOf('b ='),-1).error,/OR/);
});

test('refuses comments and SELECT modifiers that could change meaning',()=>{
  assert.match(planStatementMove('SELECT DISTINCT a, b FROM t',18,1).error,/modifiers/);
  assert.match(planStatementMove('SELECT a, /* note */ b FROM t',25,-1).error,/Comments/);
});
