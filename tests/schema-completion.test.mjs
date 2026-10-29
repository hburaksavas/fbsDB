import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { oracleLanguageCompletions } from '../src/oracleLanguageService.js';
import { oracleInlineCompletion } from '../src/oracleInlineCompletion.js';
import { OracleCompletionClient } from '../src/oracleCompletionClient.js';
import { rankLearnedCandidates } from '../src/suggestionLearning.js';

const objects = [
  { owner: 'APP', name: 'FIN_EVENTS', type: 'TABLE', columns: [{ name: 'FIN_ID', type: 'NUMBER' }] },
  { owner: 'FINANCE', name: 'INVOICES', type: 'TABLE', columns: [{ name: 'ID', type: 'NUMBER' }] },
  { owner: 'FINANCE_ARCHIVE', name: 'OLD_INVOICES', type: 'TABLE', columns: [] },
  { owner: 'OTHER_FIN', name: 'REPORTS', type: 'TABLE', columns: [] },
  { owner: 'PUBLIC', name: 'FIN_PUBLIC', type: 'SYNONYM', columns: [] },
];
function at(marked, extra = {}) {
  const cursor = marked.indexOf('¦'), source = marked.replace('¦', '');
  const result = oracleLanguageCompletions(source, cursor, { objects, currentSchema: 'APP', automatic: true, ...extra });
  return { ...result, source, cursor, ghost: oracleInlineCompletion(source, cursor, {}, result) };
}
const apply = (result, candidate = result.candidates[0]) => result.source.slice(0, candidate.start) + candidate.insertText + result.source.slice(candidate.end);

test('schema prefixes lead popup and inline in FROM source positions, retaining case and SQL suffix', () => {
  for (const prefix of ['F', 'FI', 'fin', 'Fin']) {
    for (const gap of [' ', '\n  ', ' /* WHERE is a comment */\n ']) {
      const result = at(`SELECT * FROM${gap}${prefix}¦ WHERE 1 = :value;\nSELECT 2 FROM dual;`);
      assert.equal(result.candidates[0].label, 'FINANCE');
      assert.equal(result.candidates[1].label, 'FINANCE_ARCHIVE');
      assert.ok(result.candidates.findIndex(c => c.label === 'FIN_EVENTS') > 1);
      assert.equal(result.ghost.key, result.candidates[0].key);
      assert.equal(result.ghost.insertText, result.candidates[0].insertText);
      assert.ok(result.ghost.insertText.startsWith(prefix));
      assert.equal(apply(result), `SELECT * FROM${gap}${result.ghost.insertText} WHERE 1 = :value;\nSELECT 2 FROM dual;`);
    }
  }
});

test('schema promotion is query-block local and includes comma and JOIN sources', () => {
  for (const source of [
    'SELECT * FROM APP.FIN_EVENTS e JOIN fi¦',
    'SELECT * FROM APP.FIN_EVENTS e, fi¦',
    'SELECT * FROM (SELECT * FROM APP.FIN_EVENTS WHERE FIN_ID=1) e JOIN fi¦',
    'SELECT * FROM APP.FIN_EVENTS WHERE EXISTS (SELECT * FROM fi¦)',
    'SELECT * FROM APP.FIN_EVENTS WHERE FIN_ID=1 UNION ALL SELECT * FROM fi¦',
    'SELECT * FROM APP.FIN_EVENTS WHERE FIN_ID=1;\nSELECT * FROM fi¦',
  ]) {
    const result = at(source);
    assert.equal(result.candidates[0].label, 'FINANCE', source);
    assert.equal(result.ghost.label, 'FINANCE', source);
  }
});

test('empty prefixes and non-source contexts do not get schema priority or schema ghost text', () => {
  for (const source of [
    'SELECT * FROM ¦',
    'SELECT * FROM APP.FIN_EVENTS WHERE fi¦',
    'SELECT * FROM APP.FIN_EVENTS WHERE FIN_ID = fi¦',
    'SELECT * FROM APP.FIN_EVENTS f JOIN APP.FIN_EVENTS e ON fi¦',
    'SELECT * FROM APP.FIN_EVENTS fi¦',
    'SELECT fi¦ FROM APP.FIN_EVENTS',
    'UPDATE fi¦', 'INSERT INTO fi¦', 'MERGE INTO fi¦',
    'SELECT * FROM APP.FIN_EVENTS ORDER BY fi¦',
    'SELECT * FROM APP.FIN_EVENTS WHERE FIN_ID=1 FROM fi¦',
    "SELECT 'FROM fi¦' FROM dual", 'SELECT /* FROM fi¦ */ 1 FROM dual',
  ]) {
    const result = at(source);
    assert.ok(!result.candidates.some(c => c.preferSchema), source);
    assert.ok(!result.ghost?.schema, source);
  }
});

test('dot completion switches to tables and does not duplicate an existing delimiter', () => {
  const result = at('SELECT * FROM fi¦.INVOICES WHERE ID = :id');
  assert.equal(result.ghost.insertText, 'finance');
  assert.equal(apply(result), 'SELECT * FROM finance.INVOICES WHERE ID = :id');
  const spaced = at('SELECT * FROM fi¦ /* source */\n .INVOICES');
  assert.equal(apply(spaced), 'SELECT * FROM finance /* source */\n .INVOICES');
  const tables = at('SELECT * FROM FINANCE.¦ WHERE ID = :id');
  assert.deepEqual(tables.candidates.map(c => c.label), ['INVOICES']);
  assert.ok(!tables.candidates.some(c => c.schema));
});

test('best schema uses exact before prefix, then valid learned preference among equal matches', () => {
  const result = at('SELECT * FROM fin¦', { objects: [...objects, { owner: 'FIN', name: 'DOCS', type: 'TABLE' }] });
  assert.equal(result.candidates[0].label, 'FIN');
  const entries = result.candidates.map(c => ({ context: 'relation', key: c.key, count: 1000, last: Date.now() }));
  assert.equal(rankLearnedCandidates(result.candidates, result.context, entries)[0].label, 'FIN');
  const prefix = at('SELECT * FROM fi¦');
  const learned = rankLearnedCandidates(prefix.candidates, prefix.context, [
    { context: 'relation', key: 'module:FINANCE_ARCHIVE', count: 1000, last: Date.now() },
    { context: 'relation', key: 'class:APP.FIN_EVENTS', count: 1000, last: Date.now() },
  ]);
  assert.equal(learned[0].label, 'FINANCE_ARCHIVE');
  assert.ok(learned.findIndex(c => c.label === 'FIN_EVENTS') > 1);
  assert.equal(oracleInlineCompletion(prefix.source, prefix.cursor, {}, { ...prefix, candidates: learned }).label, 'FINANCE_ARCHIVE');
});

test('schema promotion respects scope, quoted case and literal prefix rather than fuzzy-only matches', () => {
  const scoped = at('SELECT * FROM fi¦', { currentSchema: 'FINANCE', settings: { schemaScope: 'current' } });
  assert.deepEqual(scoped.candidates.filter(c => c.schema).map(c => c.label), ['FINANCE']);
  const noMatch = at('SELECT * FROM xyz¦');
  assert.equal(noMatch.ghost, null);
  const contains = at('SELECT * FROM fin¦', { settings: { matchMode: 'contains' } });
  assert.ok(!contains.candidates.find(c => c.label === 'OTHER_FIN').preferSchema);
  const quoted = at('SELECT * FROM "Fi¦".INVOICES', { objects: [{ owner: 'Finance Team', name: 'INVOICES', type: 'TABLE' }] });
  assert.equal(quoted.ghost.insertText, '"Finance Team"');
  assert.equal(apply(quoted), 'SELECT * FROM "Finance Team".INVOICES');
  assert.equal(at('SELECT * FROM "fi¦', { objects: [{ owner: 'Finance Team', name: 'INVOICES', type: 'TABLE' }] }).ghost, null);
});

test('schema priority survives large catalogs and FK join candidates', () => {
  const crowded = Array.from({ length: 600 }, (_, i) => ({ owner: 'APP', name: 'FIN_TABLE_' + i, type: 'TABLE', columns: [] }));
  const table = { owner: 'APP', name: 'SOURCE', type: 'TABLE', columns: [], foreignKeys: [{ owner: 'APP', table: 'SOURCE', column: 'ID', name: 'FK', targetOwner: 'APP', targetTable: 'FIN_EVENTS', targetColumn: 'FIN_ID', position: 1 }] };
  const result = at('SELECT * FROM APP.SOURCE s JOIN fi¦', { objects: [...objects, ...crowded, table] });
  assert.equal(result.candidates[0].label, 'FINANCE');
  assert.ok(result.candidates.some(c => c.label === 'FIN_EVENTS · FK join'));
  assert.equal(result.ghost.label, 'FINANCE');
});

test('actual completion worker preserves preferred schema edits for lowercase input', { timeout: 5000 }, async t => {
  const url = new URL('../src/oracleCompletionWorker.js', import.meta.url).href;
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`, { eval: true });
  const adapter = { postMessage: data => worker.postMessage(data), terminate: () => worker.terminate() };
  worker.on('message', data => adapter.onmessage?.({ data }));
  worker.on('error', error => adapter.onerror?.(error));
  const client = new OracleCompletionClient(adapter);
  t.after(() => client.dispose());
  client.configure({ objects, currentSchema: 'APP' });
  const sql = 'SELECT * FROM fi';
  const result = await client.complete(sql, sql.length);
  assert.equal(result.candidates[0].label, 'FINANCE');
  assert.equal(result.candidates[0].preferSchema, true);
  assert.equal(oracleInlineCompletion(sql, sql.length, {}, result).insertText, 'finance.');
});
