import { lexOracle } from './oracleLexer.js';
export { lexOracle } from './oracleLexer.js';
import { plsqlVisibleSymbols } from './plsqlStructure.js';
import catalog from './oracleCatalog.json' with { type: 'json' };
import { getSqlStatements } from './sqlStatements.js';
import { defaultCompletionSettings } from './editorCompletionSettings.js';

const nameKey = token => token?.quoted ? token.value : token?.value?.toUpperCase();
const relationTypes = new Set(['TABLE', 'VIEW', 'MATERIALIZED VIEW', 'SYNONYM']);
const clauseWords = new Set('FROM JOIN WHERE ON HAVING GROUP ORDER CONNECT START MODEL OFFSET FETCH UNION INTERSECT MINUS SET VALUES RETURNING QUALIFY'.split(' '));
const aliasStops = new Set([...clauseWords, ...'INNER LEFT RIGHT FULL CROSS OUTER NATURAL AS SELECT WITH PIVOT UNPIVOT FOR USING WHEN THEN ELSE END AND OR BY ASC DESC NULLS ONLY INTO MATCH_RECOGNIZE'.split(' ')]);
const expressionKeywords = new Set('CASE WHEN THEN ELSE END NULL NOT AND OR IS IN EXISTS BETWEEN LIKE ESCAPE DISTINCT ALL ANY SOME AS OVER PARTITION BY ASC DESC NULLS FIRST LAST KEEP WITHIN GROUP AT TIME ZONE PRIOR CONNECT_BY_ROOT'.split(' '));
const commonClauses = new Set(['FROM', 'WHERE', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION ALL', 'FETCH FIRST', 'CONNECT BY', 'START WITH']);
const noParentheses = new Set(['SYSDATE', 'SYSTIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'LOCALTIMESTAMP', 'DBTIMEZONE', 'SESSIONTIMEZONE', 'CURRENT_USER', 'SESSION_USER', 'SYSTEM_USER', 'USER', 'UID']);
const grammarWords = `SELECT FROM WHERE JOIN INNER LEFT RIGHT FULL CROSS OUTER NATURAL ON USING GROUP ORDER BY HAVING ASC DESC NULLS FIRST LAST WITH RECURSIVE AS UNION ALL INTERSECT MINUS FETCH OFFSET ROWS ONLY NEXT FOR UPDATE OF NOWAIT SKIP LOCKED INSERT INTO VALUES DELETE MERGE MATCHED WHEN THEN SET RETURNING BULK COLLECT LIMIT OVER PARTITION RANGE PRECEDING FOLLOWING UNBOUNDED CURRENT ROW PIVOT UNPIVOT INCLUDE EXCLUDE MODEL MATCH_RECOGNIZE MEASURES PATTERN SUBSET DEFINE SEARCH DEPTH BREADTH CYCLE CONNECT START NOCYCLE PRIOR LATERAL APPLY JSON_TABLE XMLTABLE XMLNAMESPACES COLUMNS PATH EXISTS ERROR EMPTY DEFAULT FORMAT JSON TREAT TRUNCATE CASCADE PURGE ANALYZE EXPLAIN PLAN COMMENT RENAME SAVEPOINT ROLLBACK COMMIT WORK FORCE READ WRITE ISOLATION LEVEL SERIALIZABLE READ COMMITTED CONSTRAINTS DEFERRED IMMEDIATE ALTER SESSION SYSTEM ENABLE DISABLE VALIDATE NOVALIDATE PRIMARY FOREIGN REFERENCES KEY CHECK UNIQUE NOT NULL ADD MODIFY DROP COLUMN TABLE VIEW MATERIALIZED SYNONYM SEQUENCE INDEX PROCEDURE FUNCTION PACKAGE BODY TRIGGER TYPE REPLACE EDITIONABLE NONEDITIONABLE GRANT REVOKE EXECUTE TO IDENTIFIED AUTHID DEFINER CURRENT_USER`.split(/\s+/);


const wordIs = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;
const sqlIdentifier = value => /^[A-Z][A-Z0-9_$#]*$/.test(value) ? value : `"${value.replace(/"/g, '""')}"`;

// Restrict SQL keywords before ranking; PL/SQL keeps its separate vocabulary.
export function sqlKeywordAllowed(context, name) {
  if (context.plsql || !['SELECT', 'WITH', 'UPDATE', 'DELETE', 'INSERT'].includes(context.statementKind)) return true;
  const words = context.clause === 'SELECT' ? ['ALL', 'DISTINCT', 'CASE', 'NULL', 'FROM']
    : ['WHERE', 'ON', 'HAVING'].includes(context.clause) ? ['CASE', 'NULL', 'NOT', 'EXISTS', 'AND', 'OR', 'IS', 'IN', 'BETWEEN', 'LIKE', 'ESCAPE']
    : context.clause === 'ORDER' ? ['ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'CASE', 'NULL']
    : context.clause === 'GROUP' ? ['ROLLUP', 'CUBE', 'GROUPING SETS', 'HAVING', 'CASE', 'NULL'] : null;
  return !words || words.includes(name.toUpperCase());
}

function projectedColumns(tokens, start, end, depth) {
  const top = tokens.filter(token => token.start >= start && token.start < end && token.depth === depth);
  const select = top.findIndex(token => wordIs(token, 'SELECT'));
  if (select < 0) return [];
  const columns = []; let part = [];
  const finish = () => {
    const last = part.at(-1), prev = part.at(-2);
    const simple = part.length === 1, qualified = part.length >= 3 && prev?.value === '.';
    const bareAlias = last?.start > prev?.end && (prev?.value === ')' || prev?.kind === 'number' || prev?.kind === 'identifier');
    if (last?.value === '*' && (part.length === 1 || part.length === 3 && prev?.value === '.')) columns.push({ star: true, qualifier: part.length === 3 ? nameKey(part[0]) : null });
    if (last?.kind === 'identifier' && (simple || qualified || wordIs(prev, 'AS') || bareAlias)) columns.push({ name: nameKey(last) });
    part = [];
  };
  for (const token of top.slice(select + 1)) {
    if (wordIs(token, 'FROM')) { finish(); return columns; }
    if (token.value === ',') finish(); else if (!wordIs(token, 'DISTINCT') && !wordIs(token, 'ALL')) part.push(token);
  }
  finish(); return columns;
}

function sourceRefs(tokens, scope) {
  const refs = [], top = tokens.filter(token => token.depth === scope.depth && token.start >= scope.start && token.start < scope.end);
  let inFrom = false;
  for (let i = 0; i < top.length; i++) {
    const token = top[i];
    const tableStart = wordIs(token, 'FROM') || wordIs(token, 'JOIN') || wordIs(token, 'UPDATE') || wordIs(token, 'INTO') || inFrom && token.value === ',';
    if (!tableStart) { if (clauseWords.has(token.value.toUpperCase()) && !wordIs(token, 'JOIN')) inFrom = false; continue; }
    inFrom = true;
    let at = i + 1, owner = null, name = top[at];
    if (name?.value === '(') {
      const close = top.findIndex((token, index) => index > at && token.value === ')');
      const alias = close < 0 ? null : top[close + 1];
      if (alias?.kind === 'identifier' && (alias.quoted || !aliasStops.has(alias.value.toUpperCase()))) {
        refs.push({ name: alias.value, nameKey: nameKey(alias), alias: alias.value, aliasKey: nameKey(alias), start: name.start, virtual: { type: 'SUBQUERY', projection: { start: name.end, end: top[close].start, depth: name.depth + 1 }, columns: projectedColumns(tokens, name.end, top[close].start, name.depth + 1) } });
        i = close + 1;
      }
      continue;
    }
    if (name?.kind !== 'identifier' || aliasStops.has(name.value.toUpperCase()) && !name.quoted) continue;
    if (top[at + 1]?.value === '.') { owner = name; name = top[at + 2]; at += 2; }
    if (name?.kind !== 'identifier') continue;
    // Function table expressions need their own metadata, not a guessed relation.
    if (top[at + 1]?.value === '(') continue;
    let alias = top[at + 1];
    if (wordIs(alias, 'AS')) alias = top[at + 2];
    if (alias?.kind !== 'identifier' || !alias.quoted && aliasStops.has(alias.value.toUpperCase())) alias = null;
    refs.push({ name: name.value, nameKey: nameKey(name), owner: owner?.value, ownerKey: nameKey(owner), alias: alias?.value, aliasKey: nameKey(alias), aliasStart: alias?.start, start: name.start });
    i = at;
  }
  return refs;
}

function cteDefinitions(tokens, cursor) {
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!wordIs(tokens[i], 'WITH') || tokens[i].start > cursor) continue;
    const withToken = tokens[i]; let at = i + 1;
    while (at < tokens.length) {
      const name = tokens[at]; if (name?.kind !== 'identifier') break;
      let columns = []; at++;
      if (tokens[at]?.value === '(') {
        const close = tokens.findIndex((token, index) => index > at && token.depth === name.depth && token.value === ')');
        if (close < 0) break;
        columns = tokens.slice(at + 1, close).filter(token => token.kind === 'identifier').map(token => ({ name: nameKey(token) })); at = close + 1;
      }
      if (!wordIs(tokens[at], 'AS') || tokens[at + 1]?.value !== '(') break;
      const open = tokens[at + 1], closeIndex = tokens.findIndex((token, index) => index > at + 1 && token.depth === open.depth && token.value === ')');
      const end = closeIndex < 0 ? Infinity : tokens[closeIndex].end;
      if (!columns.length) columns = projectedColumns(tokens, open.end, closeIndex < 0 ? Infinity : tokens[closeIndex].start, open.depth + 1);
      // A CTE belongs to its containing statement, not to a sibling subquery.
      if (name.start <= cursor) result.push({ name: name.value, nameKey: nameKey(name), columns, projection: { start: open.end, end: closeIndex < 0 ? Infinity : tokens[closeIndex].start, depth: open.depth + 1 }, start: name.start, end, depth: withToken.depth, withStart: withToken.start });
      if (closeIndex < 0 || tokens[closeIndex + 1]?.value !== ',') break;
      at = closeIndex + 2;
    }
  }
  return result;
}

export function getOracleCompletionContext(source, cursor = source.length) {
  cursor = Math.max(0, Math.min(source.length, cursor));
  const lexed = lexOracle(source);
  const containing = lexed.find(token => token.start < cursor && (cursor < token.end || cursor === token.end && (token.open || token.kind === 'comment' && source.startsWith('--', token.start))));
  if (containing && ['comment', 'string'].includes(containing.kind)) return { blocked: true, fragment: '', start: cursor, end: cursor };
  let active = lexed.find(token => token.kind === 'identifier' && token.start < cursor && cursor <= token.end);
  if (active && active.end === cursor && !active.quoted && ['FROM', 'JOIN', 'UPDATE', 'INTO'].includes(active.value.toUpperCase())) active = null;
  const quoted = !!active?.quoted;
  const start = active?.start ?? cursor, end = active?.end ?? cursor;
  const fragment = source.slice(start + (quoted ? 1 : 0), cursor).replace(/""/g, '"').replace(/"$/, '');
  const statement = getSqlStatements(source).find(item => item.start <= cursor && cursor <= item.end);
  const statementStart = statement?.start ?? cursor, statementEnd = statement?.end ?? source.length;
  const tokens = lexed.filter(token => token.start >= statementStart && token.end <= statementEnd && !['comment', 'string'].includes(token.kind));
  const prior = tokens.filter(token => token.end <= start), previous = prior.at(-1);
  const scopes = tokens.filter(token => wordIs(token, 'SELECT')).map(token => ({
    start: token.start, depth: token.depth,
    end: tokens.find(next => next.start > token.start && (next.depth < token.depth || next.depth === token.depth && ['UNION', 'INTERSECT', 'MINUS'].some(word => wordIs(next, word))))?.start ?? statementEnd,
  }));
  const scope = scopes.filter(item => item.start <= cursor && cursor <= item.end).sort((a, b) => b.depth - a.depth || b.start - a.start)[0] || { start: statementStart, end: statementEnd, depth: 0 };
  const parents = scopes.filter(item => item.start < scope.start && item.end >= scope.end && item.depth < scope.depth).sort((a, b) => a.depth - b.depth);
  const sourceScopes = [...parents, scope];
  const sources = sourceScopes.flatMap(item => sourceRefs(tokens, item).map(ref => ({ ...ref, scopeDepth: item.depth })));
  const ctes = cteDefinitions(tokens, cursor).filter(cte => cte.depth <= scope.depth && cte.withStart <= scope.start && (cte.depth === 0 || parents.some(parent => parent.depth === cte.depth && parent.start <= cte.withStart && parent.end >= cursor)));
  const topBefore = prior.filter(token => token.depth === scope.depth && token.start >= scope.start);
  const clauseToken = [...topBefore].reverse().find(token => !token.quoted && clauseWords.has(token.value.toUpperCase()) || wordIs(token, 'SELECT'));
  const clause = clauseToken?.value.toUpperCase() || '';
  const qualifierToken = previous?.value === '.' ? prior.at(-2) : null;
  const qualifierPath = [];
  if (qualifierToken) for (let at = prior.length - 2; at >= 0 && prior[at]?.kind === 'identifier'; at -= 2) {
    qualifierPath.unshift({ name: prior[at].value, key: nameKey(prior[at]), start: prior[at].start });
    if (prior[at - 1]?.value !== '.') break;
  }
  const ownerBefore = qualifierToken ? prior.at(-3) : previous;
  const relation = ['FROM', 'JOIN', 'UPDATE', 'INTO'].some(word => wordIs(ownerBefore, word)) || ownerBefore?.value === ',' && ['FROM', 'JOIN'].includes(clause);
  // Query-block local: a WHERE in a sibling/subquery must not affect this FROM.
  // Only source-name positions qualify, never aliases or JOIN predicates.
  const fromSource = relation && ['FROM', 'JOIN'].includes(clause)
    && topBefore.some(token => wordIs(token, 'FROM'))
    && !topBefore.some(token => wordIs(token, 'WHERE'));
  const bind = previous?.value === ':';
  const plsql = tokens.some(token => ['DECLARE', 'BEGIN', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER'].some(word => wordIs(token, word)));
  return {
    blocked: false, fragment, start, end, quoted, relation, fromSource, bind,
    qualifier: qualifierToken?.value, qualifierKey: nameKey(qualifierToken), qualifierPath, clause, scope, sources, ctes,
    expectedKinds: bind ? ['bind'] : relation ? ['relation', 'schema', 'cte'] : qualifierToken ? ['column', 'member'] : ['keyword', 'function', 'column', 'local', 'snippet'],
    locals: plsql ? plsqlVisibleSymbols(source, cursor) : [], plsql,
    statementKind: tokens.find(token => token.kind === 'identifier')?.value.toUpperCase() || '',
    needsLeadingSpace: relation && previous?.end === cursor && previous?.kind === 'identifier' && !active,
    tokens, before: source.slice(statementStart, cursor), source,
  };
}

export function completionMatch(name, fragment, mode = 'prefix', quoted = false) {
  if (!fragment) return 2;
  if (quoted) return name.startsWith(fragment) ? 0 : -1;
  const lower = name.toLowerCase(), query = fragment.toLowerCase();
  if (lower.startsWith(query)) return 0;
  const initials = name.replace(/([a-z])([A-Z])/g, '$1_$2').split(/[_.\s]+/).map(part => part[0] || '').join('').toLowerCase();
  if (initials.startsWith(query)) return 1;
  return mode === 'contains' && lower.includes(query) ? 3 : -1;
}

// Expand only verified source columns, preserving projection order and duplicates.
// The path guard handles recursive CTEs without inventing unknown output columns.
export function resolveCompletionSources(context, objects, currentSchema, onObject = () => {}) {
  const resolve = (ref, path = new Set()) => {
    const cte = !ref.owner && [...context.ctes].reverse().find(item => item.nameKey === ref.nameKey && item.start < ref.start);
    const virtual = ref.virtual || (cte && { ...cte, type: 'CTE' });
    if (virtual) {
      if (path.has(virtual.projection?.start) || path.size >= 16) return { ...virtual, columns: [] };
      const next = new Set(path).add(virtual.projection?.start);
      const refs = virtual.projection ? sourceRefs(context.tokens, virtual.projection) : [];
      const columns = (virtual.columns || []).flatMap(column => {
        if (!column.star) return [column];
        return refs.filter(source => !column.qualifier || (source.aliasKey || source.nameKey) === column.qualifier)
          .flatMap(source => resolve(source, next)?.columns || []);
      });
      return { ...virtual, columns };
    }
    const candidates = objects.filter(item => item.name === ref.nameKey && (!ref.owner || item.owner === ref.ownerKey));
    const object = candidates.find(item => item.owner === currentSchema) || candidates.find(item => item.owner === 'PUBLIC') || (ref.owner ? candidates[0] : undefined);
    if (object) onObject(object);
    return object;
  };
  return new Map(context.sources.map(ref => [ref.aliasKey || ref.nameKey, { ref, object: resolve(ref) }]));
}

export function formatCompletionKeyword(value, source, style = 'auto', typed = '') {
  if (style === 'auto') {
    const keywords = lexOracle(source).filter(token => !token.quoted && ['SELECT', 'FROM', 'WHERE', 'BEGIN', 'DECLARE', 'JOIN', 'CREATE', 'END'].includes(token.value.toUpperCase()));
    const lower = keywords.filter(token => token.value === token.value.toLowerCase()).length;
    style = lower > keywords.length / 2 ? 'lower' : 'upper';
  }
  if (style === 'preserve') {
    if (typed && value.toLowerCase().startsWith(typed.toLowerCase())) return typed + (typed.at(-1) === typed.at(-1).toLowerCase() ? value.slice(typed.length).toLowerCase() : value.slice(typed.length).toUpperCase());
    style = typed && typed === typed.toLowerCase() ? 'lower' : 'upper';
  }
  return style === 'lower' ? value.toLowerCase() : value.toUpperCase();
}

export function getOracleVocabulary(version = 19, liveWords = []) {
  const major = Number.parseInt(String(version), 10) || 19;
  const selected = [...catalog.versions].reverse().find(item => item <= major) || 19;
  const entries = catalog.entries.filter(entry => entry.versions.includes(selected));
  const words = new Map(entries.filter(item => item.kind === 'keyword').map(item => [item.name, item]));
  for (const name of [...grammarWords, ...commonClauses]) if (!words.has(name)) words.set(name, { name, kind: 'keyword', versions: catalog.versions });
  for (const name of liveWords) if (/^[A-Z][A-Z0-9_$#]*$/.test(name)) words.set(name, { name, kind: 'keyword', live: true });
  return [...words.values(), ...entries.filter(item => item.kind !== 'keyword')];
}

const vocabularyCache = new Map();
const liveVocabularyCache = new WeakMap();
function cachedVocabulary(version, words) {
  if (words?.length) {
    const previous = liveVocabularyCache.get(words);
    if (previous?.version === version) return previous.items;
    const items = getOracleVocabulary(version, words); liveVocabularyCache.set(words, { version, items }); return items;
  }
  if (!vocabularyCache.has(version)) vocabularyCache.set(version, getOracleVocabulary(version));
  return vocabularyCache.get(version);
}

export function getOracleCompletions(source, cursor, { settings: supplied = {}, objects = [], currentSchema = '', version = 19, liveWords = [], snippets = [], recent = [] } = {}) {
  const settings = { ...defaultCompletionSettings, ...supplied }, context = getOracleCompletionContext(source, cursor);
  context.currentSchema = currentSchema;
  if (context.blocked || context.bind) return { context, candidates: [] };
  const effectiveVersion = settings.oracleVersion === 'auto' ? version : settings.oracleVersion;
  const vocabulary = cachedVocabulary(effectiveVersion, settings.oracleVersion === 'auto' ? liveWords : []);
  const functionNames = new Set(vocabulary.filter(entry => entry.kind === 'function').map(entry => entry.name));
  const plsqlNames = context.plsql ? new Set(vocabulary.filter(entry => entry.kind === 'plsql').map(entry => entry.name)) : new Set();
  const keywordStyle = settings.keywordCase === 'auto' ? (formatCompletionKeyword('SELECT', source) === 'select' ? 'lower' : 'upper') : settings.keywordCase;
  const candidates = [], seen = new Set();
  const add = (name, kind, rank, detail, extra = {}) => {
    if(({keyword:settings.showKeywords,function:settings.showFunctions,field:settings.showColumns})[kind]===false)return;
    const match = completionMatch(name, context.fragment, settings.matchMode, context.quoted);
    if (match < 0) return;
    const key = `${kind}:${extra.identity || name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const recentIndex = settings.learning !== false && settings.recentFirst ? recent.indexOf(key) : -1;
    candidates.push({ key, label: name, kind, rank: rank + match - (recentIndex < 0 ? 0 : 0.5 / (recentIndex + 1)), detail, insertText: name, start: context.start, end: context.end, ...extra });
  };
  const relations = objects.filter(item => relationTypes.has(item.type) && (settings.schemaScope !== 'current' || context.relation && context.qualifier || !item.owner || item.owner === currentSchema || item.owner === 'PUBLIC'));
  const visibleSources = resolveCompletionSources(context, relations, currentSchema);
  if (context.relation) {
    for (const cte of context.ctes) if (!context.qualifier) add(cte.name, 'class', 0, 'Common table expression', { insertText: sqlIdentifier(cte.nameKey) });
    for (const item of relations) {
      if (context.qualifier && item.owner !== context.qualifierKey) continue;
      const qualify = !context.qualifier && item.owner && item.owner !== 'PUBLIC' && (settings.qualification === 'always' || settings.qualification === 'collision' && item.owner !== currentSchema);
      const insertName = `${qualify ? sqlIdentifier(item.owner) + '.' : ''}${sqlIdentifier(item.name)}`;
      add(item.name, 'class', item.owner === currentSchema ? 2 : 5, `${item.owner ? item.owner + ' · ' : ''}${item.type}`, { identity: `${item.owner}.${item.name}`, insertText: `${context.needsLeadingSpace ? ' ' : ''}${insertName}`, object: item });
    }
    if (!context.qualifier) for (const owner of new Set(relations.map(item => item.owner).filter(owner => owner && owner !== 'PUBLIC'))) {
      const prefixMatch = context.fragment && (context.quoted ? owner.startsWith(context.fragment) : owner.toLowerCase().startsWith(context.fragment.toLowerCase()));
      const preferSchema = !!(context.fromSource && prefixMatch);
      const exact = context.quoted ? owner === context.fragment : owner.toLowerCase() === context.fragment.toLowerCase();
      let name = context.quoted ? `"${owner.replace(/"/g, '""')}"` : sqlIdentifier(owner);
      // Unquoted Oracle names are case-insensitive. Keep the user's prefix so
      // popup acceptance and Monaco ghost text can use the exact same edit.
      if (preferSchema && !context.quoted && name === owner) {
        const suffix = owner.slice(context.fragment.length);
        name = context.fragment + (context.fragment.at(-1) === context.fragment.at(-1).toLowerCase() ? suffix.toLowerCase() : suffix);
      }
      const dot = context.tokens.find(token => token.start >= context.end)?.value === '.' ? '' : '.';
      add(owner, 'module', preferSchema ? exact ? -10 : -9 : 15, 'Oracle schema', { schema: true, preferSchema, insertText: name + dot });
    }
  } else if (context.qualifier) {
    const sourceItem = visibleSources.get(context.qualifierKey), object = sourceItem?.object;
    for (const column of object?.columns || []) add(column.name, 'field', 0, `${column.type || 'CTE column'}${column.indexed ? ' · indexed' : ''}`, { insertText: sqlIdentifier(column.name), column });
  } else if (!context.quoted) {
    const allColumns = new Map();
    for (const { ref, object } of visibleSources.values()) for (const column of object?.columns || []) {
      const list = allColumns.get(column.name) || []; list.push({ column, ref, object }); allColumns.set(column.name, list);
    }
    for (const [name, rows] of allColumns) for (const row of rows) {
      const ambiguous = rows.length > 1, qualifier = ambiguous ? sqlIdentifier(row.ref.aliasKey || row.ref.nameKey) + '.' : '';
      add(name, 'field', 3, `${row.ref.alias || row.ref.name} · ${row.column.type || 'column'}`, { identity: `${row.ref.alias || row.ref.name}.${name}`, insertText: qualifier + sqlIdentifier(name), column: row.column });
    }
    for (const local of [...context.locals].reverse()) add(local.name, 'variable', 0, `PL/SQL · ${local.type}`, { insertText: local.quoted ? sqlIdentifier(local.name) : local.name });
    for (const [alias, { ref }] of visibleSources) add(ref.alias || ref.name, 'variable', 5, 'Table / query alias', { identity: alias, insertText: sqlIdentifier(ref.aliasKey || ref.nameKey) });
    for (const entry of vocabulary) {
      if (entry.kind === 'keyword' && !sqlKeywordAllowed(context, entry.name)) continue;
      if (entry.kind === 'plsql' && !context.plsql) continue;
      if (entry.kind !== 'function' && functionNames.has(entry.name) || entry.kind === 'keyword' && plsqlNames.has(entry.name)) continue;
      const isFunction = entry.kind === 'function';
      const common = commonClauses.has(entry.name) || expressionKeywords.has(entry.name);
      const rank = isFunction ? 18 : common ? 10 : context.plsql && entry.kind === 'plsql' ? 16 : 40;
      const text = formatCompletionKeyword(entry.name, '', keywordStyle, context.fragment);
      const insertParentheses = isFunction && !noParentheses.has(entry.name) && settings.functionParentheses && !/^\s*\(/.test(source.slice(context.end));
      add(entry.name, isFunction ? 'function' : 'keyword', rank, `Oracle ${entry.kind === 'plsql' ? 'PL/SQL' : 'SQL'}${isFunction ? ' function' : ' keyword'}`, {
        insertText: insertParentheses ? `${text}($0)` : text,
        snippet: insertParentheses,
        documentation: entry.documentation, functionName: isFunction ? entry.name : undefined,
      });
    }
    if (settings.snippets && context.fragment) for (const snippet of snippets) add(snippet.trigger, 'snippet', 25, snippet.detail, { label: `${snippet.trigger} · ${snippet.label}`, filterText: snippet.trigger, insertText: snippet.text, snippet: true });
    if (settings.snippets && (!context.clause || context.clause === 'WHERE')) {
      const first = [...visibleSources.values()].find(item => item.object?.columns?.some(column => column.indexed));
      const columns = first?.object?.columns?.filter(column => column.indexed) || [];
      if (columns.length && (!context.clause || /\bWHERE\s*$/i.test(context.before))) {
        const qualifier = first.ref.alias ? sqlIdentifier(first.ref.aliasKey) + '.' : '';
        add('WHERE', 'snippet', 12, 'Generate indexed bind predicates', { label: 'WHERE · indexed filters', insertText: columns.map((column, index) => `${index ? '  AND ' : context.clause === 'WHERE' ? '' : 'WHERE '}${qualifier}${sqlIdentifier(column.name)} = \${${index + 1}:value_${index + 1}}`).join('\n'), snippet: true });
      }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'en'));
  return { context, candidates: candidates.slice(0, 300) };
}


// Empty lines require a concrete syntactic expectation, even when indented.
export function automaticCompletionAllowed(source, cursor, settings = {}) {
  const context = getOracleCompletionContext(source, cursor);
  if (context.blocked || context.bind) return false;
  if(!context.qualifier && context.fragment.length < (settings.minCharacters || 0))return false;
  const line = source.slice(source.lastIndexOf('\n', cursor - 1) + 1, cursor);
  if (line.trim()) return true;
  return context.relation || !!context.qualifier || ['SELECT', 'WHERE', 'ON', 'SET', 'HAVING', 'VALUES', 'ORDER', 'GROUP'].includes(context.clause);
}
