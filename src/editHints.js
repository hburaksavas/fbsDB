// One short tip under the edit bar, chosen from what the user has selected and staged. Each tip can be dismissed for good, and all
// tips can be switched off. Tips only describe actions that exist; they never run anything.
export const hintStorageKey = 'fbsdb.editHints';

export function loadHintPrefs(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(hintStorageKey) || '{}');
    return { dismissed: Array.isArray(raw.dismissed) ? raw.dismissed.filter(id => typeof id === 'string') : [], off: raw.off === true };
  } catch { return { dismissed: [], off: false }; }
}

export function saveHintPrefs(storage, prefs) {
  try { storage?.setItem(hintStorageKey, JSON.stringify({ dismissed: prefs.dismissed, off: prefs.off })); } catch { /* the choice just does not persist */ }
}

export function dismissHint(prefs, id) { return prefs.dismissed.includes(id) ? prefs : { ...prefs, dismissed: [...prefs.dismissed, id] }; }

const plural = (count, word) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

// Highest-priority tip that applies and was not dismissed, or null.
export function chooseHint({ editMode, editable, selectedCells = 0, selectedRows = 0, pending = 0, applying = false }, prefs = { dismissed: [], off: false }) {
  if (!editMode || !editable || prefs.off || applying) return null;
  const candidates = [];
  if (pending > 0) candidates.push({ id: 'review', text: `${plural(pending, 'change')} staged. Open Pending to review the SQL, then apply. Nothing reaches Oracle before that.` });
  if (selectedCells > 1) candidates.push({ id: 'multi', text: `${plural(selectedCells, 'cell')} selected. Use More › Bulk edit… to change them together, with a preview.` });
  if (selectedCells === 1) candidates.push({ id: 'single', text: `Press F2 to edit this cell. Delete row marks ${selectedRows === 1 ? 'its row' : 'the row'} for deletion; both stay local until you apply.` });
  if (selectedCells === 0 && pending === 0) candidates.push({ id: 'select', text: 'Select a cell, then press F2 to edit it. New row adds a draft; nothing is sent to Oracle until you apply.' });
  return candidates.find(item => !prefs.dismissed.includes(item.id)) || null;
}
