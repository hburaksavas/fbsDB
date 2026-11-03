// Tab order while entering data: editable cells only, row by row. Past the last editable cell the grid either stays put or, when asked,
// signals that a new row should start; going back before the first one stays at the start.
export function nextEditableCell({ rowCount, visible, isEditable }, from, direction) {
  const columns = visible.filter(col => isEditable(col));
  if (!columns.length || rowCount === 0) return { none: true };
  const at = visible[from.c] != null && columns.includes(visible[from.c]) ? columns.indexOf(visible[from.c]) : -1;
  let row = from.r, index;
  if (direction >= 0) {
    index = at >= 0 ? at + 1 : columns.findIndex(col => visible.indexOf(col) > from.c);
    if (index < 0 || index >= columns.length) { index = 0; row += 1; }
    if (row >= rowCount) return { end: true };
  } else {
    index = at >= 0 ? at - 1 : (() => { const before = columns.filter(col => visible.indexOf(col) < from.c); return before.length ? columns.indexOf(before.at(-1)) : -1; })();
    if (index < 0) { index = columns.length - 1; row -= 1; }
    if (row < 0) return { start: true };
  }
  return { r: row, c: visible.indexOf(columns[index]) };
}

// Fields of a new row in entry order: required inputs first (NOT NULL without default or identity), then the rest in column order.
export function newRowFieldOrder(columns, editable) {
  const fields = columns.map((column, index) => ({ column, index })).filter(({ index }) => editable[index]?.editable);
  const required = ({ column }) => column.nullable === false && !column.hasDefault && !column.identity;
  return [...fields.filter(required), ...fields.filter(field => !required(field))].map(({ index }) => index);
}
