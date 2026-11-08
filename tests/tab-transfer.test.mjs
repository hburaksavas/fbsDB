import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTabTransfer, collectWindowDrafts, parseTabTransfer, tabMoveBlocker, windowDraftKey } from '../src/tabTransfer.js';
import { createResultSessions } from '../src/resultSessions.js';

const documents = [
  { id: 'a', name: 'Query 1', content: 'select 1 from dual', dirty: true },
  { id: 'b', name: 'other.sql', path: 'C:/w/other.sql', content: 'select 2 from dual' },
  { id: 'definition:a:HR:PACKAGE:P', name: 'HR.P.sql', content: 'package p', readOnly: true, metadataOriginTabId: 'a' },
];

test('a moved tab takes its read-only views, session view state and fetched rows along', () => {
  const text = buildTabTransfer({
    tabIds: ['a'], documents, activeId: 'a', from: 'main',
    sessions: { a: { activeConnection: { id: 'hr' }, transactionPending: true, executing: false, sqlStage: 'Done', scriptRun: { running: false }, helper: () => 1 }, b: { activeConnection: { id: 'x' } } },
    results: { a: { queryResult: { resultId: 'r1', hasMore: true, columns: [{ name: 'D', temporalKind: 'date' }], rows: [[{ kind: 'temporal', oracleType: 'DATE', value: '2026-11-08' }]] } } },
    metadata: { a: { executedSql: 'select 1 from dual' } },
  });
  const moved = parseTabTransfer(text);
  assert.deepEqual(moved.documents.map(tab => tab.id), ['a', 'definition:a:HR:PACKAGE:P']);
  assert.deepEqual(moved.sessionIds, ['a']);
  assert.equal(moved.activeId, 'a');
  assert.deepEqual(moved.sessions.a, { activeConnection: { id: 'hr' }, transactionPending: true });
  assert.equal(moved.results.a.queryResult.resultId, 'r1', 'the open cursor keeps working in the new window');
  const cell = moved.results.a.queryResult.rows[0][0];
  assert.equal(String(cell), '2026-11-08');
  assert.ok(Object.isFrozen(cell), 'temporal cells are revived as Oracle values');
  assert.equal(moved.metadata.a.executedSql, 'select 1 from dual');
  assert.equal(moved.sessions.b, undefined);
});

test('running work and unapplied grid edits keep a tab in its window', () => {
  assert.equal(tabMoveBlocker({}), null);
  assert.match(tabMoveBlocker({ executing: true }), /running statement/);
  assert.match(tabMoveBlocker({ scriptRun: { running: true } }), /script/);
  assert.match(tabMoveBlocker({ fetchingPage: true }), /next page/);
  assert.match(tabMoveBlocker({ connecting: true }), /connection/);
  assert.match(tabMoveBlocker({}, { exporting: true }), /export/);
  assert.match(tabMoveBlocker({}, { gridDrafts: 2 }), /2 unapplied grid edits/);
  assert.equal(tabMoveBlocker({ transactionPending: true }), null, 'a pending transaction moves with its session');
});

test('an unreadable transfer is refused', () => {
  assert.throws(() => parseTabTransfer('{"version":9,"documents":[]}'), /could not be read/);
  assert.throws(() => buildTabTransfer({ tabIds: ['zzz'], documents, activeId: 'a', from: 'main' }), /Nothing to move/);
});

test('a returning tab can publish results again after its window forgot it', () => {
  const store = createResultSessions();
  store.update('a', 'resultFilter', 'x');
  store.forget('a');
  store.update('a', 'resultFilter', 'ignored');
  assert.equal(store.tabs.a, undefined);
  store.revive('a', { resultFilter: 'back' });
  assert.equal(store.tabs.a.resultFilter, 'back');
  store.update('a', 'resultFilter', 'later');
  assert.equal(store.tabs.a.resultFilter, 'later');
});

function memoryStorage(entries) {
  const map = new Map(Object.entries(entries));
  return { get length() { return map.size; }, key: index => [...map.keys()][index] ?? null, getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map };
}

test('unsaved SQL of other windows joins the main window recovery once, without duplicates', () => {
  const file = (id, content) => ({ id, name: `${id}.sql`, path: null, content, dirty: true, connectionProfileId: null });
  const storage = memoryStorage({
    [windowDraftKey('main')]: JSON.stringify({ version: 1, savedAt: 1, activeTabId: 'a', files: [file('a', 'one')] }),
    [windowDraftKey('w2')]: JSON.stringify({ version: 1, savedAt: 2, activeTabId: 'b', files: [file('b', 'two'), file('a', 'one')] }),
    'fbsdb.other': 'kept',
  });
  const recovery = collectWindowDrafts(storage);
  assert.deepEqual(recovery.files.map(item => item.id), ['a', 'b']);
  assert.equal(storage.getItem(windowDraftKey('w2')), null);
  assert.equal(storage.getItem('fbsdb.other'), 'kept');
  assert.deepEqual(collectWindowDrafts(storage).files.map(item => item.id), ['a', 'b']);
});
