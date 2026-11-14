import { assertSelectOnly } from './selectOnly.js';
import { getOracleBindNames } from './oracleBinds.js';

// The statement a foreign key lookup may run by itself: one SELECT with no binds, without its terminator.
// Anything else (an UPDATE draft, several statements) is left for the user to run.
export function autoRunStatement(sql) {
  try {
    const statement = assertSelectOnly(String(sql ?? ''));
    if (getOracleBindNames(statement).length) return null;
    return statement.replace(/;\s*$/, '').trim() || null;
  } catch { return null; }
}

// What to do with a lookup waiting for its new tab to connect: 'wait', 'run' or 'drop'.
// It is dropped when the user leaves the tab or the connection fails, so it never runs later by surprise.
export function autoRunStep(pending, { activeTabId, connected, connecting, executing, connectionError, generation }) {
  if (!pending) return 'wait';
  if (pending.tabId !== activeTabId || connectionError) return 'drop';
  if (connecting || executing || !connected || !(generation > 0)) return 'wait';
  return 'run';
}
