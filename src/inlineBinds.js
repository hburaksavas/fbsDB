import { lexOracle } from './oracleLexer.js';

export const inlineBindTypes = ['VARCHAR2', 'NUMBER', 'DATE', 'TIMESTAMP'];
const booleanLikeName = /^(is|has|can|should|allow|enable[d]?|active|flag)_|_(flag|yn|ind)$|^(active|enabled|deleted|flag)$/i;

// Every :name occurrence of a statement with its offsets, for highlighting; strings and comments are skipped like the bind form does.
export function bindOccurrences(sql) {
  const tokens = lexOracle(sql).filter(token => !['comment', 'string'].includes(token.kind));
  const found = [];
  for (let at = 0; at < tokens.length - 1; at++) {
    const token = tokens[at], next = tokens[at + 1];
    if (token.value !== ':' || tokens[at - 1]?.value === ':' || token.end !== next.start || next.kind !== 'identifier' || next.quoted) continue;
    found.push({ name: next.value.toUpperCase(), start: token.start, end: next.end });
  }
  return found;
}

// Which control a bind gets: dates use a calendar, flag-like names explicit choices, everything else plain text/number input.
export function inputKind(name, type) {
  if (type === 'DATE' || type === 'TIMESTAMP') return 'datetime';
  if (type === 'VARCHAR2' && booleanLikeName.test(String(name))) return 'choice';
  return type === 'NUMBER' ? 'number' : 'text';
}
export const choiceValues = Object.freeze(['Y', 'N', '1', '0']);

// "2026-11-02T10:30" from a calendar control becomes the text form the bind engine parses.
export function datetimeBindText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?$/.exec(text);
  return match ? `${match[1]} ${match[2] || '00:00'}:${match[3] || '00'}` : text;
}

// Values live only in memory, per tab and connection; nothing is written to disk.
export class InlineBindStore {
  constructor() { this.scopes = new Map(); }
  scope(key) { if (!this.scopes.has(key)) this.scopes.set(key, new Map()); return this.scopes.get(key); }
  get(key, name) { return this.scope(key).get(String(name).toUpperCase()); }
  set(key, name, patch) {
    const current = this.get(key, name) || { type: 'VARCHAR2', value: '', isNull: false };
    const next = { ...current, ...patch };
    if (patch.isNull === true) next.value = '';
    if (patch.value !== undefined && patch.value !== '' && patch.isNull === undefined) next.isNull = false;
    this.scope(key).set(String(name).toUpperCase(), next);
    return next;
  }
  clear(key) { this.scopes.delete(key); }
}

// Parameters for a run, or the names still needing a value or an explicit NULL. A repeated bind is one entry, so it is synchronized by construction.
export function inlineBindParameters(names, entries) {
  const parameters = [], missing = [];
  for (const name of names) {
    const entry = entries(name);
    if (!entry || (!entry.isNull && entry.value === '')) { missing.push(name); continue; }
    parameters.push({ name, type: entry.type, value: entry.isNull ? null : entry.type === 'DATE' || entry.type === 'TIMESTAMP' ? datetimeBindText(entry.value) : entry.value });
  }
  return { parameters, missing };
}
