import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeHeader, parseTsv, planInsertPaste } from '../src/pasteGrid.js';
import { emptyDrafts, insertRows, undo } from '../src/gridDrafts.js';

const columns = [
  { name: 'ID', nullable: false, identity: true },
  { name: 'NAME', nullable: false },
  { name: 'NOTE', nullable: true },
  { name: 'CREATED_AT', nullable: false, hasDefault: true },
  { name: 'TOTAL', nullable: true },
];
// ID is generated and TOTAL is computed: neither can be filled in a new row.
const insertable = [{ editable: false, reason: 'Filled by the database (identity)' }, { editable: true }, { editable: true }, { editable: true }, { editable: false, reason: 'Computed column' }];
const copied = parseTsv('ID\tName\tTotal\tNote\n7\tAlpha\t10\tNULL\n8\tBeta\t20\t\n9\t\t30\t\n');

test('rows copied with headers map to columns of the same name; generated and computed columns are not filled', () => {
  const plan = planInsertPaste({ pasted: copied, header: true, columns, insertable });
  assert.deepEqual(plan.mapping.map(item => `${item.label}→${item.col ?? '-'}${item.reason ? ` (${item.reason})` : ''}`), [
    'ID→- (Filled by the database (identity))', 'Name→1', 'Total→- (Computed column)', 'Note→2',
  ]);
  assert.deepEqual(plan.rows, [{ 1: { value: 'Alpha' }, 2: { isNull: true } }, { 1: { value: 'Beta' } }]);
  assert.deepEqual(plan.skipped, [{ name: 'pasted row 3', reason: 'All mapped cells are empty.' }]);
  assert.deepEqual(plan.missing, [], 'NAME is filled in every added row; CREATED_AT has a default.');
  assert.deepEqual(plan.targets.map(target => target.name), ['NAME', 'NOTE', 'CREATED_AT']);
});

test('the mapping can be changed or skipped, and one column is never filled twice', () => {
  const plan = planInsertPaste({ pasted: copied, header: true, columns, insertable, mapping: { 1: 2, 3: null } });
  assert.deepEqual(plan.mapping.map(item => `${item.label}→${item.col ?? '-'}`), ['ID→-', 'Name→2', 'Total→-', 'Note→-']);
  assert.deepEqual(plan.missing, [{ name: 'NAME', rows: 2 }]);
  const twice = planInsertPaste({ pasted: copied, header: true, columns, insertable, mapping: { 3: 1 } });
  assert.equal(twice.mapping[3].reason, 'NAME is already filled from another pasted column');
});

test('without a header pasted columns fill the insertable columns in order', () => {
  const plan = planInsertPaste({ pasted: parseTsv('a\tb\nc\td\n'), columns, insertable });
  assert.deepEqual(plan.mapping.map(item => item.col), [1, 2]);
  assert.deepEqual(plan.rows, [{ 1: { value: 'a' }, 2: { value: 'b' } }, { 1: { value: 'c' }, 2: { value: 'd' } }]);
});

test('pastes that fill nothing explain why', () => {
  assert.match(planInsertPaste({ pasted: parseTsv('X\tY\n1\t2\n'), header: true, columns, insertable }).error, /No pasted column fills/);
  assert.match(planInsertPaste({ pasted: parseTsv('NAME\n'), header: true, columns, insertable }).error, /no data rows/);
  assert.match(planInsertPaste({ pasted: copied, columns, insertable: [] }).error, /No column of this result/);
});

test('a first row of column names is recognised as a header', () => {
  assert.equal(looksLikeHeader(copied, columns), true);
  assert.equal(looksLikeHeader(parseTsv('7\tAlpha\n'), columns), false);
  assert.equal(looksLikeHeader(parseTsv('"Name"\tsomething\n'), columns), true);
});

test('pasted rows become new-row drafts taken back by one Undo', () => {
  const drafts = insertRows(emptyDrafts(), [{ 1: { value: 'a' } }, { 1: { value: 'b' } }]);
  assert.deepEqual(drafts.inserted.map(row => [row.id, row.values[1].value]), [[1, 'a'], [2, 'b']]);
  assert.equal(drafts.nextInsertId, 3);
  assert.deepEqual(undo(drafts).inserted, []);
  assert.equal(insertRows(drafts, []), drafts);
});
