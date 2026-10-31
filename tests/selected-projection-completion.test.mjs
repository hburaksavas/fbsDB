import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleLanguageCompletions } from '../src/oracleLanguageService.js';
import { monacoCompletionItems } from '../src/oracleCompletionClient.js';
import { rankLearnedCandidates } from '../src/suggestionLearning.js';

const objects = ['ACCOUNTS', 'OTHER_ACCOUNTS'].map(name => ({ owner: 'APP', name, type: 'TABLE', columns: [
  { name: 'ACCOUNT_ID', type: 'NUMBER' }, { name: 'NAME', type: 'VARCHAR2' }, { name: 'Display Name', type: 'VARCHAR2' },
] }));
function at(marked) {
  const cursor = marked.indexOf('|'), source = marked.replace('|', '');
  return { source, ...oracleLanguageCompletions(source, cursor, { objects, currentSchema: 'APP' }) };
}
const fields = result => result.candidates.filter(item => item.column);

test('selected columns remain selectable with lower priority and a subdued description', () => {
  const result = at('select account_id, | from accounts;');
  const candidates = fields(result), used = candidates.find(item => item.label === 'ACCOUNT_ID');
  assert.equal(used.alreadySelected, true);
  assert.ok(candidates.indexOf(used) > candidates.findIndex(item => item.label === 'NAME'));
  const model = { getPositionAt: offset => ({ lineNumber: 1, column: offset + 1 }) };
  const monaco = { Range: class {}, languages: { CompletionItemKind: {}, CompletionItemInsertTextRule: {} } };
  const item = monacoCompletionItems(monaco, model, { ...result, candidates: [used] })[0];
  assert.deepEqual(item.label, { label: 'ACCOUNT_ID', description: 'SELECT’te mevcut' });
  assert.equal(item.filterText, 'ACCOUNT_ID');
  assert.equal(result.source.slice(0, used.start) + used.insertText + result.source.slice(used.end), 'select account_id, ACCOUNT_ID from accounts;');
  assert.ok(fields(at('select account_id, acc| from accounts')).some(item => item.label === 'ACCOUNT_ID' && item.alreadySelected));
  const ranked = rankLearnedCandidates(candidates, result.context, [{ context: 'select', key: used.key, count: 1000, last: Date.now() }]);
  assert.notEqual(ranked[0].label, 'ACCOUNT_ID');
});

test('aliases and self joins keep the other source column at its normal priority', () => {
  const result = at('SELECT a.ACCOUNT_ID, | FROM accounts a JOIN accounts b ON a.ACCOUNT_ID=b.ACCOUNT_ID');
  const ids = fields(result).filter(item => item.label === 'ACCOUNT_ID');
  assert.equal(ids.length, 2);
  assert.equal(ids.find(item => item.insertText === 'A.ACCOUNT_ID').alreadySelected, true);
  assert.ok(!ids.find(item => item.insertText === 'B.ACCOUNT_ID').alreadySelected);
  assert.equal(fields(at('SELECT a.ACCOUNT_ID, b.| FROM accounts a JOIN accounts b ON 1=1')).find(item => item.label === 'ACCOUNT_ID').alreadySelected, undefined);
});

test('projection aliases, quoted names and stars mark the source columns', () => {
  for (const selected of ['a.account_id AS id', 'a.account_id id', 'account_id AS id', 'account_id id']) {
    assert.equal(fields(at(`SELECT ${selected}, a.| FROM accounts a`)).find(item => item.label === 'ACCOUNT_ID').alreadySelected, true, selected);
  }
  assert.equal(fields(at('SELECT "a x"."Display Name", "a x".| FROM accounts "a x"')).find(item => item.label === 'Display Name').alreadySelected, true);
  for (const star of ['*', 'a.*']) assert.ok(fields(at(`SELECT ${star}, a.| FROM accounts a`)).every(item => item.alreadySelected));
});

test('scope, expressions, active replacements and predicates retain normal ranking', () => {
  for (const sql of [
    'SELECT acc|ount_id FROM accounts',
    'SELECT a.acc|ount_id FROM accounts a',
    'SELECT ACCOUNT_ID FROM accounts; SELECT | FROM accounts',
    'SELECT COUNT(ACCOUNT_ID), | FROM accounts',
    "SELECT 'ACCOUNT_ID' AS ACCOUNT_ID, | FROM accounts",
    'SELECT (SELECT ACCOUNT_ID FROM accounts), a.| FROM accounts a',
    'SELECT ACCOUNT_ID FROM accounts WHERE |',
    'WITH q AS (SELECT ACCOUNT_ID, NAME FROM accounts) SELECT q.| FROM q',
  ]) assert.ok(fields(at(sql)).every(item => !item.alreadySelected), sql);
  assert.equal(fields(at('SELECT |, ACCOUNT_ID FROM accounts')).find(item => item.label === 'ACCOUNT_ID').alreadySelected, true);
});
