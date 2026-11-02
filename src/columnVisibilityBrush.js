// Applies one show/hide state to several columns; at least one column always stays visible.
export function applyColumnVisibility(hidden = [], indices = [], visible, columnCount) {
  const next = new Set(hidden);
  for (const index of indices) if (index >= 0 && index < columnCount) visible ? next.delete(index) : next.add(index);
  if (next.size >= columnCount) return { hidden, error: 'At least one column must stay visible.' };
  return { hidden: [...next].sort((a, b) => a - b) };
}
