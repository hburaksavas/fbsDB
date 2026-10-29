export function isResultCellSelected(selection, r, c) {
  let selected = false;
  for (const range of selection?.ranges || []) {
    const { anchor: a, focus: f, mode } = range;
    if ((mode === 'column' || r >= Math.min(a.r, f.r) && r <= Math.max(a.r, f.r)) && (mode === 'row' || c >= Math.min(a.c, f.c) && c <= Math.max(a.c, f.c))) selected = range.selected;
  }
  return selected;
}
export function selectResultRange(previous, r, c, { extend = false, additive = false, mode = 'cell', rowCount = 0, columnCount = 0 } = {}) {
  const anchor = extend && previous?.mode === mode ? previous.anchor : { r, c };
  let selected = true;
  if (additive && !extend) {
    selected = mode === 'row' ? !Array.from({ length: columnCount }, (_, column) => isResultCellSelected(previous, r, column)).every(Boolean)
      : mode === 'column' ? !Array.from({ length: rowCount }, (_, row) => isResultCellSelected(previous, row, c)).every(Boolean)
      : !isResultCellSelected(previous, r, c);
  }
  const base = extend && previous?.mode === mode ? previous.base || [] : additive ? previous?.ranges || [] : [];
  return { anchor, focus: { r, c }, mode, base, ranges: [...base, { anchor, focus: { r, c }, mode, selected }] };
}
export function resultSelectionTsv(selection, rows, visible) {
  const selectedRows = [], selectedColumns = new Set();
  rows.forEach((_, r) => {
    const cols = visible.map((_, c) => c).filter(c => isResultCellSelected(selection, r, c));
    if (cols.length) { selectedRows.push(r); cols.forEach(c => selectedColumns.add(c)); }
  });
  const cols = [...selectedColumns].sort((a, b) => a - b);
  return selectedRows.map(r => cols.map(c => {
    if (!isResultCellSelected(selection, r, c)) return '';
    const value = rows[r].row[visible[c]], text = value == null ? 'NULL' : value?.kind==='binary'?value.base64:String(value);
    return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join('\t')).join('\r\n');
}
