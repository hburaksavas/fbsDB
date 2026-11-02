// Bulk edits are previews first: each operation turns the selected cells into proposed changes (and reasons for skipped cells);
// nothing is staged until the user accepts the preview, and then it is a single undo step.
export const bulkModes = Object.freeze([
  { id: 'set', label: 'Set to a value', needs: 'value' },
  { id: 'null', label: 'Set to NULL', needs: null },
  { id: 'replace', label: 'Find and replace in text', needs: 'find' },
  { id: 'add', label: 'Add a number', needs: 'amount' },
  { id: 'multiply', label: 'Multiply by a number', needs: 'amount' },
  { id: 'percent', label: 'Increase by a percentage', needs: 'amount' },
]);

const numeric = text => typeof text === 'string' && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(text.trim());
const decimals = value => { const match = /\.(\d+)$/.exec(String(value).replace(/e.*$/i, '')); return match ? match[1].length : 0; };
const fixed = (value, places) => { const text = (Math.round(value * 10 ** places) / 10 ** places).toFixed(places); return places ? text.replace(/\.?0+$/, '') || '0' : text; };

// cells: [{ rowIndex, col, name, text (current value as text or null), editable, reason, numeric }]
export function planBulkEdit(cells, { mode, value = '', find = '', replacement = '', matchCase = false, amount = '' }) {
  const changes = [], skipped = [];
  if (mode === 'replace' && !find) return { changes, skipped, error: 'Enter the text to find.' };
  if (['add', 'multiply', 'percent'].includes(mode) && !numeric(String(amount))) return { changes, skipped, error: 'Enter a number.' };
  const factor = Number(amount);
  for (const cell of cells) {
    if (!cell.editable) { skipped.push({ ...cell, reason: cell.reason || 'This column cannot be edited.' }); continue; }
    const base = { rowIndex: cell.rowIndex, col: cell.col, name: cell.name, from: cell.text };
    if (mode === 'set') { if (cell.text !== value) changes.push({ ...base, to: value, isNull: false }); continue; }
    if (mode === 'null') { if (cell.text !== null) changes.push({ ...base, to: null, isNull: true }); continue; }
    if (mode === 'replace') {
      if (cell.text == null) { skipped.push({ ...cell, reason: 'The value is NULL.' }); continue; }
      const next = matchCase ? cell.text.split(find).join(replacement) : cell.text.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), () => replacement);
      if (next !== cell.text) changes.push({ ...base, to: next, isNull: false });
      continue;
    }
    if (!numeric(cell.text)) { skipped.push({ ...cell, reason: cell.text == null ? 'The value is NULL.' : 'The value is not a number.' }); continue; }
    const current = Number(cell.text), places = Math.max(decimals(cell.text), decimals(amount), mode === 'percent' ? 2 : 0);
    const result = mode === 'add' ? current + factor : mode === 'multiply' ? current * factor : current * (1 + factor / 100);
    const to = fixed(result, Math.min(places, 10));
    if (Number(to) !== current) changes.push({ ...base, to, isNull: false });
  }
  return { changes, skipped };
}

export function previewText(plan, limit = 8) {
  const show = plan.changes.slice(0, limit).map(change => `Row ${change.rowIndex + 1} ${change.name}: ${change.from == null ? 'NULL' : change.from} → ${change.isNull ? 'NULL' : change.to}`);
  return { lines: show, more: Math.max(0, plan.changes.length - limit), summary: `${plan.changes.length} cell${plan.changes.length === 1 ? '' : 's'} would change${plan.skipped.length ? `, ${plan.skipped.length} skipped` : ''}.` };
}
