import test from 'node:test';
import assert from 'node:assert/strict';
import {planChangeSignature} from '../src/changeSignature.js';

const source=`DECLARE
  PROCEDURE p_run(p_id IN NUMBER, p_label IN VARCHAR2) IS
  BEGIN
    DBMS_OUTPUT.PUT_LINE(p_label);
  END;
BEGIN
  p_run(1, 'one');
  p_run(p_label => 'two', p_id => 2);
END;`;
const cursor=source.indexOf('p_run')+2;
const apply=(text,plan)=>[...plan.edits].reverse().reduce((value,edit)=>value.slice(0,edit.start)+edit.after+value.slice(edit.end),text);

test('rename previews parameter declaration, body and named caller',()=>{
  const plan=planChangeSignature(source,cursor,{operation:'rename',index:1,name:'p_text'});
  assert.equal(plan.error,undefined);
  assert.equal(plan.callCount,2);
  const result=apply(source,plan);
  assert.match(result,/p_text IN VARCHAR2/);
  assert.match(result,/PUT_LINE\(p_text\)/);
  assert.match(result,/p_text => 'two'/);
});

test('reorder changes positional caller but preserves named caller',()=>{
  const plan=planChangeSignature(source,cursor,{operation:'reorder',order:[1,0]});
  assert.equal(plan.error,undefined);
  const result=apply(source,plan);
  assert.match(result,/p_run\('one', 1\)/);
  assert.match(result,/p_run\(p_label => 'two', p_id => 2\)/);
});

test('add creates optional parameter and retains existing calls',()=>{
  const plan=planChangeSignature(source,cursor,{operation:'add',name:'p_extra',type:'NUMBER'});
  assert.equal(plan.error,undefined);
  const result=apply(source,plan);
  assert.match(result,/p_extra IN NUMBER DEFAULT NULL/);
  assert.match(result,/p_run\(1, 'one'\)/);
});

test('ambiguous and unsupported calls are rejected',()=>{
  assert.match(planChangeSignature(source.replace('  p_run(1,', '  pkg.p_run(1,'),cursor,{operation:'reorder',order:[1,0]}).error,/Qualified/);
  assert.match(planChangeSignature(source.replace("p_run(1, 'one')","p_run(1)"),cursor,{operation:'reorder',order:[1,0]}).error,/argument count/);
  assert.equal(planChangeSignature(source.replace('p_run(p_label',"EXECUTE IMMEDIATE 'p_run(1,2)';\n  p_run(p_label"),cursor,{operation:'reorder',order:[1,0]}).error,undefined);
});
