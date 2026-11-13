import { lexOracle } from './oracleLexer.js';

// Maps bind variables to the column they stand for, so the bind form can say "p1 - ACCOUNT_ID".
// A wrong column name is worse than none: a bind gets a column only when every use of it
// points at the same single column. Anything else (expressions, PL/SQL, IN lists) stays unnamed.
const statementStarts = new Set(['SELECT', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', '(']);
const beforeColumn = new Set(['WHERE', 'AND', 'OR', 'SET', 'ON', 'HAVING', 'WHEN', 'NOT', ',', '(']);
const afterBind = new Set(['+', '-', '*', '/', '|', '.', '(', '[', ':', '=', '<', '>', '!', '^', '@', '%']);
const comparisons = new Set(['=', '!=', '<>', '^=', '<', '>', '<=', '>=']);
const notColumns = new Set(['ROWNUM', 'LEVEL', 'SYSDATE', 'SYSTIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'LOCALTIMESTAMP', 'USER', 'NULL', 'END', 'PRIOR', 'ROWID']);

const word = token => token && token.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : '';
const symbol = (token, value) => Boolean(token) && token.kind === 'symbol' && token.value === value;
const columnName = token => token.quoted ? token.value : token.value.toUpperCase();
const isBindAt = (tokens, at) => symbol(tokens[at], ':') && !symbol(tokens[at - 1], ':') && tokens[at + 1]?.kind === 'identifier' && !tokens[at + 1].quoted && tokens[at].end === tokens[at + 1].start;

// Index of the "(" that opens the ")" at `close`, or of the ")" that closes the "(" at `open`.
function matchingParen(tokens, at, step) {
  const other = step < 0 ? '(' : ')';
  for (let index = at + step; index >= 0 && index < tokens.length; index += step) if (symbol(tokens[index], other) && tokens[index].depth === tokens[at].depth) return index;
  return -1;
}

// Splits the tokens between two parentheses at their top-level commas.
function listItems(tokens, open, close) {
  const items = [[]];
  for (let index = open + 1; index < close; index++) {
    if (symbol(tokens[index], ',') && tokens[index].depth === tokens[open].depth + 1) items.push([]);
    else items.at(-1).push(index);
  }
  return items;
}

// INSERT ... (COL_A, COL_B) VALUES (:a, :b): binds that are a whole value take the column at the same position.
function insertColumns(tokens, found) {
  for (let at = 1; at < tokens.length - 1; at++) {
    if (word(tokens[at]) !== 'VALUES' || !symbol(tokens[at - 1], ')') || !symbol(tokens[at + 1], '(')) continue;
    const columnsOpen = matchingParen(tokens, at - 1, -1);
    if (columnsOpen < 0) continue;
    const columns = listItems(tokens, columnsOpen, at - 1);
    if (!columns.every(item => item.length === 1 && tokens[item[0]].kind === 'identifier')) continue;
    for (let open = at + 1; symbol(tokens[open], '(');) {
      const close = matchingParen(tokens, open, 1);
      if (close < 0) break;
      const values = listItems(tokens, open, close);
      if (values.length === columns.length) values.forEach((item, position) => {
        if (item.length === 2 && isBindAt(tokens, item[0])) found.set(item[0], columnName(tokens[columns[position][0]]));
      });
      // Oracle 23ai accepts several rows: VALUES (...), (...)
      open = symbol(tokens[close + 1], ',') ? close + 2 : -1;
    }
  }
}

// COLUMN = :bind (also <, >, <=, >=, <>, !=, ^=, [NOT] LIKE) where both sides are complete operands.
function comparedColumn(tokens, at) {
  if (afterBind.has(tokens[at + 2]?.kind === 'symbol' ? tokens[at + 2].value : '')) return null;
  let before = at - 1;
  if (word(tokens[before]) === 'LIKE') { before--; if (word(tokens[before]) === 'NOT') before--; }
  else {
    let operator = '';
    while (before >= 0 && tokens[before].kind === 'symbol' && '=<>!^'.includes(tokens[before].value) && operator.length < 2) operator = tokens[before--].value + operator;
    if (!comparisons.has(operator)) return null;
  }
  const column = tokens[before];
  if (!column || column.kind !== 'identifier' || !column.quoted && notColumns.has(word(column))) return null;
  // Skip the qualifier: alias.COLUMN or OWNER.TABLE.COLUMN
  let start = before;
  while (symbol(tokens[start - 1], '.') && tokens[start - 2]?.kind === 'identifier') start -= 2;
  const lead = tokens[start - 1];
  if (lead && !beforeColumn.has(lead.kind === 'symbol' ? lead.value : word(lead))) return null;
  return columnName(column);
}

// Returns { BIND: { text, column } } for every bind in a statement; text keeps the spelling used in the SQL,
// column is '' when no single column can be named.
export function getBindColumns(sql) {
  const tokens = lexOracle(String(sql || '')).filter(token => token.kind !== 'comment');
  const plainSql = statementStarts.has(tokens[0]?.kind === 'symbol' ? tokens[0].value : word(tokens[0]));
  const inserted = new Map();
  if (plainSql) insertColumns(tokens, inserted);
  const binds = {};
  for (let at = 0; at < tokens.length - 1; at++) {
    if (!isBindAt(tokens, at)) continue;
    const name = tokens[at + 1].value.toUpperCase();
    const bind = binds[name] ||= { text: tokens[at + 1].value, columns: new Set() };
    // "(:p IS NULL OR COL = :p)" is a common optional filter; the IS NULL test names no column and hides none.
    if (word(tokens[at + 2]) === 'IS' && !inserted.has(at)) continue;
    bind.columns.add(plainSql ? inserted.get(at) ?? comparedColumn(tokens, at) : null);
  }
  return Object.fromEntries(Object.entries(binds).map(([name, { text, columns }]) => {
    const [column] = columns;
    return [name, { text, column: columns.size === 1 && column ? column : '' }];
  }));
}

export const bindLabel = bind => bind.column ? `${bind.text} - ${bind.column}` : bind.text;
