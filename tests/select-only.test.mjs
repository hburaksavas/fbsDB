import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSelectOnly } from '../src/selectOnly.js';

test('accepts one SELECT, CTEs and Oracle literals without interpreting their contents', () => {
  for (const sql of [
    'select :id from dual;',
    'with a as (select :id id from dual) select * from a',
    `-- delete\nSELECT q'[delete; :hidden ( )]' text, 'update' value, "INTO" FROM dual; -- end`,
    `SELECT nq'{insert;}' text FROM dual`,
    'select (select 1 from dual) value from dual',
  ]) assert.equal(assertSelectOnly(sql), sql.trim());
});

test('rejects scripts, DML, PL/SQL, FOR UPDATE, SELECT INTO and incomplete literals', () => {
  for (const sql of [
    '', 'delete from t', 'select 1 from dual; delete from t;',
    'with a as (select 1 from dual) update t set n=1',
    'begin null; end;', 'select * from t for update', 'select n into :n from t',
    'with function f return number is begin return 1; end; select f() from dual',
    `select 'oops from dual`, 'select (1 from dual', 'select 1) from dual', 'select 1 from dual /* unclosed',
  ]) assert.throws(() => assertSelectOnly(sql), undefined, sql);
});

test('the rejection names what was being run', () => {
  assert.throws(() => assertSelectOnly('delete from t', 'A picker runs'), /^Error: A picker runs one SELECT query only/);
});
