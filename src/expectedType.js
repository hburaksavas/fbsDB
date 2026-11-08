import { lexOracle } from './oracleLexer.js';
import { parsePlsql, plsqlVisibleSymbols, plsqlVisibleTypes } from './plsqlStructure.js';

// The kind of value the caret is expected to produce, used to put compatible completions first. Only classes are compared
// (date, number, text, boolean, binary, interval, cursor); an unknown or unresolvable type changes nothing.

const key = token => token.quoted ? token.value : token.value.toUpperCase();
const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;

export function typeClass(type) {
  const text = String(type || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (/^(SYS_REFCURSOR|REF CURSOR|CURSOR)\b/.test(text)) return 'CURSOR';
  if (/^(DATE|TIMESTAMP)\b/.test(text)) return 'DATE';
  if (/^INTERVAL\b/.test(text)) return 'INTERVAL';
  if (/^(NUMBER|INTEGER|INT|PLS_INTEGER|BINARY_INTEGER|BINARY_FLOAT|BINARY_DOUBLE|FLOAT|DECIMAL|NUMERIC|DEC|REAL|SMALLINT|NATURAL|NATURALN|POSITIVE|POSITIVEN|SIMPLE_INTEGER|SIGNTYPE|DOUBLE PRECISION)\b/.test(text)) return 'NUMBER';
  if (/^(VARCHAR2|VARCHAR|NVARCHAR2|CHAR|NCHAR|CHARACTER|CLOB|NCLOB|STRING|LONG)\b/.test(text) && !/^LONG RAW\b/.test(text)) return 'TEXT';
  if (/^BOOLEAN\b/.test(text)) return 'BOOLEAN';
  if (/^(RAW|BLOB|LONG RAW)\b/.test(text)) return 'BINARY';
  return null;
}

// Return classes of common built-in functions; polymorphic ones (NVL, DECODE, ROUND, TRUNC, GREATEST…) are left out.
const BUILTINS = {
  DATE: ['SYSDATE', 'CURRENT_DATE', 'ADD_MONTHS', 'LAST_DAY', 'NEXT_DAY', 'TO_DATE', 'SYSTIMESTAMP', 'CURRENT_TIMESTAMP', 'LOCALTIMESTAMP', 'TO_TIMESTAMP', 'TO_TIMESTAMP_TZ', 'FROM_TZ', 'NEW_TIME'],
  NUMBER: ['TO_NUMBER', 'LENGTH', 'LENGTHB', 'INSTR', 'INSTRB', 'MONTHS_BETWEEN', 'ABS', 'MOD', 'REMAINDER', 'POWER', 'SQRT', 'CEIL', 'FLOOR', 'SIGN', 'COUNT', 'SUM', 'AVG', 'ROWNUM', 'REGEXP_COUNT', 'REGEXP_INSTR', 'ASCII', 'BITAND', 'SQLCODE', 'DBMS_RANDOM.VALUE'],
  TEXT: ['TO_CHAR', 'SUBSTR', 'SUBSTRB', 'UPPER', 'LOWER', 'INITCAP', 'TRIM', 'LTRIM', 'RTRIM', 'LPAD', 'RPAD', 'REPLACE', 'TRANSLATE', 'CONCAT', 'SYS_CONTEXT', 'USER', 'REGEXP_SUBSTR', 'REGEXP_REPLACE', 'LISTAGG', 'CHR', 'SQLERRM', 'DUMP', 'SOUNDEX', 'TO_CLOB'],
  INTERVAL: ['NUMTODSINTERVAL', 'NUMTOYMINTERVAL', 'TO_DSINTERVAL', 'TO_YMINTERVAL'],
};
const builtinClass = new Map(Object.entries(BUILTINS).flatMap(([kind, names]) => names.map(name => [name, kind])));
export const builtinReturnClass = name => builtinClass.get(String(name || '').toUpperCase()) || null;

// Resolves a declared type to its class: anchors (x%TYPE, table.column%TYPE) and local subtypes are followed a few steps.
export function resolveTypeClass(type, { source, cursor, objects = [], currentSchema, columnType } = {}) {
  let text = String(type || '').trim();
  for (let step = 0; step < 4 && text; step++) {
    const direct = typeClass(text);
    if (direct) return direct;
    const anchor = /^((?:"[^"]+"|[\w$#]+)(?:\.(?:"[^"]+"|[\w$#]+)){0,2})%TYPE$/i.exec(text);
    const parts = (anchor ? anchor[1] : text).split('.').map(part => part.startsWith('"') ? part.slice(1, -1) : part.toUpperCase());
    if (anchor && parts.length === 1 && source != null) { text = plsqlVisibleSymbols(source, cursor).find(symbol => symbol.key === parts[0])?.type || ''; continue; }
    if (anchor && parts.length >= 2) { text = columnType?.(parts.length === 3 ? parts[0] : null, parts.at(-2), parts.at(-1)) || tableColumnType(objects, currentSchema, parts.length === 3 ? parts[0] : null, parts.at(-2), parts.at(-1)) || ''; continue; }
    if (!anchor && source != null && parts.length === 1) {
      const local = plsqlVisibleTypes(source, cursor).get(parts[0]);
      if (local) { if (/REF\s+CURSOR/i.test(local.type || '')) return 'CURSOR'; text = local.kind === 'alias' ? local.type : ''; continue; }
    }
    return null;
  }
  return null;
}

function tableColumnType(objects, currentSchema, owner, table, column) {
  const candidates = objects.filter(object => object.name === table && (!owner || object.owner === owner) && object.columns?.length);
  const object = candidates.find(item => item.owner === currentSchema) || candidates[0];
  return object?.columns.find(item => item.name === column)?.type || null;
}

// The innermost routine whose body holds the caret, with its return type.
function enclosingFunction(source, cursor) {
  let found = null;
  for (const scope of parsePlsql(source).scopes || []) for (const routine of scope.routines || []) {
    const own = routine.scope;
    if (!own || own.start > cursor || cursor > own.end) continue;
    if (!found || own.start >= found.scope.start) found = routine;
  }
  return found;
}

// context.sources-like map of visible tables: { ref: { aliasKey, nameKey }, object: { columns } }.
export function expectedValueType(source, cursor, { start = cursor, objects = [], currentSchema, sources, parameterType } = {}) {
  const from = Math.max(0, start - 4000);
  const tokens = lexOracle(source.slice(from, start)).filter(token => token.kind !== 'comment');
  const last = tokens.at(-1), resolveOptions = { source, cursor, objects, currentSchema, columnType: (owner, table, column) => sourceColumnType(sources, table, column) };
  const chainBefore = end => {
    const chain = []; let at = end;
    while (tokens[at]?.kind === 'identifier') { chain.unshift(key(tokens[at])); if (tokens[at - 1]?.value !== '.') break; at -= 2; }
    return chain;
  };
  const operandClass = chain => {
    if (!chain.length) return null;
    if (chain.length === 1) {
      const symbol = plsqlVisibleSymbols(source, cursor).find(item => item.key === chain[0] && ['variable', 'constant', 'parameter'].includes(item.kind));
      if (symbol) return resolveTypeClass(symbol.type, resolveOptions);
      return typeClass(sourceColumnType(sources, null, chain[0]));
    }
    return typeClass(sourceColumnType(sources, chain.at(-2), chain.at(-1)));
  };
  if (!last) return null;
  if (last.value === '=' && tokens.at(-2)?.value === ':') return withReason(operandClass(chainBefore(tokens.length - 3)), 'assignment');
  if (word(last, 'RETURN')) {
    const routine = enclosingFunction(source, cursor);
    if (routine?.returnType && /\bBEGIN\b/i.test(source.slice(routine.start, start))) return withReason(resolveTypeClass(routine.returnType, resolveOptions), 'return');
    return null;
  }
  if (['OPEN', 'FETCH', 'CLOSE'].some(value => word(last, value)) || word(last, 'IN') && word(tokens.at(-3), 'FOR')) return { kind: 'CURSOR', reason: word(last, 'IN') ? 'cursor loop' : last.value.toUpperCase() };
  // The right side of a comparison takes the class of its left side.
  if (last.value === '>' && tokens.at(-2)?.value === '=') return parameterType ? withReason(resolveTypeClass(parameterType, resolveOptions), 'argument') : null;
  let at = tokens.length - 1;
  if (word(last, 'AND')) { const between = tokens.findLastIndex(token => word(token, 'BETWEEN')); if (between >= 0 && !tokens.slice(between + 1, -1).some(token => word(token, 'AND'))) at = between; else return null; }
  if (word(tokens[at], 'BETWEEN')) return withReason(operandClass(chainBefore(at - 1)), 'comparison');
  if (['=', '<', '>'].includes(tokens[at].value)) {
    let left = at - 1;
    while (['<', '>', '!', '='].includes(tokens[left]?.value)) left--;
    if (tokens[left]?.value === ':') return null;
    return withReason(operandClass(chainBefore(left)), 'comparison');
  }
  if (parameterType) return withReason(resolveTypeClass(parameterType, resolveOptions), 'argument');
  return null;
}

const withReason = (kind, reason) => kind ? { kind, reason } : null;

function sourceColumnType(sources, qualifier, column) {
  for (const { ref, object } of sources?.values?.() || []) {
    if (qualifier && ![ref?.aliasKey, ref?.nameKey].includes(qualifier)) continue;
    const found = object?.columns?.find(item => item.name === column);
    if (found?.type) return found.type;
  }
  return null;
}
