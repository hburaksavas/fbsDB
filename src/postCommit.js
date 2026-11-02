const quote = name => `"${String(name).replaceAll('"', '""')}"`;
const bindType = type => /NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(type || '') ? 'NUMBER' : /TIMESTAMP/i.test(type || '') ? 'TIMESTAMP' : /DATE/i.test(type || '') ? 'DATE' : 'VARCHAR2';
export const verifyLimit = 50;

// The changes the grid applied, kept with their keys so they can be checked again after Commit or turned back into drafts after Rollback.
export function appliedEntries(statements, outcomes, cellsByRow) {
  const entries = [];
  statements.forEach((statement, index) => {
    if (outcomes.find(item => item.index === index)?.status !== 'applied') return;
    if (statement.kind === 'update') entries.push({ kind: 'update', row: statement.row, key: statement.binds.filter(bind => /^uk\d+$/.test(bind.name)).map(bind => bind.value), cells: cellsByRow[statement.row] || {} });
    else if (statement.kind === 'delete') entries.push({ kind: 'delete', row: statement.row, key: statement.binds.filter(bind => /^dk\d+$/.test(bind.name)).map(bind => bind.value), cells: {} });
  });
  return entries;
}

// One read-only SELECT for the rows that should now exist (updates, by their NEW key) or be gone (deletes, by the old key).
export function verificationQuery({ columns, identity, entries }) {
  if (!entries.length) return { error: 'Nothing was applied to verify.' };
  if (entries.length > verifyLimit) return { error: `Verification covers at most ${verifyLimit} changed rows at a time; ${entries.length} were applied.` };
  const edited = [...new Set(entries.flatMap(entry => Object.keys(entry.cells).map(Number)))].filter(col => !identity.includes(col));
  const selected = [...identity, ...edited];
  const parameters = [], conditions = [];
  entries.forEach((entry, at) => {
    const parts = identity.map((col, k) => {
      const changed = entry.cells[col];
      const value = changed ? (changed.isNull ? null : changed.value) : entry.key[k];
      if (value == null) return null;
      const name = `v${at}k${k}`;
      parameters.push({ name, type: bindType(columns[col].type), value: String(value), direction: 'IN' });
      return `${quote(columns[col].sourceColumn || columns[col].name)} = :${name}`;
    });
    if (parts.every(Boolean)) conditions.push(`(${parts.join(' AND ')})`);
  });
  if (!conditions.length) return { error: 'The changed rows have no usable key to look up.' };
  const schema = columns[identity[0]].sourceSchema, source = `${schema ? `${quote(schema)}.` : ''}${quote(columns[identity[0]].sourceTable)}`;
  return { sql: `SELECT ${selected.map(col => quote(columns[col].sourceColumn || columns[col].name)).join(', ')} FROM ${source} WHERE ${conditions.join(' OR ')}`, parameters, selected };
}

const text = value => value == null ? null : typeof value === 'object' ? String(value.value ?? value) : String(value).trim();
const same = (a, b) => a === b || (a != null && b != null && a !== '' && b !== '' && Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Number(a) === Number(b));

// Compares what was applied with what the database returns now. A difference is reported as a difference, not as a failed commit:
// another session may have changed the row since.
export function compareVerification({ identity, entries, selected, rows }) {
  const normal = values => JSON.stringify(values.map(value => { const t = text(value); return t != null && t !== '' && Number.isFinite(Number(t)) ? String(Number(t)) : t; }));
  const lookup = new Map(rows.map(row => [normal(identity.map((_, at) => row[at])), row]));
  return entries.map(entry => {
    const label = `Row ${entry.row + 1}`;
    const newKey = identity.map((col, k) => { const changed = entry.cells[col]; return changed ? (changed.isNull ? null : changed.value) : entry.key[k]; });
    if (entry.kind === 'delete') {
      return lookup.get(normal(entry.key)) ? { label, status: 'differs', message: `${label}: deleted, but a row with that key exists now.` } : { label, status: 'ok', message: `${label}: deleted, the key is gone.` };
    }
    const actual = lookup.get(normal(newKey));
    if (!actual) return { label, status: 'missing', message: `${label}: no row with the expected key was found.` };
    const wrong = Object.entries(entry.cells).filter(([col]) => !identity.includes(Number(col))).map(([col, draft]) => ({ col: Number(col), expected: draft.isNull ? null : draft.value, actual: text(actual[selected.indexOf(Number(col))]) })).filter(item => !same(item.expected == null ? null : String(item.expected), item.actual));
    return wrong.length ? { label, status: 'differs', message: `${label}: ${wrong.map(item => `column ${item.col} is ${item.actual == null ? 'NULL' : `"${item.actual}"`}, expected ${item.expected == null ? 'NULL' : `"${item.expected}"`}`).join('; ')}.`, wrong } : { label, status: 'ok', message: `${label}: matches the expected values.` };
  });
}

const typeCounts = entries => entries.reduce((all, entry) => ({ ...all, [entry.kind]: (all[entry.kind] || 0) + 1 }), {});

// A copyable record of what the grid committed: when, where, which table and which keys. It says nothing about what other work the session committed.
export function commitReceipt({ entries, table, columns, identity, committedAt = new Date(), tab = '' }) {
  const counts = typeCounts(entries);
  const keyNames = identity.map(col => columns[col].name).join(', ');
  const lines = [
    'fbsDB commit receipt',
    `Committed at: ${committedAt.toISOString()}${tab ? ` · tab ${tab}` : ''}`,
    `Table: ${table}`,
    `Grid changes: ${[counts.update && `${counts.update} update${counts.update === 1 ? '' : 's'}`, counts.delete && `${counts.delete} delete${counts.delete === 1 ? '' : 's'}`, counts.insert && `${counts.insert} insert${counts.insert === 1 ? '' : 's'}`].filter(Boolean).join(', ')}`,
    `Rows (${keyNames}):`,
    ...entries.map(entry => `- ${entry.kind} ${entry.key.length ? entry.key.join(', ') : '(new row)'}${Object.keys(entry.cells).length ? ` · ${Object.entries(entry.cells).map(([col, draft]) => `${columns[Number(col)].name}: ${draft.original == null ? 'NULL' : draft.original} -> ${draft.isNull ? 'NULL' : draft.value}`).join('; ')}` : ''}`),
    'Scope: only the changes sent from this grid are listed. Other work in the same session was committed with them but is not recorded here.',
  ];
  return lines.join('\n');
}

// A new row draft from an existing row: key, virtual and generated columns are left out so the database fills them in.
export function duplicateValues(columns, editable, identity, row) {
  const values = {};
  columns.forEach((column, index) => {
    if (!editable[index]?.editable || identity.includes(index)) return;
    const value = row[index];
    if (value === undefined) return;
    if (value == null) values[index] = { isNull: true };
    else if (typeof value === 'string' || typeof value === 'number') values[index] = { value: String(value) };
    else if (value?.kind === 'temporal' && value.value != null && !value.offset && !value.region) values[index] = { value: String(value.value) };
  });
  return values;
}
