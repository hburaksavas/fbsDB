import { bindType } from './dmlPreview.js';
import { compareOracleTemporal, oracleTemporalText } from './oracleTemporal.js';

const quote = name => `"${String(name).replaceAll('"', '""')}"`;
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

const text = value => value == null ? null : value?.kind === 'temporal' ? oracleTemporalText(value) : typeof value === 'object' ? String(value.value ?? value) : String(value).trim();
const same = (a, b) => a === b || (a != null && b != null && a !== '' && b !== '' && Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Number(a) === Number(b));

// A datetime is compared as a datetime, so the T or space between date and time and the digits of a fraction do not count as a difference.
const sameCell = (expected, cell) => { const temporal = expected != null && cell?.kind === 'temporal' ? compareOracleTemporal(cell, String(expected)) : null; return temporal !== null ? temporal === 0 : same(expected == null ? null : String(expected), text(cell)); };

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
    const wrong = Object.entries(entry.cells).filter(([col]) => !identity.includes(Number(col))).map(([col, draft]) => ({ col: Number(col), expected: draft.isNull ? null : draft.value, cell: actual[selected.indexOf(Number(col))] })).filter(item => !sameCell(item.expected, item.cell)).map(({ col, expected, cell }) => ({ col, expected, actual: text(cell) }));
    return wrong.length ? { label, status: 'differs', message: `${label}: ${wrong.map(item => `column ${item.col} is ${item.actual == null ? 'NULL' : `"${item.actual}"`}, expected ${item.expected == null ? 'NULL' : `"${item.expected}"`}`).join('; ')}.`, wrong } : { label, status: 'ok', message: `${label}: matches the expected values.` };
  });
}

// Several Applies in one transaction can change the same row: what counts is its value before the first and after the last.
export function mergeAppliedEntries(entries) {
  const byRow = new Map();
  for (const entry of entries) {
    const known = byRow.get(entry.row);
    if (!known) { byRow.set(entry.row, { ...entry, cells: { ...entry.cells } }); continue; }
    const cells = { ...known.cells };
    for (const [col, draft] of Object.entries(entry.cells)) cells[col] = { ...draft, original: known.cells[col] ? known.cells[col].original : draft.original };
    byRow.set(entry.row, { ...known, kind: entry.kind === 'delete' ? 'delete' : known.kind, cells });
  }
  return [...byRow.values()];
}

// For a Commit whose outcome is unknown: reads each row under its new and its old key, so a row can be recognised either way.
export function reconciliationQuery({ columns, identity, entries }) {
  const merged = mergeAppliedEntries(entries);
  const oldKeys = merged.filter(entry => entry.kind === 'update' && identity.some(col => entry.cells[col])).map(entry => ({ kind: 'delete', row: entry.row, key: entry.key, cells: {} }));
  return verificationQuery({ columns, identity, entries: [...merged, ...oldKeys] });
}

// Says for each change whether the database holds the new value, the old value or neither. Only a row holding its old value may be sent again.
export function reconcileApplied({ identity, entries, selected, rows }) {
  const normal = values => JSON.stringify(values.map(value => { const t = text(value); return t != null && t !== '' && Number.isFinite(Number(t)) ? String(Number(t)) : t; }));
  const lookup = new Map(rows.map(row => [normal(identity.map((_, at) => row[at])), row]));
  return mergeAppliedEntries(entries).map(entry => {
    const label = `Row ${entry.row + 1}`;
    if (entry.kind === 'delete') return lookup.get(normal(entry.key)) ? { label, row: entry.row, status: 'notSaved', message: `${label}: not saved, the row is still there.` } : { label, row: entry.row, status: 'saved', message: `${label}: saved, the row is gone.` };
    const newKey = identity.map((col, k) => { const changed = entry.cells[col]; return changed ? (changed.isNull ? null : changed.value) : entry.key[k]; });
    const edited = Object.entries(entry.cells).filter(([col]) => !identity.includes(Number(col))).map(([col, draft]) => ({ at: selected.indexOf(Number(col)), value: draft.isNull ? null : draft.value, original: draft.original }));
    const atNew = lookup.get(normal(newKey)), atOld = lookup.get(normal(entry.key));
    if (atNew && edited.every(item => sameCell(item.value, atNew[item.at]))) return { label, row: entry.row, status: 'saved', message: `${label}: saved, it holds the new values.` };
    if (atOld && edited.every(item => sameCell(item.original, atOld[item.at]))) return { label, row: entry.row, status: 'notSaved', message: `${label}: not saved, it still holds the old values.` };
    if (!atNew && !atOld) return { label, row: entry.row, status: 'unknown', message: `${label}: no row with its key was found; another session may have changed or deleted it.` };
    return { label, row: entry.row, status: 'unknown', message: `${label}: it holds neither the old nor the new values; another session may have changed it.` };
  });
}

// Plain counts for the result line. A Commit saves everything or nothing, so a mix points at another session.
export function reconciliationNote(results, unchecked = 0) {
  const count = status => results.filter(item => item.status === status).length;
  const saved = count('saved'), unsaved = count('notSaved'), unknown = count('unknown');
  const parts = [saved && `${saved} saved`, unsaved && `${unsaved} not saved`, unknown && `${unknown} unclear`, unchecked && `${unchecked} new row${unchecked === 1 ? '' : 's'} not checked`].filter(Boolean).join(', ');
  const mix = saved && unsaved ? ' A Commit saves everything or nothing, so this mix means another session changed some of these rows.' : '';
  return `${parts}. This covers only the changes sent from this grid; other work in the session is not checked.${mix}`;
}

const typeCounts = entries => entries.reduce((all, entry) => ({ ...all, [entry.kind]: (all[entry.kind] || 0) + 1 }), {});

// A copyable record of what the grid committed: when, where, which table and which keys. It says nothing about what other work the session committed.
export function commitReceipt({ entries, table, columns, identity, committedAt = new Date(), tab = '', label = '' }) {
  const counts = typeCounts(entries);
  const keyNames = identity.map(col => columns[col].name).join(', ');
  const lines = [
    'fbsDB commit receipt',
    `Committed at: ${committedAt.toISOString()}${tab ? ` · tab ${tab}` : ''}`,
    ...(label.trim() ? [`Label: ${label.trim()} (a local note; it does not change what Commit affected)`] : []),
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
