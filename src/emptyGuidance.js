// What to tell the user, and what to offer, when a result area has nothing to show yet. Pure text and an action id; the view wires the action.
export function idleGuidance({ connected, executing = false, hasSql = false, runShortcut = 'Ctrl+Enter' }) {
  if (executing) return { title: 'Running…', detail: 'The result appears here when the statement finishes.', action: null };
  if (!connected) return { title: 'No results yet', detail: 'Connect to a database first, then run a statement.', action: 'connect', label: 'Choose a connection' };
  if (hasSql) return { title: 'No results yet', detail: `Press ${runShortcut} to run the statement at the cursor.`, action: 'run', label: 'Run statement' };
  return { title: 'No results yet', detail: `Write a statement in the editor, then press ${runShortcut} to run it.`, action: 'edit', label: 'Go to the editor' };
}

export const noRowsGuidance = () => ({
  title: 'No rows returned',
  detail: 'The statement ran successfully and matched no rows. Check its WHERE conditions, or whether the connection points at the schema you expect.'
});
