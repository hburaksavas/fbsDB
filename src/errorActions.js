// Which follow-up actions an Oracle failure offers. The model only decides; the views run them.

// Applying grid drafts: a failed statement can point at a cell to correct.
export function applyFailureActions({ outcome, error }) {
  if (outcome?.status !== 'failed') return [];
  const actions = [];
  if (error?.row != null) {
    actions.push({ id: 'show', label: error.col != null ? 'Show cell' : 'Show row' });
    if (error.col != null) actions.push({ id: 'edit', label: 'Correct this value' });
  }
  actions.push({ id: 'copy', label: 'Copy error' });
  return actions;
}

// A failed query: the code can suggest where to go next (in addition to Return to SQL and Copy error).
export function queryFailureActions(code) {
  const value = String(code || '').toUpperCase();
  if (value === 'ORA-01031' || value === 'ORA-41900') return [{ id: 'connection', label: 'Choose another connection' }];
  if (value === 'ORA-00942') return [{ id: 'find', label: 'Find the object…' }];
  return [];
}
