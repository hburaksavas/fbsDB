import { lexOracle } from './oracleLexer.js';
import { plsqlVisibleSymbols, plsqlVisibleTypes, plsqlVisibleRoutines, plsqlScopesAt } from './plsqlStructure.js';

const key = token => token?.quoted ? token.value : token?.value?.toUpperCase();
const word = (token, value) => token?.kind === 'identifier' && !token.quoted && key(token) === value;
const typePath = value => lexOracle(value || '').filter(token => token.kind === 'identifier').map(key);

export function plsqlMemberPath(source, cursor, start) {
  const tokens = lexOracle(source.slice(0, start ?? cursor)).filter(token => !['comment', 'string'].includes(token.kind));
  if (tokens.at(-1)?.value !== '.') return [];
  const path = []; let at = tokens.length - 2;
  while (at >= 0) {
    let indexed = false;
    if (tokens[at]?.value === ')') {
      let nesting = 1; at--;
      while (at >= 0 && nesting) { if (tokens[at].value === ')') nesting++; if (tokens[at].value === '(') nesting--; at--; }
      indexed = true;
    }
    if (tokens[at]?.kind !== 'identifier') break;
    path.unshift({ key: key(tokens[at]), name: tokens[at].value, indexed, start: tokens[at].start });
    at--; if (tokens[at]?.value !== '.') break; at--;
  }
  return path;
}

export function plsqlTypeResolver(source, cursor, objects = [], currentSchema = '') {
  const symbols = plsqlVisibleSymbols(source, cursor), types = plsqlVisibleTypes(source, cursor), routines = plsqlVisibleRoutines(source, cursor);
  const object = parts => {
    const name = parts.at(-1), owner = parts.length > 1 ? parts.at(-2) : null;
    return objects.find(item => item.name === name && item.owner === (owner || currentSchema)) || objects.find(item => item.name === name && (!owner || item.owner === owner));
  };
  const rowFields = query => {
    const tokens = lexOracle(query || '').filter(token => !['string', 'comment'].includes(token.kind)), select = tokens.findIndex(token => word(token, 'SELECT'));
    if (select < 0) return [];
    const from = tokens.findIndex((token, at) => at > select && word(token, 'FROM') && token.depth === tokens[select].depth);
    const ref = tokens.slice(from + 1), table = object(ref[1]?.value === '.' ? [key(ref[0]), key(ref[2])] : [key(ref[0])]);
    const projection = tokens.slice(select + 1, from < 0 ? undefined : from);
    if (projection.some(token => token.value === '*')) return table?.columns || [];
    const fields = []; let part = [];
    const finish = () => { const last = part.at(-1); if (last?.kind === 'identifier') { const field = table?.columns?.find(column => column.name === key(last)); fields.push({ name: last.value, key: key(last), type: field?.type || 'SQL expression', quoted: last.quoted }); } part = []; };
    for (const token of projection) { if (token.value === ',' && token.depth === tokens[select].depth) finish(); else part.push(token); } finish(); return fields;
  };
  const resolve = (reference, indexed = false, visited = new Set()) => {
    const value = String(reference || ''), refKey = value + ':' + indexed;
    if (visited.has(refKey) || visited.size > 24) return null;
    visited = new Set(visited).add(refKey);
    const parts = typePath(value);
    if (/%ROWTYPE$/i.test(value)) {
      const relation = object(parts.slice(0, -1)), local = symbols.find(symbol => symbol.key === parts[0] && symbol.kind === 'cursor');
      return { kind: 'record', fields: local?.query ? rowFields(local.query) : relation?.columns || [], object: relation };
    }
    if (/%TYPE$/i.test(value)) {
      const relation = object(parts.slice(0, -2)), column = relation?.columns?.find(column => column.name === parts.at(-2));
      return column ? resolve(column.type, indexed, visited) : null;
    }
    const local = parts.length === 1 ? types.get(parts[0]) : null;
    if (local) {
      if (local.kind === 'record') return local;
      if (local.kind === 'collection') return indexed ? resolve(local.elementType, false, visited) : local;
      return resolve(local.type, indexed, visited);
    }
    const packageObject = parts.length > 1 ? object(parts.slice(0, -1)) : null;
    const namedType = packageObject?.types?.find(type => type.name === parts.at(-1));
    if (packageObject) targets.push({ owner: packageObject.owner, name: packageObject.name, type: packageObject.type });
    if (namedType) {
      if (namedType.kind === 'collection') return indexed ? resolve(namedType.elementType, false, visited) : namedType;
      return { ...namedType, object: packageObject };
    }
    const namedObject = object(parts);
    if (namedObject?.type === 'TYPE') {
      targets.push({ owner: namedObject.owner, name: namedObject.name, type: namedObject.type });
      const collection = namedObject.types?.find(type => type.kind === 'collection');
      if (collection) return indexed ? resolve(collection.elementType, false, visited) : collection;
      return { kind: 'record', fields: namedObject.columns || [], object: namedObject };
    }
    return null;
  };
  const fields = path => {
    if (!path.length) return { fields: [] };
    let symbol = [...symbols].reverse().find(symbol => symbol.key === path[0].key);
    const labelled = plsqlScopesAt(source, cursor).find(scope => scope.label?.key === path[0].key);
    if (!symbol && labelled) symbol = { ...labelled.label, kind: 'label', type: 'BLOCK' };
    const routine = routines.find(routine => routine.key === path[0].key);
    let type = labelled && symbol?.kind === 'label' ? { kind: 'record', fields: labelled.symbols } : symbol?.query ? { kind: 'record', fields: rowFields(symbol.query) } : resolve(symbol?.type || routine?.returnType, path[0].indexed);
    for (const part of path.slice(1)) {
      const field = type?.fields?.find(field => (field.key || field.name) === part.key);
      type = field ? resolve(field.type, part.indexed) : null;
    }
    return { fields: type?.fields || [], type, symbol };
  };
  const targets = [];
  const addReference = reference => {
    const parts = typePath(reference);
    if (/%ROWTYPE$/i.test(reference)) parts.pop();
    if (/%TYPE$/i.test(reference)) parts.splice(-2);
    const candidate = object(parts) || (parts.length > 1 ? object(parts.slice(0, -1)) : null);
    if (candidate) targets.push({ owner: candidate.owner, name: candidate.name, type: candidate.type });
  };
  for (const symbol of symbols) { addReference(symbol.type || ''); if (symbol.query) { const query = lexOracle(symbol.query); for (let at = 0; at < query.length; at++) if (word(query[at], 'FROM') || word(query[at], 'JOIN')) addReference(query.slice(at + 1, at + 4).map(token => token.value).join('')); } }
  for (const type of types.values()) { addReference(type.elementType || type.type || ''); for (const field of type.fields || []) addReference(field.type); }
  return { symbols, types, routines, resolve, fields, targets };
}
