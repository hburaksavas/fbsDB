// Which follow-up actions an Oracle failure offers. The model only decides; the views run them.

// A failed query: the code can suggest where to go next (in addition to Return to SQL and Copy error).
export function queryFailureActions(code) {
  const value = String(code || '').toUpperCase();
  if (value === 'ORA-01031' || value === 'ORA-41900') return [{ id: 'connection', label: 'Choose another connection' }];
  if (value === 'ORA-00942') return [{ id: 'find', label: 'Find the object…' }];
  return [];
}
