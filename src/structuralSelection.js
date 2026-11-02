import { lexOracle } from './oracleLexer.js';
import { getSqlStatements } from './sqlStatements.js';

const clauseWords = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'ON', 'JOIN', 'SET', 'VALUES', 'INTO', 'UNION', 'MINUS', 'INTERSECT', 'CONNECT', 'START', 'RETURNING', 'USING', 'BY', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'FETCH', 'OFFSET', 'WITH']);
const conditionWords = new Set(['AND', 'OR', 'WHEN', 'THEN', 'ELSE', 'IF', 'ELSIF', 'WHILE', 'END', 'LOOP', 'CASE']);
const blockWords = new Set(['BEGIN', 'DECLARE', 'LOOP', 'THEN', 'ELSE', 'IS', 'AS']);
const word = token => token?.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : null;

// Returns nested [start, end] ranges from the token at the offset outwards: name, condition, list item, parenthesis, statement, block.
export function structuralRanges(text, offset) {
  const statement = getSqlStatements(text).find(item => item.start <= offset && offset <= item.end) || null;
  const base = statement?.start ?? 0, end = statement?.end ?? text.length;
  const tokens = lexOracle(text.slice(base, end)).filter(token => token.kind !== 'comment').map(token => ({ ...token, start: token.start + base, end: token.end + base }));
  const ranges = [], push = (start, stop) => { if (stop > start && !ranges.some(([a, b]) => a === start && b === stop)) ranges.push([start, stop]); };
  let at = tokens.findIndex(token => token.start <= offset && offset <= token.end);
  if (at < 0) at = tokens.findLastIndex(token => token.end <= offset);
  if (at >= 0) {
    const token = tokens[at];
    push(token.start, token.end);
    let first = at, last = at;
    while (tokens[first - 1]?.value === '.' && tokens[first - 2]?.kind === 'identifier') first -= 2;
    while (tokens[last + 1]?.value === '.' && tokens[last + 2]) last += 2;
    push(tokens[first].start, tokens[last].end);
    for (let depth = token.depth; depth >= 0; depth--) {
      const open = tokens.findLastIndex((item, index) => index < first && item.value === '(' && item.depth === depth - 1);
      const close = depth > 0 ? tokens.findIndex((item, index) => index > last && item.value === ')' && item.depth === depth - 1) : tokens.length;
      const inside = (index => index > open && index < close);
      const boundary = (set, direction) => { for (let i = direction < 0 ? first - 1 : last + 1; inside(i); i += direction) { const item = tokens[i]; if (item.depth !== depth) continue; if (item.value === ',' || item.value === ';' || set.has(word(item)) || clauseWords.has(word(item))) return i; } return direction < 0 ? open : close; };
      const condition = [boundary(conditionWords, -1), boundary(conditionWords, 1)];
      if (condition[1] - condition[0] > 1) { first = Math.min(first, condition[0] + 1); last = Math.max(last, condition[1] - 1); push(tokens[first].start, tokens[last].end); }
      const item = [boundary(new Set(), -1), boundary(new Set(), 1)];
      if (item[1] - item[0] > 1) { first = Math.min(first, item[0] + 1); last = Math.max(last, item[1] - 1); push(tokens[first].start, tokens[last].end); }
      if (depth > 0 && open >= 0 && close < tokens.length) {
        if (close - open > 1) push(tokens[open + 1].start, tokens[close - 1].end);
        push(tokens[open].start, tokens[close].end);
        first = open; last = close;
      }
    }
    // PL/SQL bodies: the nearest enclosing block opener at depth 0 up to its END.
    const opener = tokens.findLastIndex((item, index) => index <= first && item.depth === 0 && blockWords.has(word(item)));
    const closer = opener >= 0 ? tokens.findIndex((item, index) => index > last && item.depth === 0 && word(item) === 'END') : -1;
    if (opener >= 0 && closer > opener + 1) push(tokens[opener + 1].start, tokens[closer - 1].end);
  }
  if (statement) push(statement.start, statement.end);
  push(0, text.length);
  return ranges.sort((a, b) => (a[1] - a[0]) - (b[1] - b[0])).filter((range, index, all) => all.slice(0, index).every(inner => inner[0] >= range[0] && inner[1] <= range[1]));
}

// Monaco's Expand/Shrink Selection (Shift+Alt+Right/Left) uses these ranges for SQL models.
export function installStructuralSelection(monaco) {
  return monaco.languages.registerSelectionRangeProvider('sql', {
    provideSelectionRanges(model, positions) {
      if (model.getValueLength() > 500000) return null;
      const text = model.getValue();
      return positions.map(position => structuralRanges(text, model.getOffsetAt(position)).map(([start, end]) => {
        const from = model.getPositionAt(start), to = model.getPositionAt(end);
        return { range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column) };
      }));
    },
  });
}
