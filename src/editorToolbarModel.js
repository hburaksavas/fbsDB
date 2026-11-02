// Separator = 1px line + 10px margins + gaps; fixed = run button, its separator, overflow trigger, maximize button and bar padding.
export const toolbarMetrics = { button: 30, rows: 98, separator: 15, fixed: 30 + 15 + 30 + 30 + 24 + 8 };

// Left-to-right order of the inline toolbar. Lower priority numbers stay visible longest when space runs out.
export const toolbarItems = [
  { id: 'open', group: 'file', priority: 6, label: 'Open SQL file' },
  { id: 'save', group: 'file', priority: 3, label: 'Save SQL file' },
  { id: 'new', group: 'file', priority: 7, label: 'New SQL file' },
  { id: 'undo', group: 'edit', priority: 4, label: 'Undo' },
  { id: 'redo', group: 'edit', priority: 8, label: 'Redo' },
  { id: 'format', group: 'edit', priority: 2, label: 'Format SQL' },
  { id: 'find', group: 'search', priority: 9, label: 'Find' },
  { id: 'comment', group: 'search', priority: 10, label: 'Toggle comment' },
  { id: 'explain', group: 'analyze', priority: 5, label: 'Explain plan' },
  { id: 'commit', group: 'transaction', priority: 1, label: 'Commit' },
  { id: 'rollback', group: 'transaction', priority: 1, label: 'Rollback' },
  { id: 'autoCommit', group: 'transaction', priority: 3, label: 'Auto commit' },
  { id: 'rows', group: 'result', priority: 11, label: 'Rows per result page', kind: 'rows' },
];

const widthOf = (items) => {
  let width = 0, previous = null;
  for (const item of items) {
    if (previous && previous.group !== item.group) width += toolbarMetrics.separator;
    width += item.kind === 'rows' ? toolbarMetrics.rows : toolbarMetrics.button;
    previous = item;
  }
  return width;
};

// Chooses the inline items for the available width; everything else moves to the overflow menu in the same order.
export function layoutToolbar(width, items = toolbarItems, hidden = []) {
  const hiddenIds = new Set(hidden);
  const available = Math.max(0, width - toolbarMetrics.fixed);
  const chosen = new Set();
  for (const item of [...items].filter(entry => !hiddenIds.has(entry.id)).sort((a, b) => a.priority - b.priority)) {
    const candidate = items.filter(entry => chosen.has(entry.id) || entry.id === item.id);
    if (widthOf(candidate) <= available) chosen.add(item.id); else break;
  }
  return { inline: items.filter(item => chosen.has(item.id)), overflow: items.filter(item => !chosen.has(item.id)) };
}
