import { lexOracle } from './oracleLexer.js';
import { getSqlStatements } from './sqlStatements.js';

const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;

// Splits a parenthesised list at its own depth; empty slots keep their position so missing values stay visible.
function list(tokens, open) {
  const depth = tokens[open].depth, items = [];
  let part = [], slotStart = tokens[open].end, close = -1;
  for (let i = open + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === 'comment') continue;
    if (token.value === ')' && token.depth === depth) { close = i; break; }
    if (token.value === ',' && token.depth === depth + 1) { items.push({ tokens: part, slotStart, slotEnd: token.start }); part = []; slotStart = token.end; continue; }
    part.push(token);
  }
  if (close < 0) return null;
  items.push({ tokens: part, slotStart, slotEnd: tokens[close].start });
  return { items: items.map(item => ({ start: item.tokens[0]?.start ?? item.slotStart, end: item.tokens.at(-1)?.end ?? item.slotStart, slotStart: item.slotStart, slotEnd: item.slotEnd, text: item.tokens.map(token => token.value).join(''), empty: !item.tokens.length })), open: tokens[open].start, close: tokens[close].end, closeIndex: close };
}

// Finds the INSERT … (columns) VALUES (values) around an offset of the document.
export function insertPairsAt(text, offset) {
  const statement = getSqlStatements(text).find(item => item.start <= offset && offset <= item.end + 1);
  if (!statement) return null;
  const base = statement.start, tokens = lexOracle(text.slice(base, statement.end)).map(token => ({ ...token, start: token.start + base, end: token.end + base }));
  const insert = tokens.map((token, index) => word(token, 'INSERT') && token.start <= offset ? index : -1).filter(index => index >= 0).at(-1);
  if (insert == null || !word(tokens[insert + 1], 'INTO')) return null;
  const depth = tokens[insert].depth, columnsOpen = tokens.findIndex((token, index) => index > insert && token.value === '(' && token.depth === depth);
  if (columnsOpen < 0 || tokens.slice(insert + 2, columnsOpen).some(token => token.depth !== depth || ['VALUES', 'SELECT'].some(keyword => word(token, keyword)))) return null;
  const columns = list(tokens, columnsOpen);
  if (!columns || !word(tokens[columns.closeIndex + 1], 'VALUES') || tokens[columns.closeIndex + 2]?.value !== '(') return null;
  const values = list(tokens, columns.closeIndex + 2);
  if (!values) return null;
  const names = columns.items.map(item => ({ ...item, name: item.text.replace(/^"|"$/g, '') }));
  const locate = (items, from, to) => offset >= from && offset <= to ? items.findIndex(item => offset >= item.slotStart && offset <= item.slotEnd) : -1;
  const columnIndex = locate(names, columns.open, columns.close), valueIndex = locate(values.items, values.open, values.close);
  return { columns: names, values: values.items, index: columnIndex >= 0 ? columnIndex : valueIndex, side: columnIndex >= 0 ? 'columns' : valueIndex >= 0 ? 'values' : null, mismatch: names.length !== values.items.length };
}

export function bindPlaceholder(name) {
  const clean = String(name).replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, 'c$1').toLowerCase();
  return `:${clean || 'value'}`;
}
