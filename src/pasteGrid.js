// Parses tab-separated clipboard text (as copied from a spreadsheet) into rows of cells; quoted cells may contain tabs and line breaks.
export function parseTsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const source = String(text ?? '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Plans a paste into the grid. `targets` lists the visible columns from the active one to the right:
// [{ col, name, editable, reason, text(row index) }]. `rowsAt(position)` gives the grid row at a position below the active row.
// Mode "position" fills cell by cell; mode "key" matches the first pasted column against the single key column and fills the rest.
export function planPaste({ pasted, header = false, mode = 'position', startRow, targets, rowAt, keyCol = null, findByKey }) {
  const data = header ? pasted.slice(1) : pasted;
  const changes = [], skipped = [];
  if (!data.length) return { changes, skipped, error: 'The clipboard has no data rows.' };
  if (mode === 'key' && keyCol == null) return { changes, skipped, error: 'Matching by key needs a single key column.' };
  const width = Math.max(...data.map(row => row.length));
  const usable = mode === 'key' ? width - 1 : width;
  if (usable > targets.length) skipped.push({ name: '(extra columns)', reason: `${usable - targets.length} pasted column${usable - targets.length === 1 ? '' : 's'} fall${usable - targets.length === 1 ? 's' : ''} outside the grid and are ignored.` });
  data.forEach((values, at) => {
    let item;
    if (mode === 'key') {
      item = findByKey(values[0]);
      if (!item) { skipped.push({ name: `key ${values[0]}`, reason: 'No loaded row has this key.' }); return; }
    } else {
      item = rowAt(startRow + at);
      if (!item) { skipped.push({ name: `pasted row ${at + 1}`, reason: 'There is no grid row for it (only loaded rows can be edited).' }); return; }
    }
    const cells = mode === 'key' ? values.slice(1) : values;
    cells.slice(0, targets.length).forEach((text, k) => {
      const target = targets[k];
      if (!target.editable) { skipped.push({ name: `Row ${item.index + 1} ${target.name}`, reason: target.reason || 'This column cannot be edited.' }); return; }
      const from = target.text(item);
      const to = text === '' ? null : text;
      if ((from ?? null) === (to ?? null)) return;
      changes.push({ rowIndex: item.index, col: target.col, name: target.name, from: from ?? null, to, isNull: to === null });
    });
  });
  return { changes, skipped };
}

const columnKey = name => String(name ?? '').trim().replace(/^"(.*)"$/, '$1').toUpperCase();

// True when the first pasted row looks like the grid's column names (at least half of its cells match one).
export function looksLikeHeader(pasted, columns) {
  const first = pasted[0] || [], names = new Set(columns.map(column => columnKey(column.name)));
  const filled = first.filter(cell => String(cell).trim() !== '');
  return filled.length > 0 && filled.filter(cell => names.has(columnKey(cell))).length * 2 >= filled.length;
}

// Plans pasted rows as new rows. Each pasted column fills one column that can be inserted into: by header name, else in
// order. mapping[i] (a column index, or null to skip) overrides the default for pasted column i. Empty cells are left out so
// the column default applies; the text NULL becomes an explicit NULL.
export function planInsertPaste({ pasted, header = false, columns, insertable = [], mapping = {} }) {
  const data = header ? pasted.slice(1) : pasted;
  const empty = { rows: [], mapping: [], targets: [], skipped: [], missing: [] };
  if (!data.length) return { ...empty, error: 'The clipboard has no data rows.' };
  const targets = columns.map((column, col) => ({ col, name: column.name, editable: Boolean(insertable[col]?.editable), reason: insertable[col]?.reason })).filter(target => target.editable);
  if (!targets.length) return { ...empty, error: 'No column of this result can be filled in a new row.' };
  const width = Math.max(...pasted.map(row => row.length)), names = header ? pasted[0] : null;
  const used = new Set();
  const resolved = Array.from({ length: width }, (_, index) => {
    const label = names ? String(names[index] ?? '').trim() || `Column ${index + 1}` : `Column ${index + 1}`;
    let col = index in mapping ? mapping[index] : names ? columns.findIndex(column => columnKey(column.name) === columnKey(names[index])) : targets[index]?.col ?? -1;
    if (col == null || col < 0) return { index, label, col: null, reason: index in mapping ? 'Skipped' : names ? 'No column with this name' : 'No column left to fill' };
    if (!insertable[col]?.editable) return { index, label, col: null, reason: insertable[col]?.reason || `${columns[col].name} cannot be filled in a new row` };
    if (used.has(col)) return { index, label, col: null, reason: `${columns[col].name} is already filled from another pasted column` };
    used.add(col);
    return { index, label, col, reason: null };
  });
  if (resolved.every(item => item.col == null)) return { ...empty, mapping: resolved, targets, error: 'No pasted column fills a column of this result.' };
  const skipped = [], rows = [];
  data.forEach((values, at) => {
    const row = {};
    for (const item of resolved) {
      if (item.col == null) continue;
      const text = values[item.index] ?? '';
      if (text === '') continue;
      row[item.col] = text === 'NULL' ? { isNull: true } : { value: text };
    }
    if (Object.keys(row).length) rows.push(row); else skipped.push({ name: `pasted row ${at + 1}`, reason: 'All mapped cells are empty.' });
  });
  // Required columns (NOT NULL without a default) that a new row leaves empty would be refused by Oracle at Apply.
  const required = columns.map((column, col) => ({ column, col })).filter(({ column, col }) => insertable[col]?.editable && column.nullable === false && !column.hasDefault && !column.identity);
  const missing = required.filter(({ col }) => rows.some(row => !(col in row))).map(({ column, col }) => ({ name: column.name, rows: rows.filter(row => !(col in row)).length }));
  return { rows, mapping: resolved, targets, skipped, missing, error: rows.length ? null : 'Every pasted row is empty in the mapped columns.' };
}
