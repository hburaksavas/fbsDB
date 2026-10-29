import { lexOracle } from './oracleLexer.js';

const word = token => token?.quoted ? '' : token?.value.toUpperCase();
const comparisons = ['=', '<>', '<', '<=', '>', '>=', 'IS NULL', 'IS NOT NULL', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE', 'BETWEEN', 'NOT BETWEEN'];

// Conservative predicate state for incomplete SQL. Unknown constructs fall back
// to expression completion; no literal or bind value is ever guessed.
export function sqlExpectation(context) {
  if (context.plsql || context.relation || context.qualifier || context.bind || !['WHERE', 'ON', 'HAVING'].includes(context.clause)) return null;
  const tokens = lexOracle(context.source.slice(context.scope.start, context.start)).filter(t => t.kind !== 'comment');
  const clauseIndex = tokens.findLastIndex(t => t.depth === 0 && word(t) === context.clause);
  if (clauseIndex < 0) return null;
  let tail = tokens.slice(clauseIndex + 1);
  // Work within the innermost still-open parentheses, including function args.
  const opens = [];
  for (let i = 0; i < tail.length; i++) {
    if (tail[i].value === '(') opens.push(i);
    if (tail[i].value === ')') opens.pop();
  }
  if (opens.length) {
    const open = opens.at(-1), head = word(tail[open - 1]);
    if (head === 'EXISTS') return { kind: 'keyword', keywords: ['SELECT'] };
    if (head === 'IN') return { kind: 'value', keywords: ['SELECT', 'NULL', 'CASE'] };
    if (head && !['AND', 'OR', 'NOT', '('].includes(head)) return { kind: 'value', keywords: ['CASE', 'NULL'] };
    tail = tail.slice(open + 1);
  }
  // CASE has its own grammar; do not apply predicate operators inside it.
  if (tail.some(t => word(t) === 'CASE')) return null;
  const last = tail.at(-1), previous = tail.at(-2), value = word(last);
  if (!last || ['AND', 'OR'].includes(value)) return { kind: 'expression', keywords: ['NOT', 'EXISTS', 'CASE', 'NULL'] };
  if (value === 'IS') return { kind: 'keyword', keywords: ['NULL', 'NOT NULL'] };
  if (value === 'NOT' && word(previous) === 'IS') return { kind: 'keyword', keywords: ['NULL'] };
  if (value === 'NOT') return { kind: 'keyword', keywords: ['IN', 'LIKE', 'BETWEEN'] };
  if (['=', '<', '>', '!', '+', '-', '*', '/', '|', ',', 'LIKE', 'BETWEEN', 'ESCAPE'].includes(value)) return { kind: 'value', keywords: ['NULL', 'CASE'] };
  const baseDepth = tail[0]?.depth || 0;
  const top = tail.filter(t => t.depth === baseDepth);
  let boundary = -1, betweenAnd = false;
  for (let index = 0; index < top.length; index++) {
    const keyword = word(top[index]);
    if (keyword === 'BETWEEN') betweenAnd = true;
    else if (keyword === 'AND' && betweenAnd) betweenAnd = false;
    else if (keyword === 'AND' || keyword === 'OR') { boundary = index; betweenAnd = false; }
  }
  const segment = top.slice(boundary + 1);
  const between = segment.findLastIndex(t => word(t) === 'BETWEEN');
  if (between >= 0 && !segment.slice(between + 1).some(t => word(t) === 'AND')) return { kind: 'keyword', keywords: ['AND'] };
  const boundaryStart = top[boundary]?.start ?? -1;
  const compared = tail.filter(t => t.start > boundaryStart).some(t => ['=', '<', '>', 'LIKE', 'IN', 'IS', 'BETWEEN', 'EXISTS'].includes(word(t))) || between >= 0;
  return compared ? { kind: 'keyword', keywords: ['AND', 'OR'] } : { kind: 'operator', keywords: comparisons };
}

export function applySqlExpectation(result, settings, formatKeyword) {
  const context = result.context, expectation = sqlExpectation(context);
  if (!expectation) return result;
  context.expectation = expectation.kind;
  if (['keyword', 'operator'].includes(expectation.kind)) result.candidates = [];
  else result.candidates = result.candidates.filter(c => c.kind !== 'keyword' && c.kind !== 'snippet' && c.kind !== 'class');
  for (const [index, label] of expectation.keywords.entries()) {
    if (context.fragment && !label.toLowerCase().startsWith(context.fragment.toLowerCase())) continue;
    const gap = context.start > 0 && !/\s|\(/.test(context.source[context.start - 1]) ? ' ' : '';
    result.candidates.push({ key: 'predicate:' + label, label, kind: 'keyword', rank: ['operator', 'keyword'].includes(expectation.kind) ? index / 100 : 12 + index / 100,
      detail: expectation.kind === 'operator' ? 'SQL comparison' : 'SQL ' + expectation.kind,
      insertText: gap + formatKeyword(label, context.source, settings.keywordCase || 'auto', context.fragment) + ' ', start: context.start, end: context.end });
  }
  return result;
}
