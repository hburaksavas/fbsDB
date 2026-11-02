import test from 'node:test';
import assert from 'node:assert/strict';
import { columnCursorDraft } from '../src/columnMulticursor.js';

test('copied result headers become independent identifier ranges', () => {
  const draft = columnCursorDraft('ID\tFull Name\t"Odd"', '\r\n');
  assert.equal(draft.text, 'ID\r\n"Full Name"\r\n"""Odd"""');
  assert.deepEqual(draft.spans.map(span => draft.text.slice(span.start, span.end)), ['ID', '"Full Name"', '"""Odd"""']);
});

test('vertical names work and rectangular result data is rejected', () => {
  assert.equal(columnCursorDraft('ID\nNAME').count, 2);
  assert.equal(columnCursorDraft('ID\t Name ').text, 'ID\n" Name "');
  assert.match(columnCursorDraft('ID\tNAME\n1\tAnn').error, /one header row/);
  assert.match(columnCursorDraft('ID').error, /2–100/);
});
