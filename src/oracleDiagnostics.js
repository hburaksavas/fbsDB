import { lexOracle } from './oracleLexer.js';
import { parsePlsql } from './plsqlStructure.js';
import { isPlsqlSource } from './sqlFormatter.js';

export function oracleDiagnostics(source) {
  const tokens = lexOracle(source), diagnostics = [], stack = [];
  const add = (token, message, severity = 'error') => diagnostics.push({ start: token.start, end: token.end, message, severity, source: 'SQL lint' });
  for (const token of tokens) {
    if (token.open && token.kind !== 'comment') add(token, token.kind === 'string' ? 'Unclosed string literal.' : 'Unclosed quoted identifier.');
    if (token.open && token.kind === 'comment' && source.startsWith('/*', token.start)) add(token, 'Unclosed block comment.');
    if (token.kind !== 'symbol') continue;
    if (token.value === '(') stack.push(token);
    if (token.value === ')') { if (stack.length) stack.pop(); else add(token, 'Unexpected closing parenthesis.'); }
  }
  for (const token of stack) add(token, 'Unclosed parenthesis.');
  const sql = tokens.filter(token => !['comment', 'string'].includes(token.kind));
  for (let at = 0; at < sql.length; at++) {
    const token = sql[at], next = sql[at + 1];
    if (!token.quoted && token.value.toUpperCase() === 'SELECT' && next?.value === '*') add(next, 'Select explicit columns when possible to avoid unnecessary data and schema changes.', 'warning');
    if (token.value === '=' && next?.value.toUpperCase() === 'NULL' && !next.quoted || ['!', '<'].includes(token.value) && ['=', '>'].includes(next?.value) && sql[at + 2]?.value.toUpperCase() === 'NULL') add(next?.value === 'NULL' ? next : sql[at + 2], 'Compare null values with IS NULL or IS NOT NULL.', 'warning');
    if (!token.quoted && token.value.toUpperCase() === 'WHERE' && (!next || next.value === ';')) add(token, 'WHERE clause is missing its predicate.');
  }
  if (isPlsqlSource(source) && !diagnostics.some(item => item.severity === 'error')) {
    const tree = parsePlsql(source);
    // The tolerant structural parser is not an Oracle compiler. Unsupported
    // constructs stay unmarked; native compiler diagnostics are authoritative.
    if (!tree.complete && tree.errors.some(message => message === 'Missing END.')) diagnostics.push({ start: source.length, end: source.length, message: 'PL/SQL block is not closed with END.', severity: 'warning', source: 'PL/SQL structure' });
  }
  return [...new Map(diagnostics.map(item => [item.start + ':' + item.message, item])).values()].slice(0, 100);
}
