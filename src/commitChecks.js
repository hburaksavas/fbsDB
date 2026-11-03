import { assertMiniToolSelect } from './miniTools.js';
import { getOracleBindNames } from './oracleBinds.js';
import { lexOracle } from './oracleLexer.js';
import { impureCalls } from './quickEval.js';

export const commitChecksStorageKey = 'fbsdb.commitChecks';
export const checkExpectations = Object.freeze([
  { id: 'none', label: 'Should return no rows (rows are violations)' },
  { id: 'any', label: 'Should return at least one row' },
  { id: 'info', label: 'Just show the result' },
]);
export const checkRowLimit = 20;

export function loadCommitChecks(storage) {
  try {
    const list = JSON.parse(storage?.getItem(commitChecksStorageKey) || '[]');
    return (Array.isArray(list) ? list : []).filter(item => item && typeof item.name === 'string' && typeof item.sql === 'string').slice(0, 20)
      .map(item => ({ name: item.name.slice(0, 60), sql: item.sql.slice(0, 4000), expect: checkExpectations.some(e => e.id === item.expect) ? item.expect : 'none' }));
  } catch { return []; }
}
export function saveCommitChecks(storage, checks) {
  try { storage?.setItem(commitChecksStorageKey, JSON.stringify(checks.slice(0, 20))); } catch { /* checks stay for this session */ }
}

// A check is one SELECT with no binds. Calls to anything not known to be pure are listed: Oracle cannot promise they have no side effects.
export function prepareCheck({ name, sql, expect = 'none' }, existing = []) {
  const title = String(name || '').trim();
  if (!title) return { error: 'Give the check a name.' };
  if (existing.some(item => item.name.toLowerCase() === title.toLowerCase())) return { error: 'Another check already has this name.' };
  const text = String(sql || '').trim().replace(/;\s*$/, '');
  try { assertMiniToolSelect(text); } catch (error) { return { error: error.message.replace(/^Mini tools support/, 'A check is') }; }
  if (getOracleBindNames(text).length) return { error: 'A check cannot use binds; write the values into the query.' };
  const calls = impureCalls(lexOracle(text).filter(token => token.kind !== 'comment'));
  return { check: { name: title, sql: text, expect }, calls };
}

// Outcome of one run: pass/fail follows the expectation, but the rows are always shown so nothing is hidden behind a verdict.
export function evaluateCheck(check, result) {
  if (result.error) return { name: check.name, status: 'error', message: result.error, rows: [] };
  const count = result.rows.length, more = Boolean(result.truncated);
  const shown = `${count}${more ? '+' : ''} row${count === 1 && !more ? '' : 's'}`;
  if (check.expect === 'info') return { name: check.name, status: 'info', message: `${shown} returned.`, rows: result.rows, columns: result.columns };
  const ok = check.expect === 'none' ? count === 0 : count > 0;
  return { name: check.name, status: ok ? 'ok' : 'attention', message: ok ? `${shown} returned, as expected.` : check.expect === 'none' ? `${shown} returned; expected none.` : 'No rows returned; expected at least one.', rows: result.rows, columns: result.columns };
}
