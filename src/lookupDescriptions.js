import { assertMiniToolSelect } from './miniTools.js';
import { getOracleBindNames } from './oracleBinds.js';

export const lookupDescriptionsStorageKey = 'fbsdb.lookupDescriptions';
export const descriptionKeyLimit = 50;

export const lookupColumnKey = column => column?.sourceTable ? `${column.sourceSchema || ''}.${column.sourceTable}.${column.sourceColumn || column.name}`.toUpperCase() : null;

export function loadLookupDescriptions(storage) {
  try {
    const data = JSON.parse(storage?.getItem(lookupDescriptionsStorageKey) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? Object.fromEntries(Object.entries(data).filter(([, sql]) => typeof sql === 'string' && sql.length <= 4000)) : {};
  } catch { return {}; }
}
export function saveLookupDescription(storage, key, sql) {
  const all = loadLookupDescriptions(storage);
  if (sql && sql.trim()) all[key] = sql.trim(); else delete all[key];
  try { storage?.setItem(lookupDescriptionsStorageKey, JSON.stringify(all)); } catch { /* the query stays for this session */ }
  return all;
}

// The configured query is one SELECT with a {keys} marker: the loaded distinct key values become binds, so values are never written into SQL text.
export function prepareDescriptionQuery(template, values) {
  const text = String(template || '').trim().replace(/;\s*$/, '');
  if ((text.match(/\{keys\}/g) || []).length !== 1) return { error: 'Write the query with {keys} once, for example SELECT id, name FROM customers WHERE id IN ({keys}).' };
  const distinct = [...new Set(values.filter(value => value != null && value !== '').map(String))];
  if (!distinct.length) return { error: 'The loaded rows have no values in this column.' };
  const used = distinct.slice(0, descriptionKeyLimit);
  const sql = text.replace('{keys}', used.map((_, at) => `:k${at}`).join(', '));
  try { assertMiniToolSelect(sql); } catch (error) { return { error: error.message.replace(/^Mini tools support/, 'A description lookup is') }; }
  if (getOracleBindNames(text.replace('{keys}', '')).length) return { error: 'The query cannot use binds of its own; only {keys}.' };
  return { sql, parameters: used.map((value, at) => ({ name: `K${at}`, type: /^-?\d+(\.\d+)?$/.test(value) ? 'NUMBER' : 'VARCHAR2', value, direction: 'IN' })), covered: used.length, total: distinct.length };
}

// First column is the key, the rest form the description; the key itself is never replaced, only annotated.
export function descriptionMap(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row[0] == null) continue;
    const text = row.slice(1).filter(cell => cell != null && cell !== '').map(String).join(' · ');
    if (text) map.set(String(row[0]).trim(), text);
  }
  return map;
}
