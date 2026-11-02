import test from 'node:test';
import assert from 'node:assert/strict';
import {planExtractProcedure} from '../src/extractProcedure.js';

const source=`DECLARE
  v_a NUMBER;
  v_b NUMBER;
  v_total NUMBER;
BEGIN
  v_total := v_a + v_b;
  v_total := v_total + 1;
END;`;
const start=source.indexOf('v_total :=');
const end=source.indexOf(';\nEND')+1;
const apply=(text,plan)=>[...plan.edits].reverse().reduce((value,edit)=>value.slice(0,edit.start)+edit.after+value.slice(edit.end),text);

test('extracts complete assignments with inferred IN and OUT parameters',()=>{
  const plan=planExtractProcedure(source,start,end,'compute_total');
  assert.equal(plan.error,undefined);
  assert.deepEqual(plan.parameters.map(item=>[item.name,item.mode]),[['v_a','IN'],['v_b','IN'],['v_total','OUT']]);
  const result=apply(source,plan);
  assert.match(result,/PROCEDURE compute_total\(v_a IN NUMBER, v_b IN NUMBER, v_total OUT NUMBER\)/);
  assert.match(result,/compute_total\(v_a, v_b, v_total\);/);
});

test('reads before writes infer IN OUT',()=>{
  const text=source.replace('v_total := v_a + v_b;', 'v_total := v_total + v_a;');
  const plan=planExtractProcedure(text,text.indexOf('v_total :='),text.indexOf(';\nEND')+1,'advance_total');
  assert.equal(plan.error,undefined);
  assert.deepEqual(plan.parameters.map(item=>[item.name,item.mode]),[['v_total','IN OUT'],['v_a','IN']]);
});

test('rejects partial statements and unresolved identifiers',()=>{
  assert.match(planExtractProcedure(source,start+3,end,'compute_total').error,/complete/);
  const unknown=source.replace('v_a + v_b','unknown + v_b');
  assert.match(planExtractProcedure(unknown,unknown.indexOf('v_total :='),unknown.indexOf(';\nEND')+1,'compute_total').error,/unresolved/);
});
