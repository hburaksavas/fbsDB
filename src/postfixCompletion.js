import { lexOracle } from './oracleLexer.js';

const escape = text => String(text).replace(/[\\$}]/g, '\\$&');
export const postfixTemplates = [
  { id: 'in', detail: 'expr IN (…)', build: expr => `${expr} IN (\${1:values})` },
  { id: 'notin', detail: 'expr NOT IN (…)', build: expr => `${expr} NOT IN (\${1:values})` },
  { id: 'isnull', detail: 'expr IS NULL', build: expr => `${expr} IS NULL` },
  { id: 'notnull', detail: 'expr IS NOT NULL', build: expr => `${expr} IS NOT NULL` },
  { id: 'nvl', detail: 'NVL(expr, default)', build: expr => `NVL(${expr}, \${1:default_value})` },
  { id: 'like', detail: "expr LIKE '%…%'", build: expr => `${expr} LIKE '%\${1:text}%'` },
  { id: 'between', detail: 'expr BETWEEN … AND …', build: expr => `${expr} BETWEEN \${1:low} AND \${2:high}` },
  { id: 'upper', detail: 'UPPER(expr)', build: expr => `UPPER(${expr})` },
  { id: 'trim', detail: 'TRIM(expr)', build: expr => `TRIM(${expr})` },
  { id: 'count', detail: 'COUNT(expr)', build: expr => `COUNT(${expr})` },
];

// Receivers must be complete expressions (call, literal or qualified name) so plain alias.column completion is not shadowed.
export function postfixContext(textBefore) {
  const match = /\.([A-Za-z]*)$/.exec(textBefore);
  if (!match) return null;
  const head = textBefore.slice(0, match.index), tokens = lexOracle(head).filter(token => token.kind !== 'comment');
  let end = tokens.length - 1, start = end;
  const last = tokens[end];
  if (!last || last.end !== head.length) return null;
  if (last.value === ')') {
    let depth = 0;
    for (; start >= 0; start--) { if (tokens[start].value === ')') depth++; if (tokens[start].value === '(' && --depth === 0) break; }
    if (start < 0) return null;
    if (tokens[start - 1]?.kind === 'identifier' && tokens[start - 1].end === tokens[start].start) start--;
  } else if (last.kind === 'string' || last.kind === 'number') {
    // A literal is complete on its own.
  } else if (last.kind === 'identifier') {
    while (tokens[start - 1]?.value === '.' && tokens[start - 2]?.kind === 'identifier') start -= 2;
    if (start === end) return null;
  } else return null;
  return { start: tokens[start].start, receiver: head.slice(tokens[start].start), fragment: match[1].toLowerCase() };
}

export function postfixSuggestions(textBefore) {
  const context = postfixContext(textBefore);
  if (!context) return [];
  return postfixTemplates.filter(template => template.id.startsWith(context.fragment)).map(template => ({ ...template, start: context.start, snippet: template.build(escape(context.receiver)) }));
}

// Moves a selected (sub)query into the statement's WITH clause; both name occurrences share one snippet placeholder.
export function extractCteSnippet(statement, start, end) {
  let from = start, to = end;
  const selected = statement.slice(from, to).trim();
  if (!/^\(?\s*(SELECT|WITH)\b/i.test(selected)) return { error: 'Select a SELECT query or a parenthesised subquery.' };
  const leading = statement.slice(0, from).search(/\(\s*$/), trailing = statement.slice(to).search(/^\s*\)/);
  if (!selected.startsWith('(') && leading >= 0 && trailing >= 0) { from = leading; to = to + statement.slice(to).indexOf(')') + 1; }
  const body = statement.slice(from, to).trim().replace(/^\(\s*/, '').replace(/\s*\)$/, '').replace(/;\s*$/, '');
  if (from === 0 && to >= statement.trimEnd().replace(/;$/, '').length) return { error: 'Select a subquery inside a larger statement.' };
  const before = escape(statement.slice(0, from)), after = escape(statement.slice(to)), definition = `\${1:cte_name} AS (\n    ${escape(body).replace(/\n/g, '\n    ')}\n)`;
  if (/^\s*WITH\b/i.test(statement)) {
    // Existing CTEs may be referenced by the extracted query, so the new one goes after the last definition.
    const main = lexOracle(statement).find((token, index, all) => index > 0 && token.depth === 0 && token.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === 'SELECT' && all[index - 1]?.value === ')');
    if (!main || main.start > from) return { error: 'Select a subquery in the main query of the WITH statement.' };
    const cut = statement.slice(0, main.start).trimEnd().length;
    return { snippet: `${escape(statement.slice(0, cut))},\n${definition}\n${escape(statement.slice(cut, from).replace(/^\s+/, ''))}\${1:cte_name}${after}` };
  }
  return { snippet: `WITH ${definition}\n${before}\${1:cte_name}${after}` };
}
