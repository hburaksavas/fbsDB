import { lexOracle } from './oracleLexer.js';

// Explains the CASE expression or analytic function around the caret with made-up, labeled sample rows evaluated here in
// JavaScript by Oracle's rules. The user's SQL is never executed; sample values are illustrations, not data.

const plain = token => token?.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : '';
const word = (token, value) => plain(token) === value;

function matchingClose(tokens, open) {
  let depth = 0;
  for (let k = open; k < tokens.length; k++) { if (tokens[k].value === '(') depth++; else if (tokens[k].value === ')' && --depth === 0) return k; }
  return -1;
}
function matchingOpen(tokens, close) {
  let depth = 0;
  for (let k = close; k >= 0; k--) { if (tokens[k].value === ')') depth++; else if (tokens[k].value === '(' && --depth === 0) return k; }
  return -1;
}
// Splits tokens[from..to) on top-level commas.
function splitList(tokens, from, to) {
  const items = []; let depth = 0, start = from;
  for (let k = from; k < to; k++) { if (tokens[k].value === '(') depth++; else if (tokens[k].value === ')') depth--; else if (!depth && tokens[k].value === ',') { items.push([start, k]); start = k + 1; } }
  if (to > start) items.push([start, to]);
  return items;
}

function caseSpans(tokens) {
  const spans = [], stack = [];
  for (let k = 0; k < tokens.length; k++) {
    const value = plain(tokens[k]);
    if (value === 'CASE' && !word(tokens[k - 1], 'END')) stack.push({ kind: 'CASE', at: k });
    else if (value === 'BEGIN') stack.push({ kind: 'BEGIN', at: k });
    else if ((value === 'IF' || value === 'LOOP') && !word(tokens[k - 1], 'END')) stack.push({ kind: value, at: k });
    else if (value === 'END') {
      const next = plain(tokens[k + 1]);
      const wanted = ['IF', 'LOOP', 'CASE'].includes(next) ? next : null;
      const index = wanted ? stack.map(item => item.kind).lastIndexOf(wanted) : stack.length - 1;
      if (index < 0) continue;
      const [open] = stack.splice(index);
      if (open.kind === 'CASE') spans.push({ from: open.at, to: wanted === 'CASE' ? k + 1 : k, statement: wanted === 'CASE' });
    }
  }
  return spans;
}

function analyticSpans(tokens) {
  const spans = [];
  for (let k = 1; k < tokens.length; k++) {
    if (!word(tokens[k], 'OVER') || tokens[k + 1]?.value !== '(' || tokens[k - 1]?.value !== ')') continue;
    const argsOpen = matchingOpen(tokens, k - 1), close = matchingClose(tokens, k + 1);
    if (argsOpen < 1 || close < 0 || tokens[argsOpen - 1]?.kind !== 'identifier') continue;
    let name = argsOpen - 1; while (tokens[name - 1]?.value === '.' && tokens[name - 2]?.kind === 'identifier') name -= 2;
    spans.push({ from: name, to: close, argsOpen, over: k });
  }
  return spans;
}

const literal = token => token?.kind === 'number' ? Number(token.value) : token?.kind === 'string' ? token.value.slice(1, -1).replace(/''/g, "'") : undefined;

function explainCase(source, tokens, span) {
  const text = (a, b) => source.slice(tokens[a].start, tokens[b - 1].end).trim();
  const end = span.statement ? span.to - 1 : span.to;
  const whens = [], thens = []; let elseAt = -1, depth = 0, nested = 0;
  for (let k = span.from + 1; k < end; k++) {
    if (tokens[k].value === '(') depth++; else if (tokens[k].value === ')') depth--;
    if (depth) continue;
    if (word(tokens[k], 'CASE') && !word(tokens[k - 1], 'END')) nested++; else if (word(tokens[k], 'END') && nested) nested--;
    if (nested) continue;
    if (word(tokens[k], 'WHEN')) whens.push(k); else if (word(tokens[k], 'THEN')) thens.push(k); else if (word(tokens[k], 'ELSE')) elseAt = k;
  }
  const simple = whens[0] > span.from + 1;
  const subject = simple ? text(span.from + 1, whens[0]) : null;
  const branches = whens.map((at, index) => {
    const then = thens[index], stop = whens[index + 1] ?? (elseAt >= 0 ? elseAt : end);
    return { when: text(at + 1, then), then: text(then + 1, stop), whenFrom: at + 1, whenTo: then };
  });
  const otherwise = elseAt >= 0 ? text(elseAt + 1, end) : null;
  const notes = ['The first branch whose condition is true gives the result; later branches are not looked at.', otherwise === null ? (span.statement ? 'There is no ELSE: a value that matches no branch raises CASE_NOT_FOUND.' : 'There is no ELSE: a value that matches no branch gives NULL.') : `Anything else gives ${otherwise}.`];
  let samples = null;
  if (simple) {
    notes.push(`Each WHEN is compared with ${subject} using "=", so a NULL ${subject} never matches, not even WHEN NULL; write a searched CASE with IS NULL for that.`);
    const values = branches.map(branch => branch.whenTo - branch.whenFrom === 1 ? literal(tokens[branch.whenFrom]) : undefined);
    if (values.every(value => value !== undefined)) {
      const other = values.every(value => typeof value === 'number') ? Math.max(...values) + 1 : 'something else';
      samples = { label: subject, rows: [...values, other, null].map(input => { const index = values.findIndex(value => input !== null && value === input); return { input, output: index >= 0 ? branches[index].then : otherwise ?? (span.statement ? 'CASE_NOT_FOUND' : 'NULL'), branch: index >= 0 ? index + 1 : null }; }) };
    }
  } else {
    // Conditions that all compare one name with numbers can be shown on sample values around each number.
    const parsed = branches.map(branch => {
      const parts = tokens.slice(branch.whenFrom, branch.whenTo);
      if (parts.length === 3 && parts[0].kind === 'identifier' && ['>', '<', '='].includes(parts[1].value) && parts[2].kind === 'number') return { name: plain(parts[0]) || parts[0].value, op: parts[1].value, value: Number(parts[2].value) };
      if (parts.length === 4 && parts[0].kind === 'identifier' && ['<', '>'].includes(parts[1].value) && parts[2].value === '=' && parts[3].kind === 'number') return { name: plain(parts[0]) || parts[0].value, op: parts[1].value + '=', value: Number(parts[3].value) };
      if (parts.length === 3 && parts[0].kind === 'identifier' && word(parts[1], 'IS') && word(parts[2], 'NULL')) return { name: plain(parts[0]) || parts[0].value, op: 'IS NULL' };
      return null;
    });
    if (parsed.length && parsed.every(Boolean) && new Set(parsed.map(item => item.name)).size === 1) {
      const test = (condition, value) => condition.op === 'IS NULL' ? value === null : value !== null && ({ '>': value > condition.value, '<': value < condition.value, '=': value === condition.value, '>=': value >= condition.value, '<=': value <= condition.value })[condition.op];
      const inputs = [...new Set(parsed.filter(item => item.op !== 'IS NULL').flatMap(item => [item.value - 1, item.value, item.value + 1]))].sort((a, b) => a - b).slice(0, 9);
      samples = { label: tokens[branches[0].whenFrom].value, rows: [...inputs, null].map(input => { const index = parsed.findIndex(condition => test(condition, input)); return { input, output: index >= 0 ? branches[index].then : otherwise ?? (span.statement ? 'CASE_NOT_FOUND' : 'NULL'), branch: index >= 0 ? index + 1 : null }; }) };
    } else notes.push('Sample values are shown only when every condition compares the same name with a number.');
  }
  return { kind: 'case', title: span.statement ? 'CASE statement' : simple ? 'Simple CASE expression' : 'Searched CASE expression', subject, branches: branches.map(({ when, then }) => ({ when, then })), otherwise, notes, samples };
}

const RANKING = new Set(['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'CUME_DIST', 'PERCENT_RANK']);
const DESCRIPTIONS = {
  ROW_NUMBER: 'Numbers the rows 1, 2, 3… in each partition in the window order. Rows that tie get different numbers in an order Oracle does not guarantee.',
  RANK: 'Rows that tie in the window order share a rank, and the next rank skips the tied places (1, 2, 2, 4).',
  DENSE_RANK: 'Rows that tie share a rank and the next rank follows without a gap (1, 2, 2, 3).',
  NTILE: 'Splits each partition into the given number of buckets of near-equal size; earlier buckets get the extra rows.',
  LAG: 'Returns the value from an earlier row of the partition (1 row back unless an offset is given), or the default (NULL if none) when there is no such row.',
  LEAD: 'Returns the value from a later row of the partition (1 row ahead unless an offset is given), or the default (NULL if none) when there is no such row.',
  SUM: 'Adds the values of the rows in the window frame of each row.', AVG: 'Averages the values in the window frame of each row; NULLs are ignored.',
  COUNT: 'Counts the rows (COUNT(*)) or non-NULL values in the window frame of each row.', MIN: 'The smallest value in the window frame of each row.', MAX: 'The largest value in the window frame of each row.',
  FIRST_VALUE: 'The value of the first row of the window frame.', LAST_VALUE: 'The value of the last row of the window frame; with the default frame that is the current row or its last tie, not the end of the partition.',
  CUME_DIST: 'The fraction of partition rows ordered at or before the current row.', PERCENT_RANK: '(rank - 1) / (rows in partition - 1).',
};

function frameBound(tokens, k) {
  if (word(tokens[k], 'UNBOUNDED')) return { bound: word(tokens[k + 1], 'PRECEDING') ? 'unbounded preceding' : 'unbounded following', next: k + 2 };
  if (word(tokens[k], 'CURRENT') && word(tokens[k + 1], 'ROW')) return { bound: 'current row', next: k + 2 };
  if (tokens[k]?.kind === 'number') return { bound: word(tokens[k + 1], 'PRECEDING') ? 'preceding' : 'following', offset: Number(tokens[k].value), next: k + 2 };
  return null;
}
const boundText = bound => bound.offset != null ? `${bound.offset} ${bound.bound}` : bound.bound;

function explainAnalytic(source, tokens, span) {
  const text = (a, b) => source.slice(tokens[a].start, tokens[b - 1].end).trim();
  const name = source.slice(tokens[span.from].start, tokens[span.argsOpen - 1].end).toUpperCase().replace(/\s+/g, '');
  const fn = name.split('.').pop();
  const args = splitList(tokens, span.argsOpen + 1, span.over - 1).map(([a, b]) => text(a, b));
  const overClose = span.to;
  let k = span.over + 2, partitionBy = [], orderBy = [], frame = null;
  const clauseEnd = from => { let depth = 0; for (let at = from; at < overClose; at++) { if (tokens[at].value === '(') depth++; else if (tokens[at].value === ')') depth--; else if (!depth && ['ORDER', 'ROWS', 'RANGE', 'GROUPS'].includes(plain(tokens[at]))) return at; } return overClose; };
  if (word(tokens[k], 'PARTITION') && word(tokens[k + 1], 'BY')) { const end = clauseEnd(k + 2); partitionBy = splitList(tokens, k + 2, end).map(([a, b]) => text(a, b)); k = end; }
  if (word(tokens[k], 'ORDER') && word(tokens[k + 1], 'BY')) {
    const end = clauseEnd(k + 2);
    orderBy = splitList(tokens, k + 2, end).map(([a, b]) => { let last = b; const nulls = word(tokens[last - 2], 'NULLS') ? (last -= 2, plain(tokens[last + 1])) : null; const desc = word(tokens[last - 1], 'DESC'); if (desc || word(tokens[last - 1], 'ASC')) last--; return { expr: text(a, last), desc, nulls }; });
    k = end;
  }
  if (['ROWS', 'RANGE', 'GROUPS'].includes(plain(tokens[k]))) {
    const unit = plain(tokens[k]);
    if (word(tokens[k + 1], 'BETWEEN')) { const start = frameBound(tokens, k + 2), end = start && word(tokens[start.next], 'AND') ? frameBound(tokens, start.next + 1) : null; if (start && end) frame = { unit, start, end, explicit: true }; }
    else { const start = frameBound(tokens, k + 1); if (start) frame = { unit, start, end: { bound: 'current row' }, explicit: true }; }
    if (!frame) frame = { unit, text: text(k, overClose), unsupported: true, explicit: true };
  }
  const usesFrame = !RANKING.has(fn);
  if (usesFrame && !frame) frame = orderBy.length ? { unit: 'RANGE', start: { bound: 'unbounded preceding' }, end: { bound: 'current row' }, explicit: false } : { unit: 'ROWS', start: { bound: 'unbounded preceding' }, end: { bound: 'unbounded following' }, explicit: false };
  const notes = [];
  notes.push(partitionBy.length ? `Rows are split into partitions by ${partitionBy.join(', ')}; the function starts over in each partition.` : 'There is no PARTITION BY: all rows of the result form one partition.');
  notes.push(orderBy.length ? `Within a partition rows are taken in the order ${orderBy.map(item => `${item.expr}${item.desc ? ' DESC' : ''}`).join(', ')}.` : 'There is no ORDER BY in the window, so the order of rows inside a partition is not defined.');
  if (usesFrame && frame && !frame.unsupported) notes.push(`${frame.explicit ? 'Window frame' : 'Default window frame'}: ${frame.unit} BETWEEN ${boundText(frame.start).toUpperCase()} AND ${boundText(frame.end).toUpperCase()}${frame.explicit ? '' : orderBy.length ? ' (with ORDER BY, rows that tie with the current row are included)' : ' (without ORDER BY, the whole partition)'}.`);
  if (!usesFrame && frame?.explicit) notes.push(`${fn} ignores the window frame.`);
  const sample = simulate(fn, args, partitionBy, orderBy, frame);
  if (!sample) notes.push('No sample is calculated for this function or frame.');
  return { kind: 'analytic', title: `Analytic function ${fn}`, fn, args, partitionBy, orderBy, frame: usesFrame ? frame : null, description: DESCRIPTIONS[fn] || 'An aggregate or analytic function evaluated per row over its window.', notes, sample };
}

// Sample rows: two partitions, a tie in the order key, and a separate value column when the argument is not the order key.
function simulate(fn, args, partitionBy, orderBy, frame) {
  if (!DESCRIPTIONS[fn] || ['CUME_DIST', 'PERCENT_RANK'].includes(fn) || frame?.unsupported) return null;
  const order = orderBy[0], valueExpr = args[0] && args[0] !== '*' && !['NTILE'].includes(fn) ? args[0] : null;
  const ownValue = valueExpr && valueExpr.toUpperCase() !== order?.expr.toUpperCase();
  const base = [['A', 10, 3], ['A', 20, 1], ['A', 20, 4], ['A', 30, 1], ['B', 5, 5], ['B', 15, 9]];
  const rows = base.map(([p, o, v], index) => ({ id: index + 1, p: partitionBy.length ? p : null, o: order ? o : null, v: ownValue ? v : o }));
  const partitions = new Map();
  for (const row of rows) { const list = partitions.get(row.p) || []; list.push(row); partitions.set(row.p, list); }
  const compare = (a, b) => order ? (order.desc ? b.o - a.o : a.o - b.o) : 0;
  const ordered = [];
  for (const list of partitions.values()) {
    list.sort(compare);
    const groups = []; for (const row of list) { if (!groups.length || compare(groups.at(-1).at(-1), row) !== 0) groups.push([]); groups.at(-1).push(row); row.group = groups.length - 1; }
    list.forEach((row, index) => {
      row.position = index;
      const frameRows = frameOf(list, index, frame, order);
      row.frame = frameRows;
      row.result = evaluate(fn, args, list, index, frameRows, groups, order);
    });
    ordered.push(...list);
  }
  const current = ordered.find(row => row.p === (partitionBy.length ? 'A' : null) && row.position === 2) || ordered[0];
  const columns = [...(partitionBy.length ? [{ key: 'p', label: partitionBy.join(', ') }] : []), ...(order ? [{ key: 'o', label: order.expr }] : []), ...(ownValue ? [{ key: 'v', label: valueExpr }] : []), { key: 'result', label: `${fn}(${args.join(', ')})` }];
  return { columns, rows: ordered.map(row => ({ id: row.id, p: row.p, o: row.o, v: row.v, result: row.result, inFrame: frame && !RANKING.has(fn) ? current.frame.includes(row) : null })), current: frame && !RANKING.has(fn) ? current.id : null };
}

function frameOf(list, index, frame, order) {
  if (!frame) return list;
  const position = (bound, edge) => {
    if (bound.bound === 'unbounded preceding') return 0;
    if (bound.bound === 'unbounded following') return list.length - 1;
    if (frame.unit === 'ROWS') return bound.bound === 'current row' ? index : bound.bound === 'preceding' ? index - bound.offset : index + bound.offset;
    if (frame.unit === 'GROUPS' || bound.bound === 'current row' || !order) {
      const shift = bound.bound === 'current row' ? 0 : bound.bound === 'preceding' ? -bound.offset : bound.offset, group = list[index].group + shift;
      const members = list.filter(row => row.group === group);
      if (!members.length) return edge === 'start' ? (shift < 0 ? 0 : list.length) : (shift < 0 ? -1 : list.length - 1);
      return list.indexOf(edge === 'start' ? members[0] : members.at(-1));
    }
    // RANGE with a numeric offset compares order values.
    const direction = order.desc ? -1 : 1, target = list[index].o + (bound.bound === 'preceding' ? -bound.offset : bound.offset) * direction;
    if (edge === 'start') { const found = list.findIndex(row => (row.o - target) * direction >= 0); return found < 0 ? list.length : found; }
    const found = list.findLastIndex(row => (row.o - target) * direction <= 0); return found;
  };
  const from = Math.max(0, position(frame.start, 'start')), to = Math.min(list.length - 1, position(frame.end, 'end'));
  return from > to ? [] : list.slice(from, to + 1);
}

function evaluate(fn, args, list, index, frameRows, groups, order) {
  const row = list[index];
  if (fn === 'ROW_NUMBER') return index + 1;
  if (fn === 'RANK') return order ? list.findIndex(item => item.group === row.group) + 1 : 1;
  if (fn === 'DENSE_RANK') return order ? row.group + 1 : 1;
  if (fn === 'NTILE') { const n = Number(args[0]) || 1, size = Math.floor(list.length / n), extra = list.length % n; let bucket = 0, start = 0; while (bucket < n) { const end = start + size + (bucket < extra ? 1 : 0); if (index < end) return bucket + 1; start = end; bucket++; } return n; }
  if (fn === 'LAG' || fn === 'LEAD') { const offset = Number(args[1] ?? 1) || 1, other = list[index + (fn === 'LAG' ? -offset : offset)]; return other ? other.v : args[2] ?? 'NULL'; }
  const values = frameRows.map(item => item.v);
  if (fn === 'COUNT') return args[0] === '*' ? frameRows.length : values.filter(value => value != null).length;
  if (!values.length) return 'NULL';
  if (fn === 'SUM') return values.reduce((a, b) => a + b, 0);
  if (fn === 'AVG') return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100;
  if (fn === 'MIN') return Math.min(...values);
  if (fn === 'MAX') return Math.max(...values);
  if (fn === 'FIRST_VALUE') return values[0];
  if (fn === 'LAST_VALUE') return values.at(-1);
  return null;
}

// The innermost CASE expression or analytic function that contains the offset, explained; null if there is none.
export function explainExpressionAt(source, offset) {
  const tokens = lexOracle(source).filter(token => token.kind !== 'comment');
  const spans = [...caseSpans(tokens).map(span => ({ ...span, type: 'case' })), ...analyticSpans(tokens).map(span => ({ ...span, type: 'analytic' }))]
    .filter(span => tokens[span.from].start <= offset && offset <= tokens[Math.min(span.to, tokens.length - 1)].end)
    .sort((a, b) => (tokens[a.to].end - tokens[a.from].start) - (tokens[b.to].end - tokens[b.from].start));
  const span = spans[0];
  if (!span) return null;
  const result = span.type === 'case' ? explainCase(source, tokens, span) : explainAnalytic(source, tokens, span);
  return { ...result, start: tokens[span.from].start, end: tokens[Math.min(span.to, tokens.length - 1)].end, text: source.slice(tokens[span.from].start, tokens[Math.min(span.to, tokens.length - 1)].end) };
}
