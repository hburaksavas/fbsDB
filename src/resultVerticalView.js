// Row bookkeeping shared by the result grid and its vertical (one row at a time) view.

// Position of the row with this source index among the loaded rows; the first row when it is gone.
export function verticalOffset(rows, sourceIndex) {
  if (sourceIndex == null || !rows?.length) return 0;
  const at = rows.findIndex(item => item.index === sourceIndex);
  return at < 0 ? 0 : at;
}

// Grid page that holds the row at this position.
export function verticalPage(offset, pageSize) {
  const size = Number(pageSize);
  return size > 0 && offset > 0 ? Math.floor(offset / size) : 0;
}

// A row's values keyed by source column, as the foreign key lookups expect them.
export function rowSourceValues(columns, row) {
  return Object.fromEntries(columns.map((column, index) => [column.sourceColumn || column.name, row[index]]));
}
