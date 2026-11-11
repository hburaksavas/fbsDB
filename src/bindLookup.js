import { getOracleBindNames } from './oracleBinds.js';
import { assertSelectOnly } from './selectOnly.js';

export const bindLookupStorageKey = 'fbsdb.bindLookups';
export const lookupRowLimit = 50;

// Lookup queries are configuration (SQL text), never data: one explicit SELECT per bind name, stored on this computer.
export function loadBindLookups(storage) {
  try {
    const data = JSON.parse(storage?.getItem(bindLookupStorageKey) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? Object.fromEntries(Object.entries(data).filter(([name, sql]) => /^[A-Z][A-Z0-9_$#]*$/.test(name) && typeof sql === 'string' && sql.length <= 4000)) : {};
  } catch { return {}; }
}
export function saveBindLookup(storage, name, sql) {
  const lookups = loadBindLookups(storage);
  if (sql) lookups[String(name).toUpperCase()] = sql; else delete lookups[String(name).toUpperCase()];
  try { storage?.setItem(bindLookupStorageKey, JSON.stringify(lookups)); } catch { /* the query stays for this dialog only */ }
  return lookups;
}

// A picker query is a single SELECT whose only bind may be :search, supplied from the search box. Nothing else is run for the user.
export function prepareLookup(text) {
  const sql = String(text || '').trim().replace(/;\s*$/, '');
  if (!sql) return { error: 'Enter a SELECT query that returns the value in its first column.' };
  try { assertSelectOnly(sql, 'A picker runs'); } catch (error) { return { error: error.message }; }
  const other = getOracleBindNames(sql).filter(name => name !== 'SEARCH');
  if (other.length) return { error: `Only :search can be used as a bind here; remove ${other.map(name => `:${name}`).join(', ')}.` };
  return { sql, usesSearch: getOracleBindNames(sql).includes('SEARCH') };
}

export function lookupParameters(plan, search) {
  return plan.usesSearch ? [{ name: 'SEARCH', type: 'VARCHAR2', value: String(search ?? ''), direction: 'IN' }] : [];
}

// The picked value is the first column, as text; NULL cannot be picked (use the NULL option instead).
export function pickedValue(row) {
  const value = Array.isArray(row) ? row[0] : null;
  return value == null ? null : String(value);
}
