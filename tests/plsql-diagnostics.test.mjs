import test from 'node:test';
import assert from 'node:assert/strict';
import { compilationProblemItems, mapCompilationPosition, offsetAtOraclePosition } from '../src/plsqlDiagnostics.js';
import { oracleDiagnostics } from '../src/oracleDiagnostics.js';

test('Oracle stored-source positions map through CREATE prefixes and schema qualifiers', () => {
  const stored = 'PROCEDURE demo IS\nBEGIN\n  invalid_call;\nEND;\n';
  const submitted = 'CREATE OR REPLACE PROCEDURE app.demo IS\nBEGIN\n  invalid_call;\nEND;';
  assert.equal(mapCompilationPosition(stored, submitted, 3, 3), submitted.indexOf('invalid_call'));
  const snapshot = '-- earlier statement\nSELECT 1 FROM dual;\n\n' + submitted;
  const report = { owner: 'APP', name: 'DEMO', type: 'PROCEDURE', source: stored, errors: [{ line: 3, position: 3, text: 'PLS-00201: identifier must be declared', attribute: 'ERROR' }] };
  const [problem] = compilationProblemItems(report, { executedSql: submitted, editorSnapshot: snapshot, statementOffset: snapshot.indexOf('CREATE'), fileName: 'demo.sql' }, 'origin-tab');
  assert.equal(problem.offset, snapshot.indexOf('invalid_call')); assert.equal(problem.tabId, 'origin-tab'); assert.equal(problem.line, 6); assert.equal(problem.column, 3);
});

test('unmatched or subsequently changed source never gets a guessed editor position', () => {
  const stored = 'PROCEDURE demo IS BEGIN old_call; END;', submitted = 'CREATE PROCEDURE demo IS BEGIN new_call; END;';
  assert.equal(mapCompilationPosition(stored, submitted, 1, stored.indexOf('old_call') + 1), null);
  const report = { owner: 'APP', name: 'DEMO', type: 'PROCEDURE', source: stored, errors: [{ line: 1, position: 1, text: 'PLS-00103', attribute: 'ERROR' }] };
  assert.equal(compilationProblemItems(report, { executedSql: submitted, editorSnapshot: submitted, statementOffset: 0 }, 'a')[0].offset, null);
  assert.equal(offsetAtOraclePosition(stored, 99, 1), null);
  assert.equal(offsetAtOraclePosition('😀x', 1, 2), 2);
});

test('comments, strings and quoted identifiers retain Oracle error coordinates', () => {
  const stored = 'PACKAGE BODY "MiPkg" AS\n PROCEDURE run IS BEGIN x := q\'[a;😀]\'; bad_call; END;\nEND;';
  const submitted = 'CREATE OR REPLACE EDITIONABLE PACKAGE BODY "App"."MiPkg" AS\n PROCEDURE run IS BEGIN x := q\'[a;😀]\'; bad_call; END;\nEND;';
  const row = stored.split('\n')[1], column = Array.from(row.slice(0, row.indexOf('bad_call'))).length + 1;
  assert.equal(mapCompilationPosition(stored, submitted, 2, column), submitted.indexOf('bad_call'));
});

test('client diagnostics ignore q-quoted data and report actual structural tokens', () => {
  assert.equal(oracleDiagnostics("BEGIN x := q'[unmatched(']'; NULL; END;").filter(item => item.severity === 'error').length, 0);
  assert.ok(oracleDiagnostics('SELECT (1 FROM dual').some(item => item.message === 'Unclosed parenthesis.'));
  assert.equal(oracleDiagnostics('SELECT 1 FROM dual WHERE x != NULL;').filter(item => item.message.includes('IS NULL')).length, 1);
  assert.equal(oracleDiagnostics('SELECT "NULL" FROM dual;').filter(item => item.message.includes('IS NULL')).length, 0);
});
