// Local, unapplied grid edits. Nothing here talks to the database: drafts are values the user staged and can still discard.
// A cell draft is { original, value, isNull }: "no entry" means untouched, isNull is an explicit NULL (distinct from an empty string).
export const emptyDrafts = () => ({ cells: {}, deleted: [], inserted: [], nextInsertId: 1, past: [], future: [] });

const key = (row, col) => `${row}:${col}`;
const snapshot = state => ({ cells: state.cells, deleted: state.deleted, inserted: state.inserted, nextInsertId: state.nextInsertId });
const commit = (state, next) => ({ ...state, ...next, past: [...state.past, snapshot(state)].slice(-100), future: [] });
const same = (original, draft) => draft.isNull ? original == null : original != null && String(original) === draft.value;

export const isDirty = state => Object.keys(state.cells).length > 0 || state.deleted.length > 0 || state.inserted.length > 0;
export const cellDraft = (state, row, col) => state.cells[key(row, col)] || null;
export const isDeleted = (state, row) => state.deleted.includes(row);

// Stage a value or an explicit NULL. Setting a cell back to its original value removes the marker instead of leaving a no-op UPDATE.
export function editCell(state, row, col, original, input) {
  const draft = { original: original ?? null, value: input.isNull ? '' : String(input.value ?? ''), isNull: Boolean(input.isNull) };
  const cells = { ...state.cells };
  if (same(draft.original, draft)) { if (!(key(row, col) in cells)) return state; delete cells[key(row, col)]; }
  else cells[key(row, col)] = draft;
  return commit(state, { cells });
}

export const toggleDeleted = (state, row) => commit(state, { deleted: state.deleted.includes(row) ? state.deleted.filter(item => item !== row) : [...state.deleted, row] });

export function insertRow(state, values = {}) {
  const id = state.nextInsertId;
  return commit(state, { inserted: [...state.inserted, { id, values: { ...values } }], nextInsertId: id + 1 });
}
// A new row only lists the columns the user filled in: omitted columns use the database default, an explicit NULL is its own state.
export function editInserted(state, id, col, input) {
  return commit(state, { inserted: state.inserted.map(row => {
    if (row.id !== id) return row;
    const values = { ...row.values };
    if (input.omit || (!input.isNull && input.value === '')) delete values[col];
    else values[col] = input.isNull ? { isNull: true } : { value: String(input.value ?? '') };
    return { ...row, values };
  }) });
}

// Required columns (NOT NULL without default/identity) that a new row has not filled in.
export function missingRequired(columns, editable, values) {
  return columns.map((column, index) => ({ column, index })).filter(({ column, index }) => editable[index]?.editable && column.nullable === false && !column.hasDefault && !column.identity && !(index in values));
}
export const removeInserted = (state, id) => commit(state, { inserted: state.inserted.filter(row => row.id !== id) });

export function undo(state) {
  if (!state.past.length) return state;
  const previous = state.past.at(-1);
  return { ...state, ...previous, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future] };
}
export function redo(state) {
  if (!state.future.length) return state;
  const [next, ...rest] = state.future;
  return { ...state, ...next, past: [...state.past, snapshot(state)], future: rest };
}

export function pendingSummary(state) {
  const rows = new Set(Object.keys(state.cells).map(name => Number(name.split(':')[0])));
  const updates = [...rows].filter(row => !state.deleted.includes(row)).length;
  return { updates, cells: Object.keys(state.cells).length, inserts: state.inserted.length, deletes: state.deleted.length, total: updates + state.inserted.length + state.deleted.length };
}

// Everything pending in a stable order (deletes, updates by row/column, inserts) for the review drawer and for stepping between changes.
export function pendingChanges(state) {
  const items = [];
  for (const row of [...state.deleted].sort((a, b) => a - b)) items.push({ kind: 'delete', row });
  for (const [name, draft] of Object.entries(state.cells).sort(([a], [b]) => { const [ar, ac] = a.split(':').map(Number), [br, bc] = b.split(':').map(Number); return ar - br || ac - bc; })) {
    const [row, col] = name.split(':').map(Number);
    if (!state.deleted.includes(row)) items.push({ kind: 'update', row, col, ...draft });
  }
  for (const row of state.inserted) items.push({ kind: 'insert', id: row.id, values: row.values });
  return items;
}

// After Oracle answered: statements that were applied leave the drafts (they now live in the open transaction); failed, mismatched and
// skipped ones stay as drafts so they can be corrected and retried. History is cleared because applied DML cannot be undone locally.
export function settleApplied(state, statements, outcomes) {
  const applied = new Set(outcomes.filter(item => item.status === 'applied').map(item => item.index));
  const appliedCells = {}, appliedDeleted = [], rows = new Set(), deletes = new Set(), inserts = new Set();
  statements.forEach((statement, index) => {
    if (!applied.has(index)) return;
    if (statement.kind === 'update') rows.add(statement.row);
    else if (statement.kind === 'delete') deletes.add(statement.row);
    else if (statement.kind === 'insert') inserts.add(statement.id);
  });
  const cells = {};
  for (const [name, draft] of Object.entries(state.cells)) {
    const row = Number(name.split(':')[0]);
    if (rows.has(row)) appliedCells[name] = draft.isNull ? null : draft.value; else cells[name] = draft;
  }
  for (const row of deletes) appliedDeleted.push(row);
  return {
    drafts: { ...state, cells, deleted: state.deleted.filter(row => !deletes.has(row)), inserted: state.inserted.filter(row => !inserts.has(row.id)), past: [], future: [] },
    appliedCells, appliedDeleted,
  };
}
