import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMiniToolSelect, miniToolFromResult, normalizeMiniTool } from '../src/miniTools.js';

test('accepts one SELECT, CTEs and Oracle literals without interpreting their contents', () => {
  for (const sql of [
    'select :id from dual;',
    'with a as (select :id id from dual) select * from a',
    `-- delete\nSELECT q'[delete; :hidden ( )]' text, 'update' value, "INTO" FROM dual; -- end`,
    `SELECT nq'{insert;}' text FROM dual`,
    'select (select 1 from dual) value from dual',
  ]) assert.equal(assertMiniToolSelect(sql), sql.trim());
});

test('rejects scripts, DML, PL/SQL, FOR UPDATE, SELECT INTO and incomplete literals', () => {
  for (const sql of [
    '', 'delete from t', 'select 1 from dual; delete from t;',
    'with a as (select 1 from dual) update t set n=1',
    'begin null; end;', 'select * from t for update', 'select n into :n from t',
    'with function f return number is begin return 1; end; select f() from dual',
    `select 'oops from dual`, 'select (1 from dual', 'select 1) from dual', 'select 1 from dual /* unclosed',
  ]) assert.throws(() => assertMiniToolSelect(sql), undefined, sql);
});

test('successful result creates ordered unique bind fields and result column definitions', () => {
  const tool = miniToolFromResult({ executedSql: `select :id, :name, :ID, ':ignored' from dual`,
    columns: [{ name: 'ID' }, { name: 'NAME' }], rows: [['secret']], executedParameters: [{ name: 'ID', value: 'secret' }] });
  assert.deepEqual(tool.fields.map(f => f.name), ['ID', 'NAME']);
  assert.deepEqual(tool.columns, [{ index: 0, name: 'ID', visible: true }, { index: 1, name: 'NAME', visible: true }]);
  assert.ok(!JSON.stringify(tool).includes('secret'));
  assert.throws(() => miniToolFromResult(null));
});

test('normalization allowlists definitions and discards runtime data and profile credentials', () => {
  const tool = normalizeMiniTool({ version: 1, id: 'a'.repeat(32), name: 'Customers', sql: 'select :id from dual',
    fields: [{ name: 'ID', label: 'Customer ID', type: 'NUMBER', required: true, value: 'secret' }],
    columns: [{ name: 'ID', visible: false, rows: ['secret'] }], profile: 'secret', password: 'secret', rows: ['secret'] });
  assert.equal(tool.fields[0].label, 'Customer ID');
  assert.equal(tool.fields[0].type, 'NUMBER');
  assert.equal(tool.columns[0].visible, false);
  assert.ok(!JSON.stringify(tool).includes('secret'));
  assert.deepEqual(normalizeMiniTool(JSON.parse(JSON.stringify(tool))), tool);
});

test('SQL edits reconcile bind names while preserving matching definitions', () => {
  const tool = normalizeMiniTool({ version: 1, name: 'Changed', sql: 'select :new, :id from dual', fields: [
    { name: 'OLD', label: 'Removed', type: 'DATE' }, { name: 'ID', label: 'Identifier', type: 'NUMBER' },
  ] });
  assert.deepEqual(tool.fields.map(f => [f.name, f.label, f.type]), [['NEW', 'NEW', 'VARCHAR2'], ['ID', 'Identifier', 'NUMBER']]);
  assert.throws(() => normalizeMiniTool({ ...tool, version: 2 }));
  assert.throws(() => normalizeMiniTool({ ...tool, name: '' }));
});
