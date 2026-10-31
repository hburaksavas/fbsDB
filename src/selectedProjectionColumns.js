import { lexOracle } from './oracleLexer.js';

const key = token => token?.quoted ? token.value : token?.value?.toUpperCase();
const word = (token, value) => token?.kind === 'identifier' && !token.quoted && key(token) === value;
const identity = (alias, column) => JSON.stringify([alias, column]);

// Track direct projections, not column names merely mentioned in expressions.
// Aliases identify source instances, so self joins remain independent.
export function selectedProjectionColumns(context, sources) {
  const selected = new Set();
  if (context.clause !== 'SELECT' || !context.scope) return () => false;
  const { start, end, depth } = context.scope;
  const tokens = lexOracle(context.source).filter(token => token.start >= start && token.start < end && token.kind !== 'comment');
  const select = tokens.findIndex(token => word(token, 'SELECT') && token.depth === depth);
  let part = [], segmentStart = tokens[select]?.end;
  const localSources = [...sources].filter(([, item]) => item.ref.scopeDepth === depth);
  const finish = segmentEnd => {
    // Completing/replacing this projection must not mark itself as a duplicate.
    if (context.start >= segmentStart && context.start <= segmentEnd) { part = []; return; }
    let expression = part;
    if (word(expression[0], 'DISTINCT') || word(expression[0], 'ALL')) expression = expression.slice(1);
    const as = expression.findIndex(token => word(token, 'AS') && token.depth === depth);
    if (as >= 0) expression = expression.slice(0, as);
    else if (expression.length >= 2 && expression.at(-1).kind === 'identifier' && expression.at(-2).value !== '.') expression = expression.slice(0, -1);
    const simple = expression.length === 1 && (expression[0].kind === 'identifier' || expression[0].value === '*');
    const qualified = expression.length === 3 && expression[0].kind === 'identifier' && expression[1].value === '.'
      && (expression[2].kind === 'identifier' || expression[2].value === '*');
    if (simple || qualified) {
      const column = expression.at(-1), star = column.value === '*';
      const matches = qualified ? [...sources].filter(([alias]) => alias === key(expression[0]))
        : star ? localSources : localSources.filter(([, item]) => item.object?.columns?.some(candidate => candidate.name === key(column)));
      if (qualified || star || matches.length === 1) for (const [alias, item] of matches) {
        for (const candidate of item.object?.columns || []) if (star || candidate.name === key(column)) selected.add(identity(alias, candidate.name));
      }
    }
    part = [];
  };
  for (const token of tokens.slice(select + 1)) {
    if (token.depth === depth && word(token, 'FROM')) { finish(token.start); break; }
    if (token.depth === depth && token.value === ',') { finish(token.start); segmentStart = token.end; }
    else part.push(token);
  }
  return (alias, column) => selected.has(identity(alias, column));
}
