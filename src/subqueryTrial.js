import { lexOracle } from './oracleLexer.js';
import { getOracleBindNames } from './oracleBinds.js';
import { assertSelectOnly } from './selectOnly.js';
import { impureCalls } from './quickEval.js';

export const trialRowLimit = 20;
const clauseEnd = new Set(['WHERE', 'GROUP', 'HAVING', 'ORDER', 'CONNECT', 'START', 'UNION', 'INTERSECT', 'MINUS', 'MODEL', 'FETCH', 'OFFSET', 'FOR', 'SELECT']);
const reserved = new Set(['ON', 'USING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'OUTER', 'AS', 'LATERAL', 'ONLY', 'PARTITION', 'SAMPLE', 'PIVOT', 'UNPIVOT', 'WHERE', 'GROUP', 'ORDER', 'HAVING']);
const word = token => token?.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : '';

// Names a subquery can legitimately qualify columns with: FROM/JOIN table names and aliases, WITH names and inline-view aliases.
function definedQualifiers(tokens) {
  const names = new Set();
  const add = token => { if (token?.kind === 'identifier') names.add((token.quoted ? token.value : token.value).toUpperCase()); };
  for (let at = 0; at < tokens.length; at++) {
    const key = word(tokens[at]);
    if (['FROM', 'JOIN'].includes(key) || (tokens[at].value === ',' && inFromList(tokens, at))) {
      let cursor = at + 1;
      if (tokens[cursor]?.value === '(') continue; // inline views are named by the alias after their closing parenthesis
      while (tokens[cursor]?.kind === 'identifier' && tokens[cursor + 1]?.value === '.' && tokens[cursor + 2]?.kind === 'identifier') cursor += 2;
      add(tokens[cursor]);
      const next = tokens[cursor + 1];
      if (word(next) === 'AS' && tokens[cursor + 2]) add(tokens[cursor + 2]);
      else if (next?.kind === 'identifier' && !reserved.has(word(next))) add(next);
    }
    if (tokens[at].value === ')' && tokens[at + 1]) {
      const next = tokens[at + 1];
      if (word(next) === 'AS' && tokens[at + 2]) add(tokens[at + 2]);
      else if (next.kind === 'identifier' && !reserved.has(word(next)) && !clauseEnd.has(word(next))) add(next);
    }
    if (word(tokens[at]) === 'WITH' || (tokens[at].value === ',' && tokens[at + 1]?.kind === 'identifier' && word(tokens[at + 2]) === 'AS')) { if (tokens[at + 1]?.kind === 'identifier' && (word(tokens[at + 2]) === 'AS' || tokens[at + 2]?.value === '(')) add(tokens[at + 1]); }
  }
  return names;
}
// A comma belongs to the FROM list when the nearest preceding clause keyword at the same depth is FROM or JOIN.
function inFromList(tokens, at) {
  const depth = tokens[at].depth;
  for (let back = at - 1; back >= 0; back--) {
    if (tokens[back].depth < depth) return false;
    if (tokens[back].depth !== depth) continue;
    const key = word(tokens[back]);
    if (key === 'FROM' || key === 'JOIN') return true;
    if (clauseEnd.has(key)) return false;
  }
  return false;
}

// Qualified references (x.col) whose qualifier is not defined inside the subquery point at the outer query.
export function unresolvedReferences(sql) {
  const tokens = lexOracle(sql).filter(token => token.kind !== 'comment' && token.kind !== 'string');
  const defined = definedQualifiers(tokens), found = [];
  for (let at = 0; at < tokens.length - 2; at++) {
    if (tokens[at].kind !== 'identifier' || tokens[at + 1].value !== '.' || tokens[at + 2].kind !== 'identifier' || tokens[at - 1]?.value === '.') continue;
    if (tokens[at + 3]?.value === '(' || ['FROM', 'JOIN', 'INTO'].includes(word(tokens[at - 1]))) continue; // pkg.func(...) and schema.table
    const qualifier = tokens[at].value.toUpperCase();
    if (!defined.has(qualifier) && !found.includes(tokens[at].value)) found.push(tokens[at].value);
  }
  return found;
}

// Prepares a selected, parenthesised or bare SELECT for an explicit trial run; correlated references are reported, never rewritten.
export function prepareSubqueryTrial(text) {
  let sql = String(text || '').trim().replace(/;\s*$/, '').trim();
  if (!sql) return { error: 'Select a subquery to try.' };
  while (sql.startsWith('(') && sql.endsWith(')') && balanced(sql.slice(1, -1))) sql = sql.slice(1, -1).trim();
  try { assertSelectOnly(sql, 'A trial runs'); } catch (error) { return { error: error.message }; }
  const unresolved = unresolvedReferences(sql);
  if (unresolved.length) return { error: `This subquery refers to ${unresolved.map(name => `${name}.`).join(', ')} from the outer query, so it cannot run on its own. Supply those values as binds instead; the query is not changed for you.`, unresolved };
  const tokens = lexOracle(sql).filter(token => token.kind !== 'comment');
  return { sql, binds: getOracleBindNames(sql), calls: impureCalls(tokens) };
}
function balanced(text) { let depth = 0; for (const token of lexOracle(text)) { if (token.kind !== 'symbol') continue; if (token.value === '(') depth++; if (token.value === ')' && --depth < 0) return false; } return depth === 0; }
