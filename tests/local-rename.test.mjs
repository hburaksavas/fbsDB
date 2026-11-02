import test from 'node:test';
import assert from 'node:assert/strict';
import {planLocalRename} from '../src/localRename.js';

const source=`DECLARE
  v_total NUMBER;
BEGIN
  v_total := 1;
  DBMS_OUTPUT.PUT_LINE(v_total);
END;`;
const apply=(text,plan)=>[...plan.edits].reverse().reduce((value,edit)=>value.slice(0,edit.start)+edit.after+value.slice(edit.end),text);

test('local rename previews declaration and resolved uses only',()=>{
  const plan=planLocalRename(source,source.indexOf('v_total')+2,'v_amount');
  assert.equal(plan.error,undefined);
  assert.equal(plan.edits.length,3);
  assert.equal(apply(source,plan).match(/v_amount/g).length,3);
});

test('rename rejects nonlocal symbols, keywords and existing local names',()=>{
  assert.match(planLocalRename('SELECT id FROM t',7,'new_id').error,/local variable/);
  assert.match(planLocalRename(source,source.indexOf('v_total')+2,'SELECT').error,/non-keyword/);
  const collision=source.replace('  v_total NUMBER;','  v_total NUMBER;\n  v_other NUMBER;');
  assert.match(planLocalRename(collision,collision.indexOf('v_total')+2,'v_other').error,/already uses/);
});

test('parameter rename follows only resolved parameter references',()=>{
  const text='CREATE OR REPLACE PROCEDURE p_run(p_id IN NUMBER) IS\nBEGIN\n  DBMS_OUTPUT.PUT_LINE(p_id);\nEND;';
  const plan=planLocalRename(text,text.indexOf('p_id')+2,'p_key');
  assert.equal(plan.error,undefined);
  assert.equal(plan.edits.length,2);
  assert.equal(apply(text,plan).match(/p_key/g).length,2);
});
