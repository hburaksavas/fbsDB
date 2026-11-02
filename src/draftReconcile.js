import { emptyDrafts } from './gridDrafts.js';

const keyOf = (row, identity) => { const parts = identity.map(col => row?.[col]); return parts.some(part => part == null) ? null : JSON.stringify(parts.map(String)); };

// After the result was refreshed: find every drafted row again by its ORIGINAL key and move the draft to the row's new position.
// A draft whose row is gone, or whose stored value changed underneath it, is not applied silently: it becomes a conflict that the user resolves.
export function reconcileDrafts({ drafts, oldRows, newRows, identity }) {
  const fresh = new Map();
  for (const item of newRows) { const key = keyOf(item.row, identity); if (key != null) fresh.set(key, item); }
  const where = new Map();
  const locate = oldIndex => {
    if (where.has(oldIndex)) return where.get(oldIndex);
    const key = keyOf(oldRows.get(oldIndex), identity), found = key == null ? null : fresh.get(key) || null;
    where.set(oldIndex, found);
    return found;
  };
  const cells = {}, deleted = [], conflicts = [];
  for (const [name, draft] of Object.entries(drafts.cells)) {
    const [oldRow, col] = name.split(':').map(Number), match = locate(oldRow);
    if (!match) { conflicts.push({ kind: 'missing', oldRow, col, draft, message: `Row ${oldRow + 1} is no longer in the refreshed result (changed key or deleted by another session).` }); continue; }
    const current = match.row[col] == null ? null : String(match.row[col]);
    const entry = { ...draft };
    if ((current ?? null) !== (draft.original ?? null)) conflicts.push({ kind: 'changed', row: match.index, col, draft: entry, current, message: `Row ${match.index + 1}: the stored value changed from ${draft.original == null ? 'NULL' : `"${draft.original}"`} to ${current == null ? 'NULL' : `"${current}"`} since you read it.` });
    cells[`${match.index}:${col}`] = entry;
  }
  for (const oldRow of drafts.deleted) {
    const match = locate(oldRow);
    if (match) deleted.push(match.index); else conflicts.push({ kind: 'missing', oldRow, message: `Row ${oldRow + 1} marked for deletion is no longer in the refreshed result.` });
  }
  return { drafts: { ...emptyDrafts(), cells, deleted, inserted: drafts.inserted, nextInsertId: drafts.nextInsertId }, conflicts };
}

// Resolutions: take the database value (drop the edit) or keep the edit on top of the current value (it now expects that value).
export function resolveConflict(state, conflict, choice) {
  const name = `${conflict.row}:${conflict.col}`, cells = { ...state.cells };
  if (choice === 'theirs') delete cells[name];
  else if (choice === 'mine' && cells[name]) cells[name] = { ...cells[name], original: conflict.current };
  return { ...state, cells };
}
