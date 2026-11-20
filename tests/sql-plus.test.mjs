import test from 'node:test';
import assert from 'node:assert/strict';
import { getSqlStatements } from '../src/sqlStatements.js';
import { prepareScript, describeSql } from '../src/sqlPlus.js';
import { executionTarget } from '../src/workbenchUx.js';

const script = `SET SERVEROUTPUT ON
PROMPT start
REM comment line
DEFINE dept = 10
DEFINE who = 'SCOTT';
SELECT * FROM emp WHERE deptno = &dept AND ename = '&who.';
UPDATE emp SET sal = 1 WHERE deptno = &&dept;
UNDEFINE dept
SELECT &dept FROM dual;
`;

test('directives never merge into the next statement', () => {
  assert.deepEqual(getSqlStatements(script).map(item => item.sql.split('\n')[0]), [
    "SELECT * FROM emp WHERE deptno = &dept AND ename = '&who.';",
    'UPDATE emp SET sal = 1 WHERE deptno = &&dept;',
    'SELECT &dept FROM dual;',
  ]);
  assert.equal(getSqlStatements('SET SERVEROUTPUT ON\nselect 1 from dual;').length, 1);
});

test('real SQL starting with SET stays a statement', () => {
  assert.equal(getSqlStatements('SET TRANSACTION READ ONLY;\nSET ROLE ALL;').length, 2);
  assert.equal(getSqlStatements('UPDATE t\nSET a = 1;').length, 1);
});

test('script substitution follows DEFINE and UNDEFINE in order', () => {
  const { statements } = prepareScript(getSqlStatements(script, { directives: true }));
  assert.deepEqual(statements.map(item => item.sql), [
    "SELECT * FROM emp WHERE deptno = 10 AND ename = 'SCOTT';",
    'UPDATE emp SET sal = 1 WHERE deptno = 10;',
    'SELECT &dept FROM dual;',
  ]);
});

test('SET DEFINE OFF stops substitution', () => {
  const { statements } = prepareScript(getSqlStatements('DEFINE a = 1\nSET DEFINE OFF\nSELECT \'&a\' FROM dual;', { directives: true }));
  assert.equal(statements[0].sql, "SELECT '&a' FROM dual;");
});

test('WHENEVER SQLERROR sets the continue default', () => {
  assert.equal(prepareScript(getSqlStatements('WHENEVER SQLERROR CONTINUE\nselect 1 from dual;', { directives: true })).continueOnError, true);
  assert.equal(prepareScript(getSqlStatements('WHENEVER SQLERROR EXIT FAILURE\nselect 1 from dual;', { directives: true })).continueOnError, false);
  assert.equal(prepareScript(getSqlStatements('select 1 from dual;', { directives: true })).continueOnError, null);
});

test('DESCRIBE becomes a catalog query', () => {
  const { statements } = prepareScript(getSqlStatements('DESC hr.emp\nDESCRIBE "Mixed"', { directives: true }));
  assert.match(statements[0].sql, /owner = 'HR'/);
  assert.match(statements[0].sql, /table_name = 'EMP'/);
  assert.match(statements[1].sql, /table_name = 'Mixed'/);
  assert.match(statements[1].sql, /SYS_CONTEXT/);
  assert.equal(describeSql('a.b.c'), '');
});

test('running at the caret substitutes earlier definitions only', () => {
  const text = 'DEFINE n = 5\nselect &n from dual;\nDEFINE n = 6\nselect &n from dual;';
  const first = text.indexOf('select');
  assert.equal(executionTarget(text, { caret: first + 3 }).sql, 'select 5 from dual;');
  assert.equal(executionTarget(text, { caret: text.length }).sql, 'select 6 from dual;');
});

test('caret on a command line reports it, DESCRIBE runs its query', () => {
  const text = 'DEFINE n = 5\nDESC emp\nselect 1 from dual;';
  assert.equal(executionTarget(text, { caret: 3 }).kind, 'sql*plus');
  assert.match(executionTarget(text, { caret: text.indexOf('DESC') + 2 }).sql, /all_tab_columns/);
});
