import { lexOracle } from './oracleLexer.js';
import { parsePlsql } from './plsqlStructure.js';

// A preview of the SQL text that EXECUTE IMMEDIATE, OPEN ... FOR <string> and DBMS_SQL.PARSE would run, built from the
// source only. String literals, CHR(n) and variables whose value is a resolvable expression are joined; anything else
// (function calls, parameters, values assigned in other routines) stays as a marked «placeholder». Nothing is executed.
// A variable's value is its last assignment written before the statement in the same routine, or its declaration;
// branches and loops are not followed, so the preview shows one possible text and says which assignment it used.

const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;
const key = token => token.quoted ? token.value : token.value.toUpperCase();
const STOP = new Set(['INTO', 'USING', 'RETURNING', 'RETURN', 'BULK']);
const MAX_DEPTH = 6;

function stringValue(token) {
  const text = token.value;
  const q = /^[nN]?[qQ]'(.)/.exec(text);
  if (q) return text.slice(q[0].length, -2);
  return text.replace(/^[nN]?'/, '').slice(0, -1).replace(/''/g, "'");
}

// Splits tokens[from..to) on top-level "||".
function concatenation(tokens, from, to) {
  const parts = []; let depth = 0, start = from;
  for (let k = from; k < to; k++) {
    if (tokens[k].value === '(') depth++; else if (tokens[k].value === ')') depth--;
    else if (!depth && tokens[k].value === '|' && tokens[k + 1]?.value === '|') { parts.push([start, k]); start = k + 2; k++; }
  }
  parts.push([start, to]);
  return parts.filter(([a, b]) => b > a);
}

// The end of an expression: ";" or a clause keyword at its own depth.
function expressionEnd(tokens, from, stops = STOP) {
  let depth = 0;
  for (let k = from; k < tokens.length; k++) {
    const token = tokens[k];
    if (token.value === '(') depth++;
    else if (token.value === ')') { if (!depth) return k; depth--; }
    else if (!depth && (token.value === ';' || token.value === ',' && stops === null || stops && token.kind === 'identifier' && !token.quoted && stops.has(token.value.toUpperCase()))) return k;
  }
  return tokens.length;
}

export function dynamicSqlSites(source) {
  const all = lexOracle(source), tokens = all.filter(token => token.kind !== 'comment');
  const model = parsePlsql(source);
  const lineAt = offset => source.slice(0, offset).split('\n').length;
  const scopeAt = offset => (model.scopes || []).filter(scope => scope.start <= offset && offset <= scope.end).sort((a, b) => b.start - a.start);
  const textOf = (from, to) => source.slice(tokens[from].start, tokens[to - 1].end);

  // The value expression of a variable at an offset: last "name := ..." before it in the innermost scope that declares it, else its initializer.
  const valueOf = (name, offset) => {
    for (const scope of scopeAt(offset)) {
      const symbol = scope.symbols?.find(item => item.key === name && item.start < offset);
      if (!symbol) continue;
      if (symbol.kind === 'parameter') return { parameter: true };
      let assignment = null;
      for (let k = 0; k < tokens.length && tokens[k].start < offset; k++) {
        if (tokens[k].start < scope.start || tokens[k].kind !== 'identifier' || key(tokens[k]) !== name || tokens[k - 1]?.value === '.') continue;
        if (tokens[k + 1]?.value === ':' && tokens[k + 2]?.value === '=' && tokens[k].start > symbol.start) assignment = { from: k + 3, line: lineAt(tokens[k].start), kind: 'assignment' };
      }
      if (assignment) return { ...assignment, to: expressionEnd(tokens, assignment.from, new Set()) };
      const at = tokens.findIndex(token => token.start === symbol.start);
      let k = at + 1;
      while (k < tokens.length && tokens[k].value !== ';' && !(tokens[k].value === ':' && tokens[k + 1]?.value === '=') && !word(tokens[k], 'DEFAULT')) k++;
      if (tokens[k]?.value === ';' || k >= tokens.length) return { unassigned: true };
      const from = tokens[k].value === ':' ? k + 2 : k + 1;
      return { from, to: expressionEnd(tokens, from, new Set()), line: lineAt(tokens[at].start), kind: 'declaration' };
    }
    return null;
  };

  const resolve = (from, to, offset, depth, used) => {
    const pieces = [];
    for (const [a, b] of concatenation(tokens, from, to)) {
      const first = tokens[a], text = textOf(a, b);
      if (b - a === 1 && first.kind === 'string') { pieces.push({ text: stringValue(first), resolved: true }); continue; }
      if (b - a === 1 && first.kind === 'number') { pieces.push({ text: first.value, resolved: true }); continue; }
      if (word(first, 'CHR') && tokens[a + 1]?.value === '(' && tokens[a + 2]?.kind === 'number' && tokens[a + 3]?.value === ')' && b - a === 4) { pieces.push({ text: String.fromCharCode(Number(tokens[a + 2].value)), resolved: true }); continue; }
      if (first.value === '(' && tokens[b - 1].value === ')' && expressionEnd(tokens, a + 1, null) === b - 1) { pieces.push(...resolve(a + 1, b - 1, offset, depth, used)); continue; }
      if (b - a === 1 && first.kind === 'identifier' && depth < MAX_DEPTH && !used.has(key(first))) {
        const value = valueOf(key(first), first.start);
        if (value?.from != null) {
          used.add(key(first));
          const inner = resolve(value.from, value.to, tokens[value.from]?.start ?? offset, depth + 1, used);
          used.delete(key(first));
          pieces.push(...inner.map(piece => ({ ...piece, via: piece.via || `${first.value} (${value.kind}, line ${value.line})` })));
          continue;
        }
        pieces.push({ text, resolved: false, reason: value?.parameter ? 'parameter' : value?.unassigned ? 'no value assigned before this point' : 'not declared here' });
        continue;
      }
      let name = a; while (tokens[name + 1]?.value === '.' && tokens[name + 2]?.kind === 'identifier') name += 2;
      pieces.push({ text, resolved: false, reason: first.kind === 'identifier' && tokens[name + 1]?.value === '(' ? 'function result' : 'expression' });
    }
    return pieces;
  };

  const sites = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let kind = null, from = null, keywordEnd = token.end;
    if (word(token, 'EXECUTE') && word(tokens[i + 1], 'IMMEDIATE')) { kind = 'EXECUTE IMMEDIATE'; from = i + 2; keywordEnd = tokens[i + 1].end; }
    else if (word(token, 'OPEN') && tokens[i + 1]?.kind === 'identifier' && word(tokens[i + 2], 'FOR') && !['SELECT', 'WITH'].some(value => word(tokens[i + 3], value)) && tokens[i + 3]?.value !== '(') { kind = 'OPEN FOR'; from = i + 3; keywordEnd = tokens[i + 2].end; }
    else if (word(token, 'DBMS_SQL') && tokens[i + 1]?.value === '.' && word(tokens[i + 2], 'PARSE') && tokens[i + 3]?.value === '(') {
      const comma = expressionEnd(tokens, i + 4, null);
      if (tokens[comma]?.value === ',') { kind = 'DBMS_SQL.PARSE'; from = comma + 1; keywordEnd = tokens[i + 2].end; }
    }
    if (!kind) continue;
    const to = kind === 'DBMS_SQL.PARSE' ? expressionEnd(tokens, from, null) : expressionEnd(tokens, from);
    if (to <= from) continue;
    const pieces = resolve(from, to, token.start, 0, new Set());
    const sql = pieces.map(piece => piece.resolved ? piece.text : `«${piece.text}»`).join('');
    // USING values, anywhere before the statement's ";" (INTO may come first), split on top-level commas.
    const binds = [];
    const statementEnd = kind === 'DBMS_SQL.PARSE' ? to : expressionEnd(tokens, to, new Set());
    const using = tokens.findIndex((item, index) => index >= to && index < statementEnd && word(item, 'USING'));
    if (using >= 0) {
      const end = expressionEnd(tokens, using + 1, new Set(['RETURNING', 'RETURN']));
      for (let k = using + 1; k < end;) { const next = Math.min(expressionEnd(tokens, k, null), end); if (next > k) binds.push(textOf(k, next).replace(/^(IN\s+OUT|IN|OUT)\s+/i, '')); k = next + 1; }
    }
    // Positional binds are matched per occurrence in SQL and per name in a PL/SQL block, so either count is accepted.
    const occurrences = [...sql.replace(/'(?:[^']|'')*'/g, '').matchAll(/:(\w+)/g)].map(match => match[1].toUpperCase());
    const placeholders = [...new Set(occurrences)];
    const unresolved = pieces.filter(piece => !piece.resolved);
    const bindMismatch = !unresolved.length && kind !== 'DBMS_SQL.PARSE' && binds.length !== placeholders.length && binds.length !== occurrences.length;
    sites.push({ kind, start: token.start, end: keywordEnd, line: lineAt(token.start), sql, pieces, unresolved, binds, placeholders, complete: !unresolved.length, bindMismatch });
    i = Math.max(i, statementEnd);
  }
  return sites;
}

export function dynamicSqlAt(source, offset) {
  return dynamicSqlSites(source).find(site => site.start <= offset && offset <= site.end) || null;
}

export function dynamicSqlMarkdown(site) {
  const lines = [`**Dynamic SQL preview** (${site.kind}, not executed)`, '```sql\n' + site.sql + '\n```'];
  if (site.unresolved.length) lines.push(`${site.unresolved.length} part${site.unresolved.length === 1 ? '' : 's'} could not be resolved and ${site.unresolved.length === 1 ? 'is' : 'are'} shown as «…»:\n` + site.unresolved.map(piece => `- \`${piece.text.replace(/`/g, "'")}\`: ${piece.reason}`).join('\n'));
  const via = [...new Set(site.pieces.filter(piece => piece.via).map(piece => piece.via))];
  if (via.length) lines.push('Values taken from: ' + via.join('; ') + '. Branches and loops are not followed.');
  if (site.binds.length || site.placeholders.length) lines.push(`Binds: ${site.placeholders.length ? site.placeholders.map(name => ':' + name).join(', ') : 'none in the text'}${site.binds.length ? ` · USING ${site.binds.join(', ')}` : ''}${site.bindMismatch ? ' · **the number of USING values does not match the placeholders**' : ''}`);
  return lines.join('\n\n');
}
