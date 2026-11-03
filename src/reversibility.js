// One vocabulary for "can this still be undone?" wherever a transaction state is shown: grid status, tab text, query outcome, buttons.
const states = {
  pending: { label: 'Not committed', meaning: 'can still be rolled back', tone: 'open' },
  committed: { label: 'Committed', meaning: 'permanent', tone: 'permanent' },
  rolledBack: { label: 'Rolled back', meaning: 'undone', tone: 'undone' },
  unconfirmed: { label: 'Unconfirmed', meaning: 'check the stored data before repeating anything', tone: 'unknown' }
};

export function reversibility(state) {
  const found = states[state];
  return found ? { id: state, ...found, line: `${found.label} · ${found.meaning}` } : null;
}

export const commitButtonTitle = 'Commit: make the pending changes of this session permanent';
export const rollbackButtonTitle = 'Rollback: discard the pending changes of this session';
