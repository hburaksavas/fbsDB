import { selectedProjectionColumns } from './selectedProjectionColumns.js';
import { lexOracle } from './oracleLexer.js';
export { lexOracle } from './oracleLexer.js';
import catalog from './oracleCatalog.json' with { type: 'json' };
import { defaultCompletionSettings } from './editorCompletionSettings.js';
import { getOracleCompletionContext, resolveCompletionSources, completionMatch, formatCompletionKeyword, sqlKeywordAllowed } from './oracleCompletionContext.js';
export { getOracleCompletionContext, resolveCompletionSources, completionMatch, formatCompletionKeyword, sqlKeywordAllowed, automaticCompletionAllowed } from './oracleCompletionContext.js';
const sqlIdentifier = value => /^[A-Z][A-Z0-9_$#]*$/.test(value) ? value : `"${value.replace(/"/g, '""')}"`;
const relationTypes = new Set(['TABLE', 'VIEW', 'MATERIALIZED VIEW', 'SYNONYM']);
const expressionKeywords = new Set('CASE WHEN THEN ELSE END NULL NOT AND OR IS IN EXISTS BETWEEN LIKE ESCAPE DISTINCT ALL ANY SOME AS OVER PARTITION BY ASC DESC NULLS FIRST LAST KEEP WITHIN GROUP AT TIME ZONE PRIOR CONNECT_BY_ROOT'.split(' '));
const commonClauses = new Set(['FROM', 'WHERE', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION ALL', 'FETCH FIRST', 'CONNECT BY', 'START WITH']);
const noParentheses = new Set(['SYSDATE', 'SYSTIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'LOCALTIMESTAMP', 'DBTIMEZONE', 'SESSIONTIMEZONE', 'CURRENT_USER', 'SESSION_USER', 'SYSTEM_USER', 'USER', 'UID']);
const grammarWords = `SELECT FROM WHERE JOIN INNER LEFT RIGHT FULL CROSS OUTER NATURAL ON USING GROUP ORDER BY HAVING ASC DESC NULLS FIRST LAST WITH RECURSIVE AS UNION ALL INTERSECT MINUS FETCH OFFSET ROWS ONLY NEXT FOR UPDATE OF NOWAIT SKIP LOCKED INSERT INTO VALUES DELETE MERGE MATCHED WHEN THEN SET RETURNING BULK COLLECT LIMIT OVER PARTITION RANGE PRECEDING FOLLOWING UNBOUNDED CURRENT ROW PIVOT UNPIVOT INCLUDE EXCLUDE MODEL MATCH_RECOGNIZE MEASURES PATTERN SUBSET DEFINE SEARCH DEPTH BREADTH CYCLE CONNECT START NOCYCLE PRIOR LATERAL APPLY JSON_TABLE XMLTABLE XMLNAMESPACES COLUMNS PATH EXISTS ERROR EMPTY DEFAULT FORMAT JSON TREAT TRUNCATE CASCADE PURGE ANALYZE EXPLAIN PLAN COMMENT RENAME SAVEPOINT ROLLBACK COMMIT WORK FORCE READ WRITE ISOLATION LEVEL SERIALIZABLE READ COMMITTED CONSTRAINTS DEFERRED IMMEDIATE ALTER SESSION SYSTEM ENABLE DISABLE VALIDATE NOVALIDATE PRIMARY FOREIGN REFERENCES KEY CHECK UNIQUE NOT NULL ADD MODIFY DROP COLUMN TABLE VIEW MATERIALIZED SYNONYM SEQUENCE INDEX PROCEDURE FUNCTION PACKAGE BODY TRIGGER TYPE REPLACE EDITIONABLE NONEDITIONABLE GRANT REVOKE EXECUTE TO IDENTIFIED AUTHID DEFINER CURRENT_USER`.split(/\s+/);

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
  const selectedColumn = selectedProjectionColumns(context, visibleSources);
  const projectionState = (alias, column) => selectedColumn(alias, column.name) ? { alreadySelected: true } : {};
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
    for (const column of object?.columns || []) add(column.name, 'field', 0, `${column.type || 'CTE column'}${column.indexed ? ' · indexed' : ''}`, { insertText: sqlIdentifier(column.name), column, ...projectionState(context.qualifierKey, column) });
    const qualifierStart = context.qualifierPath[0]?.start;
    const previous = context.tokens.filter(token => token.end <= qualifierStart).at(-1);
    // A list is valid only in a SELECT projection, outside calls/expressions.
    if (settings.showColumns && !context.quoted && object?.columns?.length && context.clause === 'SELECT'
      && previous?.depth === context.scope.depth && [',', 'SELECT', 'DISTINCT', 'ALL'].includes(previous.value.toUpperCase())) {
      const prefix = source.slice(qualifierStart, context.start);
      add('all', 'field', -1, `Insert all ${object.columns.length} columns`, {
        label: `${context.qualifier}.all`, filterText: 'all', bulkColumns: true, identity: `${context.qualifierKey}.all`,
        start: qualifierStart, insertText: object.columns.map(column => prefix + sqlIdentifier(column.name)).join(', '),
      });
    }
  } else if (!context.quoted) {
    const allColumns = new Map();
    for (const { ref, object } of visibleSources.values()) for (const column of object?.columns || []) {
      const list = allColumns.get(column.name) || []; list.push({ column, ref, object }); allColumns.set(column.name, list);
    }
    for (const [name, rows] of allColumns) for (const row of rows) {
      const qualify = rows.length > 1 || !!row.ref.alias, qualifier = qualify ? sqlIdentifier(row.ref.aliasKey || row.ref.nameKey) + '.' : '';
      add(name, 'field', 3, `${row.ref.alias || row.ref.name} · ${row.column.type || 'column'}`, { identity: `${row.ref.alias || row.ref.name}.${name}`, insertText: qualifier + sqlIdentifier(name), column: row.column, ...projectionState(row.ref.aliasKey || row.ref.nameKey, row.column) });
    }
    for (const local of [...context.locals].reverse()) add(local.name, 'variable', 0, `PL/SQL · ${local.type}`, { insertText: local.quoted ? sqlIdentifier(local.name) : local.name, valueType: local.type, symbolKind: local.kind });
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
  for (const candidate of candidates) if (candidate.alreadySelected) candidate.rank += 100;
  candidates.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'en'));
  return { context, candidates: candidates.slice(0, 300) };
}
