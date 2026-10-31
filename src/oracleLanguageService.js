import { automaticCompletionAllowed, resolveCompletionSources } from './oracleCompletion.js';
import { getOracleCompletionContext, getOracleCompletions, getOracleVocabulary, lexOracle, completionMatch, formatCompletionKeyword } from './oracleCompletion.js';
import { plsqlTypeResolver, plsqlMemberPath } from './plsqlTypes.js';
import { plsqlVisibleRoutines } from './plsqlStructure.js';
import { applySqlExpectation } from './oracleSqlExpectation.js';
import { withSqlContinuations } from './oracleInlineCompletion.js';

const keyOf = item => JSON.stringify([item.owner || '', item.type || '', item.name || '']);
const id = value => /^[A-Z][A-Z0-9_$#]*$/.test(value || '') ? value : `"${String(value).replace(/"/g, '""')}"`;
const key = token => token?.quoted ? token.value : token?.value?.toUpperCase();
const isWord = (token, word) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === word;
const markdown = text => String(text || '').replace(/[\\`*_{}\[\]<>]/g, '\\$&');
const routines = new Set(['PACKAGE', 'PROCEDURE', 'FUNCTION', 'TYPE']);
const callableContainers = new Set([...routines, 'SYNONYM']);

export function languageObjects(options = {}) {
  const map = new Map((options.objects || []).map(object => [keyOf(object), object]));
  for (const object of [...(options.systemObjects || []), ...(options.metadata || [])]) map.set(keyOf(object), { ...map.get(keyOf(object)), ...object });
  return [...map.values()];
}

function resolveObject(name, owner, objects, currentSchema, types) {
  const candidates = objects.filter(object => object.name === name && (!owner || object.owner === owner) && (!types || types.has(object.type)));
  return candidates.find(object => object.owner === currentSchema) || candidates.find(object => object.owner === 'PUBLIC') || candidates[0];
}

export function oracleCallContext(source, cursor) {
  const context = getOracleCompletionContext(source, cursor);
  if (context.blocked) return null;
  const tokens = lexOracle(source.slice(0, cursor)).filter(token => !['comment', 'string'].includes(token.kind));
  const stack = [];
  for (let at = 0; at < tokens.length; at++) {
    const token = tokens[at];
    if (token.value === '(') {
      const path = [];
      for (let back = at - 1; back >= 0 && tokens[back].kind === 'identifier'; back -= 2) { path.unshift({ name: tokens[back].value, key: key(tokens[back]), start: tokens[back].start }); if (tokens[back - 1]?.value !== '.') break; }
      stack.push({ open: token, path, index: at });
    } else if (token.value === ')') stack.pop();
  }
  const call = [...stack].reverse().find(item => item.path.length && !['SELECT', 'IN', 'VALUES', 'AS', 'OVER', 'PARTITION', 'IF', 'FOR', 'WHILE'].includes(item.path.at(-1).key));
  if (!call) return null;
  const args = tokens.slice(call.index + 1).filter(token => token.depth === call.open.depth + 1);
  const commaPositions = args.filter(token => token.value === ',');
  const current = args.filter(token => token.start > (commaPositions.at(-1)?.start ?? call.open.start));
  const named = current.findIndex((token, index) => token.value === '=' && current[index + 1]?.value === '>');
  return { path: call.path, start: call.path[0].start, open: call.open.start, argumentIndex: commaPositions.length, argumentName: named > 0 ? key(current[named - 1]) : null };
}

function contextSources(context, objects, currentSchema) {
  return resolveCompletionSources(context, objects, currentSchema);
}

export function languageMetadataTargets(source, cursor, options = {}, mode = 'complete') {
  const context = getOracleCompletionContext(source, cursor), objects = languageObjects(options), targets = new Map();
  const add = object => { if (object && !['CTE', 'SUBQUERY'].includes(object.type)) targets.set(keyOf(object), { owner: object.owner, name: object.name, type: object.type }); };
  if (context.blocked) return [];
  const localTypes = plsqlTypeResolver(source, cursor, objects, options.currentSchema);
  localTypes.fields(plsqlMemberPath(source, cursor, context.start));
  for (const target of localTypes.targets) add(target);
  const qualifiedSources = context.qualifier && context.sources.filter(ref => (ref.aliasKey || ref.nameKey) === context.qualifierKey);
  const metadataContext = qualifiedSources?.length ? { ...context, sources: qualifiedSources } : context;
  if (!context.relation || /\bJOIN\b/i.test(context.before) || mode !== 'complete') resolveCompletionSources(metadataContext, objects, options.currentSchema, add);
  const path = mode === 'signature' ? oracleCallContext(source, cursor)?.path : context.qualifierPath;
  if (path?.length) {
    const names = path.map(part => part.key);
    add(resolveObject(names.at(-1), names.length > 1 ? names.at(-2) : null, objects, options.currentSchema, callableContainers));
    if (mode === 'signature') {
      add(resolveObject(names.at(-2), names.length > 2 ? names.at(-3) : null, objects, options.currentSchema, callableContainers));
    }
  }
  if (mode === 'hover' || mode === 'definition' || mode === 'symbol') {
    const token = lexOracle(source).find(token => token.kind === 'identifier' && token.start < cursor && cursor <= token.end);
    add(resolveObject(key(token), context.qualifierPath?.at(-1)?.key, objects, options.currentSchema));
  }
  return [...targets.values()].slice(0, 16);
}

const commonSignatures = {
  TO_CHAR: [['value', 'format?', 'nlsparam?']], TO_DATE: [['char', 'format?', 'nlsparam?']], TO_TIMESTAMP: [['char', 'format?', 'nlsparam?']], TO_TIMESTAMP_TZ: [['char', 'format?', 'nlsparam?']],
  TO_NUMBER: [['value', 'format?', 'nlsparam?']], NVL: [['expr1', 'expr2']], NVL2: [['expr1', 'expr2', 'expr3']], COALESCE: [['expr1', 'expr2', '…']], NULLIF: [['expr1', 'expr2']],
  SUBSTR: [['char', 'position', 'length?']], SUBSTRB: [['char', 'position', 'length?']], INSTR: [['string', 'substring', 'position?', 'occurrence?']], REPLACE: [['char', 'search', 'replacement?']],
  LPAD: [['expr1', 'length', 'expr2?']], RPAD: [['expr1', 'length', 'expr2?']], TRIM: [['trim_source']], LTRIM: [['char', 'set?']], RTRIM: [['char', 'set?']],
  UPPER: [['char']], LOWER: [['char']], INITCAP: [['char']], LENGTH: [['char']], LENGTHB: [['char']], ABS: [['number']], ROUND: [['number', 'decimal_places?'], ['date', 'format?']],
  TRUNC: [['number', 'decimal_places?'], ['date', 'format?']], MOD: [['n2', 'n1']], POWER: [['n2', 'n1']], ADD_MONTHS: [['date', 'integer']], MONTHS_BETWEEN: [['date1', 'date2']],
  LAST_DAY: [['date']], NEXT_DAY: [['date', 'char']], EXTRACT: [['field FROM source']], COUNT: [['expr']], SUM: [['expr']], AVG: [['expr']], MIN: [['expr']], MAX: [['expr']],
  LISTAGG: [['measure_expr', 'delimiter?']], REGEXP_LIKE: [['source', 'pattern', 'match_param?']], REGEXP_REPLACE: [['source', 'pattern', 'replacement?', 'position?', 'occurrence?', 'match_param?']],
  REGEXP_SUBSTR: [['source', 'pattern', 'position?', 'occurrence?', 'match_param?', 'subexpr?']], JSON_VALUE: [['expr', 'path']], JSON_QUERY: [['expr', 'path']], JSON_EXISTS: [['expr', 'path']],
  SYS_CONTEXT: [['namespace', 'parameter', 'length?']], DECODE: [['expr', 'search', 'result', '…']], ROW_NUMBER: [[]], RANK: [[]], DENSE_RANK: [[]], LAG: [['value_expr', 'offset?', 'default?']], LEAD: [['value_expr', 'offset?', 'default?']],
};

function signatureLabel(name, routine) {
  return `${name}(${(routine.parameters || []).map(parameter => `${parameter.name}${parameter.mode && parameter.mode !== 'IN' ? ' ' + parameter.mode : ''}${parameter.type ? ' ' + parameter.type : ''}${parameter.optional ? ' DEFAULT …' : ''}`).join(', ')})${routine.returnType ? ' RETURN ' + routine.returnType : ''}`;
}

export function oracleSignatureHelp(source, cursor, options = {}) {
  const call = oracleCallContext(source, cursor); if (!call) return null;
  const objects = languageObjects(options), name = call.path.at(-1).key;
  const container = call.path.length > 1 ? resolveObject(call.path.at(-2).key, call.path.length > 2 ? call.path.at(-3).key : null, objects, options.currentSchema, callableContainers) : resolveObject(name, null, objects, options.currentSchema, callableContainers);
  let signatures = call.path.length === 1 ? plsqlVisibleRoutines(source, cursor).filter(routine => routine.key === name) : [];
  if (!signatures.length) signatures = (container?.members || []).filter(member => member.name === name);
  if (!signatures.length && call.path.length === 1) signatures = (commonSignatures[name] || []).map(parameters => ({ builtin: true, parameters: parameters.map((value, index) => ({ name: value.replace('?', ''), optional: value.endsWith('?'), position: index + 1 })), documentation: getOracleVocabulary(options.version || 19).find(entry => entry.name === name && entry.kind === 'function')?.documentation }));
  if (!signatures.length) return null;
  const results = signatures.map(routine => {
    const label = signatureLabel(call.path.map(part => part.name).join('.'), routine);
    const namedIndex = call.argumentName ? routine.parameters.findIndex(parameter => parameter.name.toUpperCase() === call.argumentName) : -1;
    const args = lexOracle(source.slice(call.open + 1, cursor)).filter(token => token.kind !== 'comment'), first = args[0];
    const expected = routine.parameters[0]?.type || '', actual = first?.kind === 'number' ? 'NUMBER' : first?.kind === 'string' ? 'CHAR' : isWord(first, 'TRUE') || isWord(first, 'FALSE') ? 'BOOLEAN' : '';
    const mismatch = actual && expected && !(actual === 'NUMBER' ? /NUMBER|INTEGER|INT|FLOAT|DECIMAL|DOUBLE/i.test(expected) : new RegExp(actual, 'i').test(expected)) ? 4 : 0;
    return { label, parameters: routine.parameters.map(parameter => ({ label: parameter.name, documentation: `${parameter.mode || 'IN'} ${parameter.type || ''}${parameter.optional ? ' · optional' : ''}` })), allowNamedArguments: !routine.builtin, activeParameter: Math.max(0, namedIndex < 0 ? Math.min(call.argumentIndex, Math.max(0, routine.parameters.length - 1)) : namedIndex), score: (call.argumentName ? namedIndex < 0 ? 10 : 0 : call.argumentIndex >= routine.parameters.length && routine.parameters.at(-1)?.name !== '…' ? 10 : 0) + mismatch, documentation: routine.documentation };
  });
  const activeSignature = results.reduce((best, item, index) => item.score < results[best].score ? index : best, 0);
  return { signatures: results, activeSignature, activeParameter: results[activeSignature].activeParameter };
}

function aliasFor(name, used) {
  const base = name.split('_').map(part => part[0]).join('').toLowerCase().replace(/[^a-z0-9_]/g, '') || 't';
  let alias = base, count = 2; while (used.has(alias.toUpperCase())) alias = base + count++;
  return alias;
}

export function oracleLanguageCompletions(source, cursor, options = {}) {
  const result=languageCompletions(source,cursor,options),settings=options.settings||{};
  const enabled={keyword:settings.showKeywords, function:settings.showFunctions, field:settings.showColumns};
  result.candidates=result.candidates.filter(candidate=>enabled[candidate.kind]!==false).slice(0,[50,100,200,300].includes(settings.maxSuggestions)?settings.maxSuggestions:300);
  return result;
}

function languageCompletions(source, cursor, options = {}) {
  const objects = languageObjects(options), result = getOracleCompletions(source, cursor, { ...options, objects });
  const context = result.context; if (context.blocked || context.bind) return result;
  if (options.automatic && !automaticCompletionAllowed(source, cursor,options.settings)) return { ...result, candidates: [] };
  const blankLine = !source.slice(source.lastIndexOf('\n', cursor - 1) + 1, cursor).trim();
  const settings = options.settings || {}, sources = contextSources(context, objects, options.currentSchema);
  const localTypes = plsqlTypeResolver(source, cursor, objects, options.currentSchema), path = plsqlMemberPath(source, cursor, context.start), localRecord = localTypes.fields(path);
  if (path.length && localRecord.symbol) {
    result.candidates = localRecord.fields.filter(field => completionMatch(field.name, context.fragment, settings.matchMode, context.quoted) >= 0).map(field => ({ key: 'local-field:' + path.map(part => part.key).join('.') + '.' + field.name, label: field.name, detail: field.type || 'Record field', kind: 'field', rank: 0, insertText: field.key && !field.quoted ? field.name : id(field.name), start: context.start, end: context.end, column: field, object: localRecord.type?.object }));
    return result;
  }
  for (const routine of localTypes.routines) if (completionMatch(routine.name, context.fragment, settings.matchMode, context.quoted) >= 0 && !context.qualifier) {
    result.candidates = result.candidates.filter(item => !(item.kind === 'variable' && item.label === routine.name));
    const parentheses = settings.functionParentheses !== false && !/^\s*\(/.test(source.slice(context.end));
    result.candidates.push({ key: 'local-routine:' + routine.start, label: routine.name, detail: signatureLabel(routine.name, routine), kind: 'function', rank: 0, insertText: (routine.quoted ? id(routine.name) : routine.name) + (parentheses ? '($0)' : ''), snippet: parentheses, functionName: routine.name, start: context.start, end: context.end });
  }
  for (const candidate of result.candidates) if (candidate.column) candidate.object = [...sources.values()].find(item => item.object?.columns?.includes(candidate.column))?.object;
  const call = oracleCallContext(source, cursor);
  if (call?.argumentIndex >= 0 && !call.argumentName && !context.qualifier) {
    const help = oracleSignatureHelp(source, cursor, { ...options, objects });
    const used = new Set(context.tokens.filter((token, index) => token.start > call.open && context.tokens[index + 1]?.value === '=' && context.tokens[index + 2]?.value === '>').map(key));
    const names = new Set();
    for (const signature of (help?.signatures || []).filter(signature => signature.allowNamedArguments)) for (const parameter of signature.parameters) if (!used.has(parameter.label.toUpperCase()) && !names.has(parameter.label) && completionMatch(parameter.label, context.fragment, settings.matchMode) >= 0) {
      names.add(parameter.label);
      result.candidates.push({ key: 'argument:' + parameter.label, label: parameter.label, detail: parameter.documentation, kind: 'variable', rank: 0, insertText: `${parameter.label} => `, start: context.start, end: context.end });
    }
  }
  if (context.qualifier && !context.relation) {
    const path = context.qualifierPath.map(part => part.key);
    const container = resolveObject(path.at(-1), path.length > 1 ? path.at(-2) : null, objects, options.currentSchema, callableContainers);
    for (const member of container?.members || []) if (completionMatch(member.name, context.fragment, settings.matchMode, context.quoted) >= 0) {
      const withParens = settings.functionParentheses !== false && !/^\s*\(/.test(source.slice(context.end));
      result.candidates.push({ key: `routine:${keyOf(container)}:${member.subprogramId}`, label: member.name, detail: signatureLabel(member.name, member), kind: 'function', rank: 1, insertText: id(member.name) + (withParens ? '($0)' : ''), snippet: withParens, functionName: member.name, start: context.start, end: context.end, object: container, member: member.name });
    }
    // A schema prefix proposes objects; an alias prefix proposes only its fields.
    if (!sources.has(context.qualifierKey) && !container) for (const object of objects) if (object.owner === context.qualifierKey && completionMatch(object.name, context.fragment, settings.matchMode, context.quoted) >= 0) result.candidates.push({ key: keyOf(object), label: object.name, detail: `${object.owner} · ${object.type}`, kind: routines.has(object.type) ? 'function' : 'class', rank: 5, insertText: id(object.name), start: context.start, end: context.end, object });
  } else if (!context.relation) {
    for (const object of objects.filter(object => routines.has(object.type))) {
      const system = !options.objects?.some(item => keyOf(item) === keyOf(object));
      if (system && !options.manual && !settings.systemPackages && !/^(?:DBMS_|UTL_)/i.test(context.fragment)) continue;
      if (settings.schemaScope === 'current' && object.owner !== options.currentSchema && !system) continue;
      if (completionMatch(object.name, context.fragment, settings.matchMode) < 0) continue;
      const routine = object.members?.[0], withParens = object.type !== 'PACKAGE' && settings.functionParentheses !== false && !/^\s*\(/.test(source.slice(context.end));
      result.candidates.push({ key: keyOf(object), label: object.name, detail: `${object.owner} · ${object.type}`, kind: object.type === 'PACKAGE' ? 'module' : 'function', rank: object.owner === options.currentSchema ? 7 : 20, insertText: (object.owner && object.owner !== options.currentSchema ? id(object.owner) + '.' : '') + id(object.name) + (withParens ? '($0)' : ''), snippet: withParens, functionName: withParens ? object.name : null, start: context.start, end: context.end, object, documentationText: routine ? signatureLabel(object.name, routine) : '' });
    }
  }
  const usedAliases = new Set([...sources.keys()]);
  const cleanTail = /^\s*(?:$|;|\)|WHERE\b|ORDER\b|GROUP\b|JOIN\b|INNER\b|LEFT\b)/i.test(source.slice(context.end));
  if (context.relation && cleanTail) {
    for (const candidate of result.candidates.filter(item => item.object && item.kind === 'class')) {
      if (settings.generateAlias) candidate.insertText += ' ' + aliasFor(candidate.object.name, usedAliases);
      if (settings.fkJoins === false) continue;
      if (!/\bJOIN\s+(?:(?:"[^"]+"|[\w$#]+)\.)?(?:"[^"]*|[\w$#]*)$/i.test(context.before)) continue;
      const target = candidate.object, joins = new Map();
      for (const { object, ref } of sources.values()) for (const fk of object?.foreignKeys || []) {
        const sourceOwner = object.targetOwner || object.owner, sourceName = object.targetName || object.name;
        const forward = fk.owner === sourceOwner && fk.table === sourceName && fk.targetOwner === target.owner && fk.targetTable === target.name;
        const reverse = fk.targetOwner === sourceOwner && fk.targetTable === sourceName && fk.owner === target.owner && fk.table === target.name;
        if (!forward && !reverse) continue;
        const joinKey = JSON.stringify([fk.owner, fk.name, ref.aliasKey || ref.nameKey]);
        if (!joins.has(joinKey)) joins.set(joinKey, { rows: [], ref, forward });
        joins.get(joinKey).rows.push(fk);
      }
      for (const join of joins.values()) {
        const alias = settings.generateAlias ? aliasFor(target.name, usedAliases) : target.name;
        const predicates = join.rows.sort((a, b) => a.position - b.position).map(fk => `${id(join.ref.aliasKey || join.ref.nameKey)}.${id(join.forward ? fk.column : fk.targetColumn)} = ${id(settings.generateAlias ? alias.toUpperCase() : alias)}.${id(join.forward ? fk.targetColumn : fk.column)}`);
        result.candidates.push({ ...candidate, key: candidate.key + ':fk:' + join.rows[0].name, label: candidate.label + ' · FK join', filterText: candidate.label, detail: join.rows[0].name + ' · ' + predicates.length + ' column' + (predicates.length === 1 ? '' : 's'), insertText: candidate.insertText + '\n    ON ' + predicates.join('\n   AND '), rank: -1 });
      }
    }
  }
  if (options.automatic && blankLine && !context.relation && !context.qualifier) result.candidates = result.candidates.filter(item => ['field', 'variable'].includes(item.kind));
  applySqlExpectation(result, settings, formatCompletionKeyword);
  result.candidates.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'en'));
  result.candidates = result.candidates.slice(0, 300);
  return withSqlContinuations(result, source, cursor, settings);
}

export function oracleSymbolInfo(source, cursor, options = {}) {
  const objects = languageObjects(options);
  if (getOracleCompletionContext(source, cursor).blocked) return null;
  const token = lexOracle(source).find(token => token.start <= cursor && cursor <= token.end && token.kind === 'identifier');
  if (!token) return null;
  const context = getOracleCompletionContext(source, token.end);
  const localTypes = plsqlTypeResolver(source, token.end, objects, options.currentSchema), memberPath = plsqlMemberPath(source, token.end, token.start), localRecord = localTypes.fields(memberPath);
  if (memberPath.length && localRecord.symbol) {
    const field = localRecord.fields.find(field => (field.key || field.name) === key(token));
    if (field) return { lookupName: key(token), start: token.start, end: token.end, contents: [{ value: `\`\`\`sql\n${field.name} ${field.type || 'Record field'}\n\`\`\`` }], localStart: localRecord.type?.object ? null : field.start ?? localRecord.symbol.start, target: localRecord.type?.object ? { owner: localRecord.type.object.owner, name: localRecord.type.object.name, type: localRecord.type.object.type, column: field.name } : null };
  }
  const name = key(token), sources = contextSources(context, objects, options.currentSchema);
  const local = [...context.locals].reverse().find(local => (local.key || local.name.toUpperCase()) === name);
  const cte = context.ctes.find(item => item.nameKey === name);
  const alias = sources.get(name);
  let object = null, column = null, member = null;
  if (context.qualifier) {
    object = sources.get(context.qualifierKey)?.object || resolveObject(context.qualifierPath.at(-1).key, context.qualifierPath.length > 1 ? context.qualifierPath.at(-2).key : null, objects, options.currentSchema);
    column = object?.columns?.find(column => column.name === name);
    member = object?.members?.find(member => member.name === name);
  } else {
    const columns = [...sources.values()].flatMap(item => (item.object?.columns || []).filter(column => column.name === name).map(column => ({ object: item.object, column })));
    if (columns.length === 1) ({ object, column } = columns[0]);
    else object = resolveObject(name, null, objects, options.currentSchema);
  }
  let contents = [], localStart = null;
  if (local) { contents = [{ value: `\`\`\`sql\n${local.name} ${local.type}\n\`\`\`` }]; localStart = local.start; }
  else if (cte || alias?.object?.type === 'CTE') { const item = cte || context.ctes.find(cte => cte.nameKey === alias.ref.nameKey); contents = [{ value: markdown(item?.name || token.value) + ' · common table expression' }]; localStart = item?.start; }
  else if (alias && !context.qualifier) { object = alias.object; localStart = alias.ref.aliasStart ?? alias.ref.start; contents = [{ value: markdown(alias.ref.alias || alias.ref.name) + ' → ' + markdown(object ? `${object.owner || ''}.${object.name || alias.ref.name}` : alias.ref.name) }]; }
  else if (member) contents = object.members.filter(item => item.name === name).map(item => ({ value: `\`\`\`sql\n${signatureLabel(member.name, item)}\n\`\`\`` }));
  else if (column) contents = [{ value: `\`\`\`sql\n${column.name} ${column.type}${column.nullable === false ? ' NOT NULL' : ''}\n\`\`\`` }, { value: markdown(column.comment) }];
  else if (object) contents = [{ value: markdown(`${object.owner}.${object.name}`) + ' · ' + markdown(object.type) }, { value: markdown(object.comment) }];
  else {
    const entry = getOracleVocabulary(options.version || 19).find(entry => entry.name === name);
    if (entry) contents = [{ value: markdown(entry.name) + ' · Oracle ' + markdown(entry.kind) }, ...(entry.documentation ? [{ value: `[Oracle documentation](${entry.documentation})` }] : [])];
  }
  return contents.length ? { lookupName: key(token), start: token.start, end: token.end, contents: contents.filter(item => item.value), localStart, target: object && object.type !== 'CTE' && object.type !== 'SUBQUERY' ? { owner: object.owner, name: object.name, type: object.type, member: member?.name, column: column?.name } : null } : null;
}
