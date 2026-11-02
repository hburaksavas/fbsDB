import test from 'node:test';
import assert from 'node:assert/strict';
import { getSqlStatements, getStatementAtCursor } from '../src/sqlStatements.js';
test('separates queries and skips comment-only content', () => {
  const sql = '-- note\n\nSELECT 1 FROM dual;\n/* note */ SELECT 2 FROM dual; -- end';
  const ranges = getSqlStatements(sql);
  assert.deepEqual(ranges.map(s => s.sql), ['SELECT 1 FROM dual;', 'SELECT 2 FROM dual;']);
  assert.equal(sql.slice(ranges[1].start, ranges[1].start + 6), 'SELECT');
  assert.equal(getSqlStatements('-- comment\n/* only */').length, 0);
});
test('ignores delimiters in Oracle literals, identifiers and comments', () => {
  assert.equal(getSqlStatements(`SELECT q'[a';b]', 'it''s;', "a;b" FROM dual /* ; */; SELECT 2 FROM dual;`).length, 2);
});
test('preserves PL/SQL internal semicolons until slash delimiter', () => {
  assert.deepEqual(getSqlStatements('BEGIN\n NULL;\n NULL;\nEND;\n/\nSELECT 1 FROM dual;').map(s => s.sql), ['BEGIN\n NULL;\n NULL;\nEND;', 'SELECT 1 FROM dual;']);
});
test('caret immediately after delimiter selects the preceding statement', () => {
 const sql = 'SELECT 1 FROM dual;\nSELECT 2 FROM dual;';
 const end = sql.indexOf(';') + 1;
 assert.equal(getStatementAtCursor(sql, end), 'SELECT 1 FROM dual;');
 assert.equal(getStatementAtCursor(sql, end + 1), 'SELECT 2 FROM dual;');
});

test('comments between CREATE header keywords retain PL/SQL statement boundaries', () => {
  const source='CREATE /* note */ OR -- replace\nREPLACE NONEDITIONABLE /* package */ PACKAGE BODY demo AS PROCEDURE run IS BEGIN NULL; END; END;\n/\nSELECT 1 FROM dual;';
  const statements=getSqlStatements(source);
  assert.equal(statements.length,2);
  assert.ok(statements[0].sql.includes('NULL; END; END;'));
  assert.equal(statements[1].sql,'SELECT 1 FROM dual;');
});
