// Lets the command palette offer the grid edit actions. Each mounted edit bar registers a function that returns its current actions
// (with their enabled state); the palette reads the registry when it opens and uses the bar that is actually on screen.
const entries = new Set();

export function registerGridActions(entry) {
  entries.add(entry);
  return () => entries.delete(entry);
}

const isShown = element => Boolean(element?.isConnected && element.getClientRects().length > 0);

// Palette commands for the visible edit bar, or none when no result grid is showing.
export function activeGridActions() {
  const entry = [...entries].reverse().find(item => isShown(item.element));
  if (!entry) return [];
  return entry.get().map(action => ({
    id: `grid.${action.id}`,
    label: `Grid: ${action.label}`,
    detail: action.disabled ? action.why || 'Not available right now' : action.detail,
    disabled: Boolean(action.disabled),
    run: action.run
  }));
}
