import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleLanguageCompletions } from '../src/oracleLanguageService.js';
import { languageMetadataTargets } from '../src/oracleLanguageService.js';
import { oracleInlineCompletion } from '../src/oracleInlineCompletion.js';

const objects = [
  { owner: 'APP', name: 'EMP', type: 'TABLE', columns: [{ name: 'ID', type: 'NUMBER' }, { name: 'NAME', type: 'VARCHAR2' }] },
  { owner: 'OTHER', name: 'DEPT', type: 'TABLE', columns: [{ name: 'ID', type: 'NUMBER' }] },
];
const complete = marked => oracleLanguageCompletions(marked.replace('|', ''), marked.indexOf('|'), { objects, currentSchema: 'APP', automatic: true });

test('multiline ORDER/GROUP retain relevant columns at the top without unrelated clauses', () => {
  for (const clause of ['ORDER BY', 'GROUP BY']) for (const gap of [' ', '\n  ']) {
    const result = complete(`SELECT * FROM EMP ${clause}${gap}|`);
    assert.equal(result.candidates[0].label, 'ID');
    assert.equal(result.candidates[1].label, 'NAME');
    for (const forbidden of ['JOIN', 'CROSS JOIN', 'BETWEEN', 'AND', 'CREATE']) assert.ok(!result.candidates.some(c => c.label === forbidden), forbidden);
  }
});

test('SELECT and WHERE exclude unrelated keyword kinds', () => {
  for (const marked of ['SELECT | FROM EMP', 'SELECT * FROM EMP WHERE |']) {
    const result = complete(marked);
    assert.equal(result.candidates[0].label, 'ID');
    for (const forbidden of ['ASC', 'DESC', 'BY', 'CREATE', 'CROSS JOIN']) assert.ok(!result.candidates.some(c => c.label === forbidden), forbidden);
  }
});

test('bare projection aliases survive CTE and inline views', () => {
  for (const marked of ['WITH q AS (SELECT NAME employee_name FROM EMP) SELECT q.| FROM q', 'SELECT q.| FROM (SELECT NAME employee_name FROM EMP) q']) {
    assert.deepEqual(complete(marked).candidates.filter(c => !c.bulkColumns).map(c => c.label), ['EMPLOYEE_NAME']);
  }
});

test('later CTE definitions do not leak into earlier definitions', () => {
  assert.ok(!complete('WITH a AS (SELECT * FROM |), later_q AS (SELECT ID FROM EMP) SELECT * FROM a').candidates.some(c => c.label === 'later_q'));
});

test('accepting a foreign schema table preserves the SQL suffix and adds its owner', () => {
  const marked = 'SELECT * FROM DE| WHERE ID = :id', source = marked.replace('|', '');
  const candidate = complete(marked).candidates.find(c => c.label === 'DEPT');
  assert.ok(candidate);
  assert.equal(source.slice(0, candidate.start) + candidate.insertText + source.slice(candidate.end), 'SELECT * FROM OTHER.DEPT WHERE ID = :id');
});

test('predicate operands, comparisons and logical continuations have distinct candidates', () => {
  for (const clause of ['WHERE', 'HAVING', 'ON']) {
    const prefix = clause === 'ON' ? 'SELECT * FROM EMP e JOIN OTHER.DEPT d ON ' : `SELECT * FROM EMP ${clause} `;
    const operators = complete(prefix + 'ID |');
    assert.equal(operators.context.expectation, 'operator');
    assert.equal(operators.candidates[0].label, '=');
    assert.ok(operators.candidates.every(c => c.kind === 'keyword'));
    const value = complete(prefix + 'ID = |');
    assert.equal(value.context.expectation, 'value');
    assert.ok(value.candidates.some(c => c.label === 'ID'));
    assert.ok(!value.candidates.some(c => ['AND', 'OR', 'IN', 'LIKE', '='].includes(c.label)));
    for (const rhs of ['1', "'literal'", ':id', 'LENGTH(NAME)']) {
      assert.deepEqual(complete(prefix + `ID = ${rhs} |`).candidates.map(c => c.label), ['AND', 'OR']);
    }
  }
});

test('predicate states survive newlines, comments, BETWEEN and incomplete functions', () => {
  assert.deepEqual(complete('SELECT * FROM EMP WHERE ID\n /* x */ |').candidates.map(c => c.label).slice(0, 2), ['=', '<>']);
  assert.deepEqual(complete('SELECT * FROM EMP WHERE ID IS |').candidates.map(c => c.label), ['NULL', 'NOT NULL']);
  assert.deepEqual(complete('SELECT * FROM EMP WHERE ID IS NOT |').candidates.map(c => c.label), ['NULL']);
  assert.deepEqual(complete('SELECT * FROM EMP WHERE ID BETWEEN 1 |').candidates.map(c => c.label), ['AND']);
  assert.ok(complete('SELECT * FROM EMP WHERE ID BETWEEN 1 AND |').candidates.some(c => c.label === 'ID'));
  assert.deepEqual(complete('SELECT * FROM EMP WHERE ID BETWEEN 1 AND 2 |').candidates.map(c => c.label), ['AND', 'OR']);
  assert.equal(complete('SELECT * FROM EMP WHERE ID BETWEEN 1 AND 2 AND NAME |').candidates[0].label, '=');
  assert.ok(complete('SELECT * FROM EMP WHERE LENGTH(|').candidates.some(c => c.label === 'NAME'));
  assert.equal(complete('SELECT * FROM EMP WHERE (ID |').candidates[0].label, '=');
  assert.deepEqual(complete('SELECT * FROM EMP WHERE (ID = 1) |').candidates.map(c => c.label), ['AND', 'OR']);
  assert.deepEqual(complete('SELECT * FROM EMP WHERE EXISTS (|').candidates.map(c => c.label), ['SELECT']);
  assert.ok(complete('SELECT * FROM EMP WHERE ID IN (|').candidates.some(c => c.label === 'SELECT'));
  const marked = 'SELECT * FROM EMP WHERE ID l| AND NAME = :name', source = marked.replace('|', '');
  const candidate = complete(marked).candidates.find(c => c.label === 'LIKE');
  assert.equal(source.slice(0, candidate.start) + candidate.insertText + source.slice(candidate.end), 'SELECT * FROM EMP WHERE ID LIKE  AND NAME = :name');
});

test('star projections expand verified sources through chained CTEs and nested views', () => {
  for (const marked of [
    'WITH q AS (SELECT * FROM EMP) SELECT q.| FROM q',
    'WITH q AS (SELECT e.* FROM EMP e), r AS (SELECT * FROM q) SELECT r.| FROM r',
    'SELECT q.| FROM (SELECT * FROM (SELECT * FROM EMP) x) q',
  ]) assert.deepEqual(complete(marked).candidates.filter(c => !c.bulkColumns).map(c => c.label), ['ID', 'NAME']);
  assert.deepEqual(complete('WITH q AS (SELECT d.* FROM EMP e JOIN OTHER.DEPT d ON e.ID=d.ID) SELECT q.| FROM q').candidates.filter(c => !c.bulkColumns).map(c => c.label), ['ID']);
  assert.deepEqual(complete('WITH q(custom_id, custom_name) AS (SELECT * FROM EMP) SELECT q.| FROM q').candidates.filter(c => !c.bulkColumns).map(c => c.label), ['CUSTOM_ID', 'CUSTOM_NAME']);
  assert.deepEqual(complete('WITH q AS (SELECT * FROM missing_table) SELECT q.| FROM q').candidates, []);
  const sql = 'WITH q AS (SELECT * FROM EMP) SELECT q. FROM q';
  assert.ok(languageMetadataTargets(sql, sql.indexOf('q.') + 2, { objects, currentSchema: 'APP' }).some(t => t.name === 'EMP'));
});

test('ghost text agrees with the first popup candidate and never skips to another candidate', () => {
  for (const marked of ['s|', 'SELECT|', 'SELECT *|', 'SELECT * FROM EM|', 'SELECT * FROM EMP WHERE NA|']) {
    const source = marked.replace('|', ''), result = complete(marked);
    const ghost = oracleInlineCompletion(source, marked.indexOf('|'), {}, result);
    assert.ok(ghost, marked);
    assert.equal(ghost.insertText, result.candidates[0].insertText, marked);
    assert.equal(ghost.key, result.candidates[0].key, marked);
  }
  const source = 'SELECT * FROM DE', result = complete(source + '|');
  assert.equal(oracleInlineCompletion(source, source.length, {}, result), null, 'qualified replacement cannot preserve the typed prefix; only the popup should offer it');
});

