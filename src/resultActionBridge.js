// Lets the command palette offer the result toolbar's actions, including the ones that are not shown as buttons. Each mounted result
// toolbar registers a function that returns its current actions (with their enabled state); the palette reads the registry when it
// opens and uses the toolbar that is actually on screen.
const entries = new Set();

export function registerResultActions(entry) {
  entries.add(entry);
  return () => entries.delete(entry);
}

const isShown = element => Boolean(element?.isConnected && element.getClientRects().length > 0);

// Palette commands for the visible result toolbar, or none when no result is showing.
export function activeResultActions() {
  const entry = [...entries].reverse().find(item => isShown(item.element));
  if (!entry) return [];
  return entry.get().map(action => ({
    id: `result.${action.id}`,
    label: `Result: ${action.label}`,
    detail: action.disabled ? 'Not available right now' : undefined,
    disabled: Boolean(action.disabled),
    run: action.run
  }));
}
