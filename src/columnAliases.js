import { lexOracle } from './oracleLexer.js';

export const columnAliasStorageKey = 'fbsdb.results.columnAliases';
export const columnAliasLimits = { templates: 200, aliases: 200, label: 128 };

// Stable across projection changes: the original name plus its ordinal among same-named columns.
export function columnAliasKey(columns, index) {
  const name = String(columns[index]?.name ?? '');
  let ordinal = 0;
  for (let i = 0; i <= index; i++) if (String(columns[i]?.name ?? '') === name) ordinal++;
  return `${name}#${ordinal}`;
}

// Identifies the query template without storing SQL: comments and whitespace are ignored, bind names are kept.
export function queryTemplateFingerprint(sql) {
  const text = lexOracle(String(sql || '')).filter(token => token.kind !== 'comment')
    .map(token => token.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : token.kind === 'identifier' ? `"${token.value}"` : token.value).join(' ');
  if (!text) return '';
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); a = Math.imul(a ^ code, 0x01000193) >>> 0; b = Math.imul(b ^ code, 0x5bd1e995) >>> 0; }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

export function normalizeAliasLabel(label) {
  return String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, columnAliasLimits.label);
}

export function resolveColumnAliases(columns, aliases = {}) {
  const keys = columns.map((_, index) => columnAliasKey(columns, index)), present = new Set(keys);
  return { labels: keys.map(key => aliases[key] || null), stale: Object.keys(aliases).filter(key => !present.has(key)) };
}

function readStore(storage) {
  try { const value = JSON.parse(storage?.getItem(columnAliasStorageKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

export function loadTemplateAliases(storage, fingerprint) {
  const entry = fingerprint ? readStore(storage)[fingerprint] : null;
  return entry?.aliases && typeof entry.aliases === 'object' ? entry.aliases : {};
}

export function saveTemplateAlias(storage, fingerprint, key, label, now = Date.now()) {
  if (!fingerprint) return {};
  const store = readStore(storage), aliases = { ...(store[fingerprint]?.aliases || {}) }, text = normalizeAliasLabel(label);
  if (text) aliases[key] = text; else delete aliases[key];
  const limited = Object.fromEntries(Object.entries(aliases).slice(-columnAliasLimits.aliases));
  if (Object.keys(limited).length) store[fingerprint] = { aliases: limited, updated: now }; else delete store[fingerprint];
  const kept = Object.fromEntries(Object.entries(store).sort((x, y) => (y[1]?.updated || 0) - (x[1]?.updated || 0)).slice(0, columnAliasLimits.templates));
  try { storage?.setItem(columnAliasStorageKey, JSON.stringify(kept)); } catch { /* aliases still apply for this session */ }
  return limited;
}
