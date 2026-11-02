import { detectCodeLanguage } from './codeCellModel.js';
import { looksGeographic } from './geoCoordinates.js';

export const jsonTreeNodeLimit = 5000;

// Column metadata wins over content sniffing; the user can always override the choice.
export function defaultValueViewer(column, value) {
  if (value?.kind === 'binary' || value?.kind === 'temporal' || value == null) return 'raw';
  const type = String(column?.type || '').toUpperCase();
  if (/JSON/.test(type)) return 'jsonTree';
  if (/XML/.test(type)) return 'xml';
  if (!/CHAR|CLOB|TEXT|LONG/.test(type) && type) return 'raw';
  if (looksGeographic(column, value)) return 'map';
  const language = detectCodeLanguage(String(value).slice(0, 200000));
  return language === 'json' ? 'jsonTree' : language === 'xml' ? 'xml' : 'raw';
}

// Flattens parsed JSON into visible rows with stable JSONPath-like paths; stops at the node limit.
export function jsonTreeRows(data, expanded = new Set(['$']), limit = jsonTreeNodeLimit) {
  const rows = [];
  let truncated = false;
  const visit = (value, path, key, depth) => {
    if (rows.length >= limit) { truncated = true; return; }
    const container = value !== null && typeof value === 'object', entries = container ? (Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value)) : [];
    rows.push({ path, key, depth, type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value, value: container ? null : value, size: entries.length, container, open: container && expanded.has(path) });
    if (container && expanded.has(path)) for (const [childKey, child] of entries) visit(child, Array.isArray(value) ? `${path}[${childKey}]` : /^[A-Za-z_$][\w$]*$/.test(childKey) ? `${path}.${childKey}` : `${path}["${String(childKey).replace(/["\\]/g, '\\$&')}"]`, childKey, depth + 1);
  };
  visit(data, '$', null, 0);
  return { rows, truncated };
}

export function initialJsonExpansion(data, depth = 2) {
  const open = new Set();
  const visit = (value, path, level) => {
    if (level >= depth || value === null || typeof value !== 'object') return;
    open.add(path);
    (Array.isArray(value) ? value.map((item, index) => [`${path}[${index}]`, item]) : Object.entries(value).map(([key, item]) => [/^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}["${key.replace(/["\\]/g, '\\$&')}"]`, item])).slice(0, 50).forEach(([child, item]) => visit(item, child, level + 1));
  };
  visit(data, '$', 0);
  return open;
}
