// What the grid itself has sent into the session transaction. It only knows its own statements: anything else the session did
// (scripts, other tabs' routines) is outside this count and the text says so.
export const startApplied = (current, count, now = Date.now()) => ({ count: (current?.state === 'pending' ? current.count : 0) + count, since: current?.state === 'pending' ? current.since : now, state: 'pending' });

export function settleTransaction(current, transactionState) {
  if (!current || !['pending', 'unconfirmed'].includes(current.state)) return current;
  if (transactionState === 'committed') return { ...current, state: 'committed' };
  if (transactionState === 'rolled back') return { ...current, state: 'rolledBack' };
  if (transactionState === 'unconfirmed') return { ...current, state: 'unconfirmed' };
  return current;
}

export function elapsedText(since, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function transactionText(tx, now = Date.now()) {
  if (!tx) return '';
  const changes = `${tx.count} grid change${tx.count === 1 ? '' : 's'}`;
  if (tx.state === 'committed') return `${changes} committed.`;
  if (tx.state === 'unconfirmed') return `${changes} were being committed when the connection failed. Whether Oracle saved them is not confirmed: check the stored data before repeating anything.`;
  if (tx.state === 'rolledBack') return `${changes} rolled back; the grid shows the stored values again.`;
  return `${changes} applied, not committed · open for ${elapsedText(tx.since, now)}. Other work in this session is not counted here.`;
}
