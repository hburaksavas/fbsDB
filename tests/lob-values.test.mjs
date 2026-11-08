import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobBuffer, lobCopyText, lobDisplayText, replaceLobInRows, bytesBase64, base64Bytes } from '../src/lobValues.js';
import { copyResultData, formatResultValue, isExpandableResultValue } from '../src/resultFeatures.js';
import { resultSelectionTsv, selectResultRange } from '../src/resultSelection.js';
import { createResultSessions } from '../src/resultSessions.js';

const clob = { kind: 'lob', lobType: 'CLOB', lobId: 'c1', length: 10, preview: 'abcd' };
const bytes = Uint8Array.from({ length: 7 }, (_, i) => i * 37);
const blob = { kind: 'lob', lobType: 'BLOB', lobId: 'b1', length: 7, preview: bytesBase64(bytes.subarray(0, 2)) };

test('a CLOB buffer continues after the preview and yields the whole text only when complete', () => {
  const buffer = createLobBuffer(clob);
  assert.deepEqual(buffer.next(4), { offset: 4, count: 4 });
  buffer.add({ offset: 4, length: 10, count: 4, text: 'efgh' });
  assert.equal(buffer.fullValue(), null);
  assert.deepEqual(buffer.next(), { offset: 8, count: 2 });
  buffer.add({ offset: 8, length: 10, count: 2, text: 'ij' });
  assert.equal(buffer.complete, true);
  assert.equal(buffer.fullValue(), 'abcdefghij');
});

test('a BLOB buffer joins chunks whose base64 padding does not line up', () => {
  const buffer = createLobBuffer(blob);
  buffer.add({ offset: 2, length: 7, count: 4, base64: bytesBase64(bytes.subarray(2, 6)) });
  buffer.add({ offset: 6, length: 7, count: 1, base64: bytesBase64(bytes.subarray(6)) });
  const full = buffer.fullValue();
  assert.equal(full.kind, 'binary');
  assert.equal(full.byteLength, 7);
  assert.deepEqual([...base64Bytes(full.base64)], [...bytes]);
});

test('chunks out of position, of a changed size or empty before the end are refused', () => {
  assert.throws(() => createLobBuffer(clob).add({ offset: 5, length: 10, count: 1, text: 'x' }), /changed position/);
  assert.throws(() => createLobBuffer(clob).add({ offset: 4, length: 11, count: 1, text: 'x' }), /no longer matches/);
  assert.throws(() => createLobBuffer(clob).add({ offset: 4, length: 10, count: 0, text: '' }), /no more data/);
});

test('previews are shown, copied and expanded as incomplete values', () => {
  assert.match(formatResultValue(clob, 'Clob'), /^abcd… \(CLOB, 10 characters\)$/);
  assert.equal(formatResultValue(blob, 'Blob'), 'BLOB · 7 bytes · not loaded');
  assert.equal(lobDisplayText(blob), 'BLOB · 7 bytes · not loaded');
  assert.equal(lobCopyText(clob), 'abcd[CLOB: first 4 of 10 characters; open the cell and load the full value to copy it]');
  assert.match(lobCopyText(blob), /^\[BLOB: first 2 of 7 bytes;/);
  assert.match(copyResultData([[clob]], [{ name: 'DOC' }], 'tsv'), /first 4 of 10 characters/);
  assert.match(resultSelectionTsv(selectResultRange(null, 0, 0), [{ row: [clob] }], [0]), /first 4 of 10/);
  assert.equal(isExpandableResultValue({ type: 'VARCHAR2' }, clob), true);
});

test('loading a value whole replaces its preview in the current and pinned results only', () => {
  const rows = [[1, clob], [2, { ...clob, lobId: 'c2' }]];
  assert.equal(replaceLobInRows(rows, 'none', 'x'), rows);
  const store = createResultSessions();
  store.set({ tab: { queryResult: { resultId: 'r', rows }, resultSets: [{ key: 'p', result: { resultId: 'old', rows } }, { key: 'q', result: { rows: [[3]] } }] }, other: { queryResult: { rows: [[4]] } } });
  const before = store.tabs;
  store.replaceLob('c1', 'abcdefghij');
  assert.deepEqual(store.tabs.tab.queryResult.rows, [[1, 'abcdefghij'], [2, { ...clob, lobId: 'c2' }]]);
  assert.equal(store.tabs.tab.resultSets[0].result.rows[0][1], 'abcdefghij');
  assert.equal(store.tabs.tab.resultSets[1], before.tab.resultSets[1]);
  assert.equal(store.tabs.other, before.other);
  store.replaceLob('c1', 'again');
  assert.equal(store.tabs.tab.queryResult.rows[0][1], 'abcdefghij');
});
