import { formatResultValue } from './resultFeatures.js';
import { pivotResult } from './resultWorkbench.js';
import { groupedResultSummary } from './resultAdvanced.js';
import { applyResultFeatures } from './resultFeatures.js';
import { getVisibleResultRows } from './resultRows.js';

const SCOPED_FIELDS = ['filters', 'filterGroups', 'filterLogic', 'sorts', 'rules', 'marks', 'markedOnly', 'duplicatesOnly', 'duplicateColumns', 'highlightedOnly', 'frozenRows', 'pinnedRight', 'columnFormats'];
const EMPTY_SCOPED_FIELDS = { filters: [], filterGroups: [], filterLogic: 'and', sorts: [], rules: [], marks: [], markedOnly: false, duplicatesOnly: false, duplicateColumns: [], highlightedOnly: false, frozenRows: [], pinnedRight: [], columnFormats: {} };

export function resultViewMode(options = {}) { return options.pivot ? 'pivot' : options.summary ? 'summary' : 'source'; }

export function optionsForResultView(options = {}, mode = resultViewMode(options)) {
  if (mode === 'source') return options;
  return { ...options, ...EMPTY_SCOPED_FIELDS, ...(options[`${mode}View`] || {}) };
}

export function updateResultViewOptions(current, next, mode) {
  if (mode === 'source') return next;
  const scoped = Object.fromEntries(SCOPED_FIELDS.map(key => [key, next[key]]));
  const updated = { ...current, ...next, [`${mode}View`]: { ...(current[`${mode}View`] || {}), ...scoped } };
  for (const key of SCOPED_FIELDS) updated[key] = current[key];
  return updated;
}

export function buildResultDisplay(rows, columns, options = {}, filter = '', sortColumn = -1, sortDirection = 'asc', rowOrder = []) {
  const mode = resultViewMode(options), viewOptions = optionsForResultView(options, mode);
  const indexed = rows.map((row, index) => ({ row, index }));
  const transformed = mode === 'pivot' ? pivotResult(indexed, columns, options) : mode === 'summary' ? groupedResultSummary(indexed, columns, options.summaryGroups || [], Number(options.summaryValue || 0)) : { columns, rows: indexed };
  const scopedSort = mode === 'source' ? { sortColumn, sortDirection } : options[`${mode}View`] || {};
  const visible = getVisibleResultRows(transformed.rows.map(item => item.row), transformed.columns, filter, scopedSort.sortColumn ?? -1, scopedSort.sortDirection || 'asc', mode === 'source' ? rowOrder : [], viewOptions);
  return { mode, columns: transformed.columns, rawRows: transformed.rows.map(item => item.row), rows: applyResultFeatures(visible, transformed.columns, viewOptions), options: viewOptions, sortColumn: scopedSort.sortColumn ?? -1, sortDirection: scopedSort.sortDirection || 'asc' };
}

export function displayedColumnIndices(columns, layout = {}, options = {}) {
  const valid = index => Number.isInteger(index) && index >= 0 && index < columns.length;
  const order = [...new Set([...(layout.order || []).filter(valid), ...columns.map((_, index) => index)])];
  const visible = order.filter(index => !(layout.hidden || []).includes(index));
  if (valid(layout.pinned) && visible.includes(layout.pinned)) visible.splice(0, 0, ...visible.splice(visible.indexOf(layout.pinned), 1));
  for (const index of options.pinnedRight || []) if (visible.includes(index) && index !== layout.pinned) visible.splice(0, visible.length, ...visible.filter(value => value !== index), index);
  return visible;
}

export function projectDisplayExport(display, indices = null, options = {}) {
  const projection = indices ?? display.visibleColumns ?? display.columns.map((_, index) => index);
  if (!projection.length || projection.some(index => !Number.isInteger(index) || index < 0 || index >= display.columns.length)) throw new Error('Choose at least one visible result column to export.');
  const formatted=options.exportSettings?.formatted===true;
  return { columns: projection.map(index => formatted?{...display.columns[index],sourceType:display.columns[index].type,type:'VARCHAR2'}:display.columns[index]), rows: display.rows.map(row => projection.map(index => formatted?formatResultValue(row[index],display.columns[index].type,{...options,...options.columnFormats?.[index]}):row[index])) };
}
