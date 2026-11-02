import { lexOracle } from './oracleLexer.js';

const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;

// Returns the top-level projection items of the outer query block (after any WITH clause) with source offsets.
export function projectionItems(sql) {
  const tokens = lexOracle(String(sql || '')).filter(token => token.kind !== 'comment');
  const select = tokens.findIndex(token => token.depth === 0 && word(token, 'SELECT'));
  if (select < 0) return null;
  const items = [];
  let part = [];
  const finish = () => {
    let expression = part.filter(token => !(token === part[0] && (word(token, 'DISTINCT') || word(token, 'ALL') || word(token, 'UNIQUE'))));
    if (!expression.length) { part = []; return; }
    const as = expression.findIndex(token => token.depth === 0 && word(token, 'AS'));
    let alias = null;
    if (as >= 0) { alias = expression[as + 1] || null; expression = expression.slice(0, as); }
    else if (expression.length >= 2 && expression.at(-1).kind === 'identifier' && expression.at(-2).value !== '.' && expression.at(-2).kind !== 'symbol') { alias = expression.at(-1); expression = expression.slice(0, -1); }
    else if (expression.length >= 2 && expression.at(-1).kind === 'identifier' && expression.at(-2).kind === 'symbol' && expression.at(-2).value === ')') { alias = expression.at(-1); expression = expression.slice(0, -1); }
    const star = expression.at(-1)?.value === '*' && (expression.length === 1 || expression.at(-2)?.value === '.');
    items.push({ start: expression[0].start, end: expression.at(-1).end, alias: alias ? (alias.quoted ? alias.value : alias.value.toUpperCase()) : null, star });
    part = [];
  };
  for (const token of tokens.slice(select + 1)) {
    if (token.depth === 0 && (word(token, 'FROM') || word(token, 'INTO') || token.value === ';')) break;
    if (token.depth === 0 && token.value === ',') finish(); else part.push(token);
  }
  finish();
  return items;
}

// A single star is resolved by position from both ends; several stars only map the prefix.
export function mapProjectionColumns(items, columnCount) {
  const mapped = Array(columnCount).fill(null);
  if (!items?.length) return mapped;
  const stars = items.filter(item => item.star).length;
  if (!stars) { if (items.length === columnCount) items.forEach((item, index) => { mapped[index] = item; }); return mapped; }
  const first = items.findIndex(item => item.star);
  for (let index = 0; index < first && index < columnCount; index++) mapped[index] = items[index];
  if (stars === 1) { const after = items.slice(first + 1); after.forEach((item, offset) => { const column = columnCount - after.length + offset; if (column >= first) mapped[column] = item; }); }
  return mapped;
}

// Projection offsets are only valid while the editor still holds the executed snapshot.
export function projectionRanges(result, documentText) {
  const sql = result?.executedSql, offset = result?.statementOffset;
  if (typeof sql !== 'string' || !Number.isInteger(offset) || typeof result.editorSnapshot !== 'string' || result.editorSnapshot !== documentText) return null;
  const lead = documentText.slice(offset).search(/\S/), base = documentText.indexOf(sql, offset);
  if (base < 0 || base > offset + Math.max(0, lead)) return null;
  return mapProjectionColumns(projectionItems(sql), result.columns?.length || 0).map(item => item && { start: base + item.start, end: base + item.end });
}
