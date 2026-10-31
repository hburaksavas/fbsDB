import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleLanguageCompletions, languageMetadataTargets } from '../src/oracleLanguageService.js';

const objects = [{ owner: 'APP', name: 'ORDERS', type: 'TABLE', columns: [
  { name: 'ID', type: 'NUMBER' }, { name: 'Display Name', type: 'VARCHAR2' }, { name: 'CREATED_AT', type: 'DATE' },
]}];
function complete(marked, settings = {}) {
  const cursor = marked.indexOf('|'), source = marked.replace('|', '');
  const result = oracleLanguageCompletions(source, cursor, { objects, currentSchema: 'APP', settings });
  return { source, ...result, all: result.candidates.find(item => item.filterText === 'all') };
}
test('alias.all expands verified columns in order and preserves the SQL suffix', () => {
  for (const fragment of ['', 'a', 'al', 'all', 'ALL']) {
    const result = complete(`select a.${fragment}| from app.orders a where a.ID = :id;`);
    assert.ok(result.all);
    const item = result.all;
    assert.equal(result.source.slice(0, item.start) + item.insertText + result.source.slice(item.end),
      'select a.ID, a."Display Name", a.CREATED_AT from app.orders a where a.ID = :id;');
  }
});
test('all completion respects quoted aliases, joins, CTE and derived projections', () => {
  for (const marked of [
    'SELECT "a x".all| FROM app.orders "a x"',
    'SELECT 1, a.all| FROM app.orders a JOIN app.orders b ON a.ID=b.ID',
    'WITH q AS (SELECT ID, CREATED_AT FROM app.orders) SELECT a.all| FROM q a',
    'SELECT a.all| FROM (SELECT ID, CREATED_AT FROM app.orders) a',
  ]) {
    const result = complete(marked);
    assert.ok(result.all, marked);
    assert.ok(result.all.insertText.includes('.ID'));
    if (marked.includes('"a x"')) assert.ok(result.all.insertText.startsWith('"a x".ID'));
    if (marked.includes('SELECT ID,')) assert.equal(result.all.insertText, 'a.ID, a.CREATED_AT');
  }
});
test('all list is excluded from predicates, expressions, strings and disabled columns', () => {
  for (const marked of [
    'SELECT * FROM app.orders a WHERE a.all|', 'SELECT SUM(a.all|) FROM app.orders a',
    'SELECT 1 + a.all| FROM app.orders a', "SELECT 'a.all|' FROM app.orders a",
    'SELECT a."all|" FROM app.orders a', 'SELECT a.all| FROM missing a',
  ]) assert.equal(complete(marked).all, undefined, marked);
  assert.equal(complete('SELECT a.all| FROM app.orders a', { showColumns: false }).all, undefined);
});


test('alias metadata targets exclude unrelated joined tables', () => {
  const source = 'SELECT a. FROM app.orders a JOIN app.other b ON a.ID=b.ID';
  const targets = languageMetadataTargets(source, source.indexOf('a.') + 2, {
    objects: [...objects, { owner: 'APP', name: 'OTHER', type: 'TABLE' }], currentSchema: 'APP',
  });
  assert.deepEqual(targets.map(target => target.name), ['ORDERS']);
});
test('all columns remain available when the popup candidate count is limited', () => {
  const source = 'SELECT a. FROM app.orders a';
  const columns = Array.from({ length: 400 }, (_, i) => ({ name: `COL_${i}`, type: 'NUMBER' }));
  const result = oracleLanguageCompletions(source, source.indexOf('a.') + 2, {
    objects: [{ ...objects[0], columns }], currentSchema: 'APP', settings: { maxSuggestions: 50, snippets: false },
  });
  const all = result.candidates.find(item => item.bulkColumns);
  assert.equal(result.candidates.length, 50);
  assert.equal(all.insertText.split(', ').length, 400);
});
