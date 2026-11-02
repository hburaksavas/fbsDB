// Selection is separate from the active tab: Ctrl toggles, Shift selects a range, a plain click clears it.
export function selectTabs({ order, selected = [], anchor = null, active = null }, id, { ctrl = false, shift = false } = {}) {
  if (!order.includes(id)) return { selected, anchor };
  if (shift) {
    const from = order.indexOf(order.includes(anchor) ? anchor : active ?? id), to = order.indexOf(id);
    const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    return { selected: ctrl ? order.filter(item => selected.includes(item) || range.includes(item)) : range, anchor: order.includes(anchor) ? anchor : order[from] };
  }
  if (ctrl) {
    const base = selected.length ? selected : (active && order.includes(active) ? [active] : []);
    const next = base.includes(id) ? base.filter(item => item !== id) : [...base, id];
    return { selected: order.filter(item => next.includes(item)), anchor: id };
  }
  return { selected: [], anchor: id };
}

// Drops tabs that were closed so a stale selection never targets other documents.
export function pruneSelection(order, selected) {
  const kept = selected.filter(id => order.includes(id));
  return kept.length > 1 ? kept : [];
}

export function selectionMenuItems(selected, packageIds = id => [id]) {
  if (selected.length < 2) return [];
  const ids = selected.flatMap(packageIds);
  return [{ label: `Close ${selected.length} selected tabs`, ids }];
}
