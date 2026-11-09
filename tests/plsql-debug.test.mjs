import test from 'node:test';
import assert from 'node:assert/strict';
import { debugUnit, toDatabaseLine, toEditorLine, sameUnit, toggleBreakpoint, shiftBreakpoints, debugVariableNames, debugBreakpoints } from '../src/plsqlDebug.js';

const body = `-- billing package
-- second comment
CREATE OR REPLACE
PACKAGE BODY app.billing IS
  g_count NUMBER;
  PROCEDURE run(p_label VARCHAR2) IS
    v_total NUMBER := 0;
  BEGIN
    FOR i IN 1..3 LOOP
      v_total := v_total + i;
    END LOOP;
  END;
END;
/`;

test('a source file maps its lines to ALL_SOURCE lines from the line of its type keyword', () => {
  const unit = debugUnit({ content: body });
  assert.deepEqual(unit, { owner: 'APP', name: 'BILLING', type: 'PACKAGE BODY', firstLine: 4 });
  assert.equal(toDatabaseLine(unit, 10), 7);
  assert.equal(toEditorLine(unit, 7), 10);
});

test('a definition opened from the database counts from line 1; quoted or non-PL/SQL sources are not debuggable', () => {
  assert.deepEqual(debugUnit({ name: 'APP.BILLING.body.sql', readOnly: true, content: 'PACKAGE BODY billing IS', definitionObject: { owner: 'APP', name: 'BILLING', type: 'PACKAGE' } }), { owner: 'APP', name: 'BILLING', type: 'PACKAGE BODY', firstLine: 1 });
  assert.equal(debugUnit({ content: 'SELECT 1 FROM dual' }), null);
  assert.equal(debugUnit({ content: 'CREATE PROCEDURE "Mixed" IS BEGIN NULL; END;' }), null);
  assert.equal(debugUnit({ content: 'CREATE TABLE t (x NUMBER)' }), null);
});

test('a paused location matches a unit with or without a schema', () => {
  const unit = { owner: null, name: 'BILLING', type: 'PACKAGE BODY' };
  assert.ok(sameUnit(unit, { owner: 'APP', name: 'BILLING', type: 'PACKAGE BODY' }));
  assert.ok(!sameUnit(unit, { owner: 'APP', name: 'BILLING', type: 'PACKAGE' }));
  assert.ok(!sameUnit({ ...unit, owner: 'HR' }, { owner: 'APP', name: 'BILLING', type: 'PACKAGE BODY' }));
});

test('breakpoints toggle and follow edits; lines that are deleted lose theirs', () => {
  assert.deepEqual(toggleBreakpoint([3], 7), [3, 7]);
  assert.deepEqual(toggleBreakpoint([3, 7], 3), [7]);
  assert.deepEqual(shiftBreakpoints([3, 7, 10], [{ startLine: 5, endLine: 5, insertedLines: 2 }]), [3, 9, 12]);
  assert.deepEqual(shiftBreakpoints([3, 7, 10], [{ startLine: 6, endLine: 8, insertedLines: 0 }]), [3, 8]);
  assert.deepEqual(shiftBreakpoints([3, 7], [{ startLine: 7, endLine: 7, insertedLines: 0 }]), [3, 7]);
});

test('the names asked for at a paused line are the parameters, variables and loop indexes in scope', () => {
  const names = debugVariableNames(body, 10);
  for (const name of ['P_LABEL', 'V_TOTAL', 'I']) assert.ok(names.includes(name), name);
  assert.ok(!names.includes('RUN'));
  assert.deepEqual(debugVariableNames(body, 99), []);
});

test('breakpoints of open units become database lines; other tabs are left out', () => {
  const tabs = [{ id: 'a', content: body }, { id: 'b', content: 'SELECT 1 FROM dual' }];
  assert.deepEqual(debugBreakpoints(tabs, { a: [10, 2], b: [1] }), [{ tabId: 'a', unit: { owner: 'APP', name: 'BILLING', type: 'PACKAGE BODY', firstLine: 4 }, lines: [7] }]);
});
