import test from 'node:test';
import assert from 'node:assert/strict';
import { autoRunStatement, autoRunStep } from '../src/relatedAutoRun.js';

test('a generated foreign key SELECT runs without its terminator', () => {
  assert.equal(autoRunStatement('SELECT * FROM "HR"."DEPARTMENTS" WHERE "DEPARTMENT_ID" = 10;'), 'SELECT * FROM "HR"."DEPARTMENTS" WHERE "DEPARTMENT_ID" = 10');
  assert.equal(autoRunStatement(`SELECT * FROM "A"."B" WHERE "C" = 'x;y'`), `SELECT * FROM "A"."B" WHERE "C" = 'x;y'`);
});
test('drafts that change data, several statements, binds and empty text never run by themselves', () => {
  assert.equal(autoRunStatement('UPDATE "HR"."EMPLOYEES" SET "SALARY" = 1 WHERE "EMPLOYEE_ID" = 7;'), null);
  assert.equal(autoRunStatement('SELECT 1 FROM dual; DELETE FROM t'), null);
  assert.equal(autoRunStatement('SELECT * FROM t WHERE id = :id'), null);
  assert.equal(autoRunStatement(''), null);
  assert.equal(autoRunStatement(null), null);
});
test('the lookup waits for its own tab to connect, then runs once', () => {
  const pending = { tabId: 'new-1', sql: 'SELECT 1 FROM dual' };
  const state = { activeTabId: 'new-1', connected: false, connecting: true, executing: false, connectionError: '', generation: 0 };
  assert.equal(autoRunStep(null, state), 'wait');
  assert.equal(autoRunStep(pending, state), 'wait');
  assert.equal(autoRunStep(pending, { ...state, connecting: false }), 'wait', 'waiting for credentials');
  assert.equal(autoRunStep(pending, { ...state, connecting: false, connected: true, generation: 0 }), 'wait', 'a shown profile is not a session yet');
  assert.equal(autoRunStep(pending, { ...state, connecting: false, connected: true, generation: 1 }), 'run');
  assert.equal(autoRunStep(pending, { ...state, connecting: false, connected: true, generation: 1, executing: true }), 'wait');
});
test('leaving the tab or a failed connection drops the lookup', () => {
  const pending = { tabId: 'new-1', sql: 'SELECT 1 FROM dual' };
  assert.equal(autoRunStep(pending, { activeTabId: 'other', connected: true, connecting: false, executing: false, connectionError: '', generation: 3 }), 'drop');
  assert.equal(autoRunStep(pending, { activeTabId: 'new-1', connected: false, connecting: false, executing: false, connectionError: 'ORA-01017', generation: 0 }), 'drop');
});
