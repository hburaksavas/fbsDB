import { settleTransaction } from './appliedTransaction.js';
import { isDirty, pendingSummary } from './gridDrafts.js';

// Unapplied grid edits outlive the result view: a re-run, a tab switch or a refresh remounts the grid, and the drafts must not vanish with it.
// Entries are kept per tab and source table, in memory only (never written to disk, so sensitive values are not persisted).
const store = new Map();

export const draftStoreKey = (tabId, columns) => {
  const column = columns.find(item => item.sourceTable);
  return column ? `${tabId}|${column.sourceSchema || ''}.${column.sourceTable}` : null;
};
export const columnsSignature = columns => columns.map(item => `${item.name}|${item.sourceTable || ''}`).join(',');

export function loadStoredDrafts(key, signature) {
  const entry = key ? store.get(key) : null;
  return entry && entry.signature === signature ? entry : null;
}
// Views that show held drafts re-render when the store changes.
let storeVersion = 0;
const listeners = new Set();
const changed = () => { storeVersion++; listeners.forEach(listener => listener()); };
export const subscribeDraftStore = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const draftStoreVersion = () => storeVersion;

export function saveStoredDrafts(key, entry) {
  if (!key) return;
  if (!entry) store.delete(key); else store.set(key, entry);
  changed();
}
// A kept transaction record follows what happens to the tab's session while its grid is not on screen. A new session has no pending work of the old one;
// an unconfirmed outcome stays, because it can still be checked.
export function settleStoredTransactions(tabId, state) {
  let touched = false;
  for (const [key, entry] of [...store]) {
    if (!key.startsWith(`${tabId}|`) || !entry.tx) continue;
    const tx = state === 'reconnected' ? (entry.tx.state === 'pending' ? null : entry.tx) : settleTransaction(entry.tx, state);
    const open = tx?.state === 'pending' || tx?.state === 'unconfirmed';
    touched = true;
    if (!open && !isDirty(entry.drafts) && !entry.conflicts?.length) store.delete(key);
    else store.set(key, { ...entry, tx: open ? tx : null, appliedLog: open ? entry.appliedLog : [], txLabel: open ? entry.txLabel : '' });
  }
  if (touched) changed();
}
export const hasStoredDrafts = key => Boolean(key && store.get(key));
export const clearAllStoredDrafts = () => { store.clear(); changed(); };

// Held drafts of one tab, one row per source table, for notices that show what is waiting.
export function listTabDrafts(tabId) {
  const rows = [];
  for (const [key, entry] of store) if (key.startsWith(`${tabId}|`)) rows.push({ key, table: key.slice(tabId.length + 1), count: pendingSummary(entry.drafts).total + (entry.conflicts?.length || 0) });
  return rows.filter(row => row.count > 0);
}

// Unapplied edits of one tab across all of its tables, so closing the tab or switching its connection can ask first.
export function countTabDrafts(tabId) {
  let total = 0;
  for (const [key, entry] of store) if (key.startsWith(`${tabId}|`)) total += pendingSummary(entry.drafts).total + (entry.conflicts?.length || 0);
  return total;
}
export function clearTabDrafts(tabId) {
  for (const key of [...store.keys()]) if (key.startsWith(`${tabId}|`)) store.delete(key);
  changed();
}

// Anything that clears a tab's drafts announces it; the store forgets them too, so a mounted grid cannot write them back.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('fbsdb.draftsCleared', event => { if (event.detail?.tabId) clearTabDrafts(event.detail.tabId); });
