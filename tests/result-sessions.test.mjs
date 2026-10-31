import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultSessions } from '../src/resultSessions.js';

const result = (id, value = 1) => ({ resultId: id, columns: [{ name: 'ID', type: 'NUMBER' }], rows: [[value]], hasMore: true, returnedRows: 1 });

test('new query results preserve pinned sets and isolate each tab and script step', () => {
  const store = createResultSessions();
  store.publish('a', result('a1'), { transpose: false }); store.pin('a');
  store.publish('b', result('b1'), {});
  store.publish('a', result('a2'), { transpose: true }, { running: true, requestId: 'script', index: 1 });
  assert.equal(store.tabs.a.resultSets.length, 2); assert.equal(store.tabs.a.resultSets[0].result.resultId, 'a1');
  assert.equal(store.tabs.a.resultSets[1].label, 'Script 2');
  assert.equal(store.tabs.a.selectedResultKey, null); assert.equal(store.tabs.b.queryResult.resultId, 'b1');
  assert.equal(store.tabs.a.queryView.options.transpose, true);
});

test('duplicate and out-of-order pages cannot append rows twice or affect another cursor', () => {
  const store = createResultSessions(); store.publish('a', result('a1'), {}); store.publish('b', result('b1'), {});
  const page = { resultId: 'a1', rows: [[2]], offset: 1, hasMore: false, elapsedMs: 10 };
  store.appendPage('a', { ...page, offset: 3 }); store.appendPage('a', page); store.appendPage('a', page);
  assert.deepEqual(store.tabs.a.queryResult.rows, [[1], [2]]); assert.equal(store.tabs.a.queryResult.fetchMetrics.length, 1);
  assert.deepEqual(store.tabs.b.queryResult.rows, [[1]]);
});

test('cursor invalidation and row release update all references while preserving other results', () => {
  const store = createResultSessions(); store.publish('a', result('a1'), {}); store.pin('a');
  const saved = store.tabs.a.queryResult; store.publish('a', result('a2'), {});
  store.invalidateCursor('a', 'a1'); assert.equal(store.tabs.a.resultSets[0].result.cursorUnavailable, true);
  assert.equal(store.tabs.a.queryResult.hasMore, true);
  store.release('a', saved); assert.deepEqual(store.tabs.a.resultSets[0].result.rows, []);
  assert.deepEqual(store.tabs.a.queryResult.rows, [[1]]);
});

test('render timing is attributed once and closed tabs cannot be recreated by late callbacks', () => {
  const store = createResultSessions();
  store.publish('a', { ...result('a1'), renderRequestId: 'r1', clientTiming: { totalMs: null } }, {});
  store.measure({ requestId: 'r1', renderMs: 10, totalMs: 20 });
  store.measure({ requestId: 'r1', renderMs: 30, totalMs: 40 });
  assert.equal(store.tabs.a.queryResult.clientTiming.totalMs, 20);
  store.forget('a'); store.publish('a', result('late'), {}); store.update('a', 'pageError', 'late');
  store.set(current => ({ ...current, a: { queryResult: result('late') } }));
  assert.equal(store.tabs.a, undefined);
});
