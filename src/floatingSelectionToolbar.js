// Positions the toolbar below the focused selection cell inside the grid container, flipping above near the bottom.
export function floatingToolbarPlacement(cell, container, toolbar, gap = 4) {
  if (!cell || cell.bottom <= container.top || cell.top >= container.bottom) return null;
  const left = Math.max(gap, Math.min(cell.right - container.left - toolbar.width, container.width - toolbar.width - gap));
  const below = cell.bottom - container.top + gap;
  const top = below + toolbar.height <= container.height - gap ? below : Math.max(gap, cell.top - container.top - toolbar.height - gap);
  return { left: Math.round(left), top: Math.round(top) };
}

export const floatingToolbarPreferenceKey = 'fbsdb.results.floatingSelectionToolbar';
export function floatingToolbarEnabled(storage) {
  try { return storage?.getItem(floatingToolbarPreferenceKey) !== 'off'; } catch { return true; }
}
export function setFloatingToolbarEnabled(storage, enabled) {
  try { enabled ? storage?.removeItem(floatingToolbarPreferenceKey) : storage?.setItem(floatingToolbarPreferenceKey, 'off'); } catch { /* preference is optional */ }
}
