import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultDisplay, displayedColumnIndices, optionsForResultView, projectDisplayExport, updateResultViewOptions } from '../src/resultPresentationData.js';
import { csvText } from '../src/resultWorkbench.js';

const columns = [{ name: 'DEPT', type: 'VARCHAR2' }, { name: 'CATEGORY', type: 'VARCHAR2' }, { name: 'AMOUNT', type: 'NUMBER' }];
const rows = [['A', 'X', '10'], ['A', 'Y', '2'], ['B', 'X', '4'], ['B', 'Y', '20']];

test('pivot filtering and sorting use pivot columns without changing source analysis', () => {
  const sourceFilter = [{ column: 2, op: 'gt', kind: 'number', value: '15' }];
  const options = { pivot: true, pivotRows: [0], pivotColumn: 1, pivotValue: 2, filters: sourceFilter, pivotView: { filters: [{ column: 2, op: 'gt', kind: 'number', value: '5' }], sortColumn: 1, sortDirection: 'desc' } };
  const display = buildResultDisplay(rows, columns, options);
  assert.deepEqual(display.columns.map(column => column.name), ['DEPT', 'X', 'Y']);
  assert.deepEqual(display.rows.map(item => item.row), [['B', '4', '20']]);
  assert.deepEqual(options.filters, sourceFilter);
  const sorted = buildResultDisplay(rows, columns, { ...options, pivotView: { sortColumn: 1, sortDirection: 'desc' } });
  assert.deepEqual(sorted.rows.map(item => item.row[0]), ['A', 'B']);
  const updated = updateResultViewOptions(options, { ...optionsForResultView(options), filters: [{ column: 1, op: 'equals', value: '4' }] }, 'pivot');
  assert.deepEqual(updated.filters, sourceFilter);
  assert.equal(updated.pivotView.filters[0].column, 1);
  assert.deepEqual(buildResultDisplay(rows, columns, { ...options, pivot: false }).rows.map(item => item.row), [['B', 'Y', '20']]);
  assert.deepEqual(buildResultDisplay(rows, columns, { ...options, pivotView: { sorts: [{ column: 2, direction: 'desc' }] } }).rows.map(item => item.row[0]), ['B', 'A']);
});

test('grouped summary filters and sorts aggregate columns independently', () => {
  const options = { summary: true, summaryGroups: [0], summaryValue: 2, sorts: [{ column: 1, direction: 'asc' }], summaryView: { filters: [{ column: 2, op: 'gt', kind: 'number', value: '15' }], sortColumn: 2, sortDirection: 'desc' } };
  const filtered = buildResultDisplay(rows, columns, options);
  assert.deepEqual(filtered.columns.map(column => column.name), ['DEPT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
  assert.deepEqual(filtered.rows.map(item => item.row[0]), ['B']);
  const sorted = buildResultDisplay(rows, columns, { ...options, summaryView: { sortColumn: 2, sortDirection: 'desc' } });
  assert.deepEqual(sorted.rows.map(item => item.row[0]), ['B', 'A']);
});

test('transformed export uses filtered row order and visible column order', () => {
  const display = buildResultDisplay(rows, columns, { pivot: true, pivotRows: [0], pivotColumn: 1, pivotValue: 2, pivotView: { sortColumn: 2, sortDirection: 'desc' } });
  const indices = displayedColumnIndices(display.columns, { order: [2, 0, 1], hidden: [1], pinned: 0 }, { pinnedRight: [2] });
  assert.deepEqual(indices, [0, 2]);
  const exported = projectDisplayExport({ columns: display.columns, rows: display.rows.map(item => item.row), visibleColumns: indices });
  assert.equal(csvText(exported.rows, exported.columns), 'DEPT,Y\r\nB,20\r\nA,2');
  assert.deepEqual(projectDisplayExport({ columns: display.columns, rows: display.rows.map(item => item.row) }, [2, 0]).columns.map(column => column.name), ['Y', 'DEPT']);
});
