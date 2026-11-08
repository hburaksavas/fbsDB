import test from 'node:test';
import assert from 'node:assert/strict';
import { parameterNameHints } from '../src/parameterNameHints.js';

const at = (source, hints) => hints.map(hint => `${source.slice(hint.offset, hint.offset + 8).split(/[,()\s]/)[0]}:${hint.label}`);

test('positional arguments of local routines get their parameter names; named ones and matching names do not', () => {
  const source = `DECLARE
  PROCEDURE post(p_id NUMBER, p_amount NUMBER, p_note VARCHAR2 DEFAULT NULL) IS BEGIN NULL; END;
  p_amount NUMBER := 5;
BEGIN
  post(42, p_amount, 'x');
  post(7, p_note => 'n', p_amount => 1);
  post(nvl(1, 2), 3);
END;`;
  assert.deepEqual(at(source, parameterNameHints(source)), ['42:p_id =>', "'x':p_note =>", '7:p_id =>', 'nvl:p_id =>', '3:p_amount =>']);
});

test('declarations, keywords, built-in functions and unknown routines get no hints', () => {
  const source = `CREATE OR REPLACE PROCEDURE p(a NUMBER) IS
  v VARCHAR2(10) := SUBSTR('abc', 1, 2);
  CURSOR c(x NUMBER) IS SELECT * FROM t WHERE id IN (1, 2);
BEGIN
  unknown_proc(1, 2);
  IF (a > 1) THEN NULL; END IF;
END;`;
  assert.deepEqual(parameterNameHints(source), []);
});

test('overloads give a hint only where they agree on the name', () => {
  const source = `DECLARE
  PROCEDURE log(p_text VARCHAR2) IS BEGIN NULL; END;
  PROCEDURE log(p_text VARCHAR2, p_level NUMBER) IS BEGIN NULL; END;
  PROCEDURE pick(a NUMBER, b NUMBER) IS BEGIN NULL; END;
  PROCEDURE pick(x VARCHAR2, b NUMBER) IS BEGIN NULL; END;
BEGIN
  log('one');
  log('two', 2);
  pick(1, 2);
END;`;
  assert.deepEqual(at(source, parameterNameHints(source)), ["'one':p_text =>", "'two':p_text =>", '2:p_level =>', '2:b =>']);
});

test('package members come from loaded database metadata, qualified or not', () => {
  const source = `BEGIN
  billing.post(10, SYSDATE);
  hr.billing.post(11, SYSDATE);
  standalone_fn(3);
END;`;
  const metadata = [
    { owner: 'APP', name: 'BILLING', type: 'PACKAGE', members: [{ name: 'POST', parameters: [{ name: 'P_ID' }, { name: 'P_WHEN' }] }] },
    { owner: 'HR', name: 'BILLING', type: 'PACKAGE', members: [{ name: 'POST', parameters: [{ name: 'P_KEY' }, { name: 'P_AT' }] }] },
    { owner: 'APP', name: 'STANDALONE_FN', type: 'FUNCTION', members: [{ name: 'STANDALONE_FN', parameters: [{ name: 'P_N' }] }] },
  ];
  assert.deepEqual(at(source, parameterNameHints(source, { metadata, currentSchema: 'APP' })), ['10:P_ID =>', 'SYSDATE:P_WHEN =>', '11:P_KEY =>', 'SYSDATE:P_AT =>', '3:P_N =>']);
});

test('only arguments inside the requested range are returned', () => {
  const source = `DECLARE
  PROCEDURE post(p_id NUMBER) IS BEGIN NULL; END;
BEGIN
  post(1);
  post(2);
END;`;
  const second = source.lastIndexOf('post(2)');
  assert.deepEqual(at(source, parameterNameHints(source, { start: second, end: source.length })), ['2:p_id =>']);
});
