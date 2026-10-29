import test from 'node:test';
import assert from 'node:assert/strict';
import { lexOracle, getOracleCompletionContext as context, getOracleCompletions as complete, getOracleVocabulary, completionMatch } from '../src/oracleCompletion.js';
import { loadCompletionSettings, normalizeCompletionSettings } from '../src/editorCompletionSettings.js';
import { OracleCompletionClient } from '../src/oracleCompletionClient.js';
import { Worker } from 'node:worker_threads';

const objects = [
  { name: 'INVOICES', owner: 'FINANCE', type: 'TABLE', columns: [{ name: 'INVOICE_ID', type: 'NUMBER', indexed: true }, { name: 'CUSTOMER_ID', type: 'NUMBER' }, { name: 'MixedName', type: 'VARCHAR2' }] },
  { name: 'CUSTOMERS', owner: 'FINANCE', type: 'VIEW', columns: [{ name: 'CUSTOMER_ID', type: 'NUMBER' }, { name: 'NAME', type: 'VARCHAR2' }] },
  { name: 'INVOICES', owner: 'ARCHIVE', type: 'TABLE', columns: [{ name: 'ARCHIVE_ID', type: 'NUMBER' }] },
];
const at = (text, options = {}) => {
  const cursor = text.indexOf('|'); return complete(text.replace('|', ''), cursor < 0 ? text.length : cursor, { objects, currentSchema: 'FINANCE', ...options });
};

test('versioned reference catalogs include SQL, PL/SQL and functions offline', () => {
  for (const version of [19, 21, 23, 26]) {
    const words = getOracleVocabulary(version);
    for (const name of ['SELECT', 'MERGE', 'GROUP BY', 'FORALL', 'ELSIF', 'TO_CHAR', 'JSON_VALUE', 'LISTAGG', 'ROW_NUMBER']) assert.ok(words.some(word => word.name === name), `${version}: ${name}`);
    assert.ok(words.filter(word => word.kind === 'function').length > 150);
  }
  assert.ok(getOracleVocabulary(19, ['CUSTOM_ORACLE_WORD']).some(word => word.name === 'CUSTOM_ORACLE_WORD' && word.live));
});

test('FROM and JOIN with punctuation, indentation and schema qualifiers', () => {
  for (const source of ['SELECT*FROM|', 'SELECT * FROM\n    |', 'SELECT * FROM /* x */\n fin|', 'SELECT * FROM t INNER JOIN\n |']) {
    assert.equal(at(source).context.relation, true, source);
  }
  assert.ok(at('SELECT*FROM|').candidates.some(item => item.insertText === ' INVOICES'));
  const qualified = at('SELECT * FROM\n finance.in|');
  assert.ok(qualified.candidates.some(item => item.insertText === 'INVOICES'));
  assert.ok(!qualified.candidates.some(item => item.object?.owner === 'ARCHIVE'));
  assert.equal(at('SELECT * FROM finance.\n in|').context.qualifier, 'finance');
});

test('strings, comments and binds do not receive SQL suggestions', () => {
  for (const source of ["SELECT 'fro|m' FROM dual", "SELECT q'[fro|m]' FROM dual", "SELECT nq'<fro|m>' FROM dual", 'SELECT /* fro|m */ 1 FROM dual', 'SELECT -- fro|m\n 1 FROM dual', 'SELECT :fro| FROM dual', "SELECT 'not closed|"]) {
    assert.equal(at(source).candidates.length, 0, source);
  }
  assert.equal(at('SELECT -- fro|\n 1 FROM dual').candidates.length, 0);
  assert.ok(at("SELECT 'it''s' FROM | ").context.relation);
});

test('quoted identifier completion preserves exact Oracle case and range', () => {
  const result = at('SELECT i."Mi|" FROM finance.invoices i');
  const item = result.candidates.find(item => item.label === 'MixedName');
  assert.equal(item.insertText, '"MixedName"');
  assert.equal(result.context.source.slice(item.start, item.end), '"Mi"');
  assert.equal(at('SELECT i."mi|" FROM finance.invoices i').candidates.length, 0);
  assert.ok(at('SELECT * FROM "FINANCE"."INV|"').candidates.some(item => item.label === 'INVOICES'));
});

test('aliases after caret and schema collisions resolve within query scope', () => {
  assert.ok(at('SELECT i.in| FROM finance.invoices i').candidates.some(item => item.label === 'INVOICE_ID'));
  const outer = at('SELECT c.na| FROM finance.customers c WHERE EXISTS (SELECT 1 FROM finance.invoices i)');
  assert.ok(outer.candidates.some(item => item.label === 'NAME'));
  assert.ok(!outer.candidates.some(item => item.label === 'INVOICE_ID'));
  const inner = at('SELECT 1 FROM finance.customers c WHERE EXISTS (SELECT c.na| FROM finance.invoices i)');
  assert.ok(inner.candidates.some(item => item.label === 'NAME'));
  const archive = at('SELECT i.ar| FROM archive.invoices i');
  assert.ok(archive.candidates.some(item => item.label === 'ARCHIVE_ID'));
  const duplicate = at('SELECT * FROM inv|');
  assert.ok(duplicate.candidates.some(item => item.insertText === 'ARCHIVE.INVOICES'));
});

test('CTEs are proposed with projected columns and not leaked from inner siblings', () => {
  const result = at('WITH chosen (id, label) AS (SELECT invoice_id, "MixedName" FROM finance.invoices) SELECT ch.la| FROM chosen ch');
  assert.ok(result.candidates.some(item => item.label === 'LABEL'));
  assert.ok(at('WITH chosen AS (SELECT invoice_id AS item_id FROM finance.invoices) SELECT x.it| FROM chosen x').candidates.some(item => item.label === 'ITEM_ID'));
  assert.ok(at('WITH chosen AS (SELECT 1 FROM dual) SELECT * FROM ch|').candidates.some(item => item.label === 'chosen'));
  const sibling = at('SELECT * FROM finance.customers c WHERE EXISTS (WITH hidden AS (SELECT 1 FROM dual) SELECT 1 FROM hidden) AND EXISTS (SELECT * FROM hi|)');
  assert.ok(!sibling.candidates.some(item => item.label === 'hidden'));
});

test('derived queries expose explicit projections without guessing expression column names', () => {
  assert.ok(at('SELECT x.it| FROM (SELECT invoice_id AS item_id FROM finance.invoices) x').candidates.some(item => item.label === 'ITEM_ID'));
  assert.ok(!at('WITH x AS (SELECT a + b FROM dual) SELECT x.b| FROM x').candidates.some(item => item.kind === 'field'));
  const rows = at('SELECT cu| FROM finance.invoices i JOIN finance.customers c ON c.customer_id = i.customer_id').candidates.filter(item => item.label === 'CUSTOMER_ID');
  assert.ok(rows.some(item => item.insertText === 'I.CUSTOMER_ID'));
  assert.ok(rows.some(item => item.insertText === 'C.CUSTOMER_ID'));
});

test('PL/SQL declaration scope excludes symbols in completed nested blocks', () => {
  const source = 'DECLARE outer_value NUMBER; BEGIN DECLARE inner_value VARCHAR2(10); BEGIN NULL; END; ou| END;';
  const result = at(source);
  assert.ok(result.candidates.some(item => item.label === 'outer_value'));
  assert.ok(!at(source.replace('ou|', 'in|')).candidates.some(item => item.label === 'inner_value'));
  assert.ok(at('DECLARE local_name NUMBER; BEGIN lo| END;').candidates.some(item => item.label === 'local_name'));
  assert.ok(at('DECLARE local_name NUMBER; BEGIN local_name := CASE WHEN 1=1 THEN 1 ELSE 2 END; lo| END;').candidates.some(item => item.label === 'local_name'));
});

test('settings, case and snippets apply to the same candidate source', () => {
  assert.equal(at('select to_ch|', { settings: { keywordCase: 'auto' } }).candidates.find(item => item.label === 'TO_CHAR').insertText, 'to_char($0)');
  assert.equal(at('SELECT TO_CH|', { settings: { functionParentheses: false } }).candidates.find(item => item.label === 'TO_CHAR').insertText, 'TO_CHAR');
  assert.equal(at('SELECT TO_CH|(x)').candidates.find(item => item.label === 'TO_CHAR').insertText, 'TO_CHAR');
  assert.equal(at('SELECT sysd|').candidates.find(item => item.kind === 'function' && item.label === 'SYSDATE').insertText, 'SYSDATE');
  assert.equal(at('Se|', { settings: { keywordCase: 'preserve' } }).candidates.find(item => item.label === 'SELECT').insertText, 'Select');
  assert.equal(at('SELECT | FROM invoices', { settings: { snippets: false } }).candidates.some(item => item.kind === 'snippet'), false);
  assert.equal(completionMatch('CUSTOMER_ID', 'ci'), 1);
  assert.equal(completionMatch('invoiceDate', 'id'), 1);
  assert.equal(completionMatch('CUSTOMER_ID', 'tomer'), -1);
  assert.equal(completionMatch('CUSTOMER_ID', 'tomer', 'contains'), 3);
  const storage = { getItem: key => key === 'fbsdb.autoCompletion' ? 'false' : null };
  assert.equal(loadCompletionSettings(storage).popup, false);
  assert.equal(loadCompletionSettings(storage).inline, false);
  assert.equal(normalizeCompletionSettings({ popup: false, inline: true, delay: -10 }).inline, true);
  assert.equal(normalizeCompletionSettings({ delay: -10 }).delay, 0);
  assert.equal(at('SELECT lo|', { recent: ['function:LOWER'] }).candidates.find(item => item.kind === 'function').label, 'LOWER');
});

test('completion client cancels obsolete tab/configuration snapshots and token requests', async () => {
  const sent = [], worker = { postMessage: message => sent.push(message), terminate() {} };
  const client = new OracleCompletionClient(worker);
  client.configure({ currentSchema: 'FINANCE' });
  const old = client.complete('SELECT', 6);
  client.configure({ currentSchema: 'ARCHIVE' });
  assert.deepEqual((await old).candidates, []);
  let cancel;
  const pending = client.complete('SELECT', 6, { onCancellationRequested: callback => { cancel = callback; return { dispose() {} }; } });
  cancel(); assert.deepEqual((await pending).candidates, []);
  const current = client.complete('SELECT', 6), request = sent.at(-1);
  worker.onmessage({ data: { id: request.id, revision: request.revision, result: { candidates: [{ label: 'SELECT' }], context: {} } } });
  assert.equal((await current).candidates[0].label, 'SELECT');
  client.dispose();
});

test('worker computes Oracle candidates outside the editor thread', { timeout: 5000 }, async t => {
  const url = new URL('../src/oracleCompletionWorker.js', import.meta.url).href;
  const worker = new Worker(`const {parentPort} = require('node:worker_threads'); globalThis.self = { postMessage: data => parentPort.postMessage(data) }; import(${JSON.stringify(url)}).then(() => parentPort.on('message', data => self.onmessage({data})));`, { eval: true });
  const adapter = { postMessage: message => worker.postMessage(message), terminate: () => worker.terminate() };
  worker.on('message', data => adapter.onmessage?.({ data }));
  worker.on('error', error => adapter.onerror?.(error));
  const client = new OracleCompletionClient(adapter);
  t.after(() => client.dispose());
  client.configure({ objects, currentSchema: 'FINANCE' });
  const sql = 'SELECT i.inv FROM finance.invoices i';
  const result = await client.complete(sql, sql.indexOf('inv') + 3);
  assert.ok(result.candidates.some(item => item.label === 'INVOICE_ID'));
});

test('unchanged metadata is not cloned for every keypress and is replayed after a tab change', () => {
  const messages = [], worker = { postMessage: message => messages.push(message), terminate() {} };
  const client = new OracleCompletionClient(worker);
  client.configure({ currentSchema: 'APP' });
  client.metadata([], [], 'tab-a:1'); client.metadata([], [], 'tab-a:1');
  assert.equal(messages.filter(message => message.type === 'metadata').length, 1);
  client.configure({ currentSchema: 'OTHER' }); client.metadata([], [], 'tab-a:1');
  assert.equal(messages.filter(message => message.type === 'metadata').length, 2);
  client.dispose();
});

test('tokens retain source offsets through escaped strings and quoted names', () => {
  const text = `SELECT q'[a;b]', 'it''s', "a""b" FROM dual`;
  for (const token of lexOracle(text)) assert.ok(token.end > token.start);
  assert.equal(lexOracle(text).find(token => token.quoted).value, 'a"b');
});
