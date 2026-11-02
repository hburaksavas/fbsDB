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
