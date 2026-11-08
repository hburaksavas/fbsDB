import { parsePlsql } from './plsqlStructure.js';
import { lexOracle } from './oracleLexer.js';
import { pathKey } from './workspaceTree.js';
import { exceptionHandlers, sqlReferences } from './plsqlSqlReferences.js';

// A project-wide index of PL/SQL routines and the calls between them, built from source files only; it never asks the database.
// What it cannot decide is reported, not guessed:
// - a name that matches several routines (same name in several schemas or files) is an ambiguous call to each candidate;
// - overloads of one name are one routine, so a call is not tied to a single overload;
// - EXECUTE IMMEDIATE, OPEN ... FOR with a string and DBMS_SQL calls are listed as dynamic call sites that were not analysed;
// - a name declared in no indexed file is not a call (it may be a variable, a column, a built-in or code outside the project).

const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;
const keyOf = token => token.quoted ? token.value : token.value.toUpperCase();
const plainWord = token => token?.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : '';
const UNIT_KINDS = new Set(['PACKAGE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE']);

function lineIndex(source) {
  const starts = [0];
  for (let i = source.indexOf('\n'); i >= 0; i = source.indexOf('\n', i + 1)) starts.push(i + 1);
  return offset => { let low = 0, high = starts.length - 1; while (low < high) { const mid = (low + high + 1) >> 1; if (starts[mid] <= offset) low = mid; else high = mid - 1; } return low + 1; };
}

// The kind, owner and name written after PACKAGE [BODY] / PROCEDURE / FUNCTION / TRIGGER / TYPE [BODY].
function unitHeader(tokens, start) {
  let at = tokens.findIndex(token => token.start >= start);
  if (at < 0) return null;
  while (at < tokens.length && !UNIT_KINDS.has(plainWord(tokens[at]))) at++;
  const kind = plainWord(tokens[at]); at++;
  let body = false;
  if ((kind === 'PACKAGE' || kind === 'TYPE') && word(tokens[at], 'BODY')) { body = true; at++; }
  const first = tokens[at];
  if (first?.kind !== 'identifier') return null;
  if (tokens[at + 1]?.value === '.' && tokens[at + 2]?.kind === 'identifier') return { kind, body, owner: keyOf(first), name: keyOf(tokens[at + 2]), nameToken: tokens[at + 2] };
  return { kind, body, owner: null, name: keyOf(first), nameToken: first };
}

export const routineLabel = routine => routine?.label || '';

const SQLPLUS = new Set(['SET', 'PROMPT', 'SPOOL', 'SPO', 'REM', 'REMARK', 'DEFINE', 'DEF', 'UNDEFINE', 'WHENEVER', 'SHOW', 'COLUMN', 'COL', 'TTITLE', 'BTITLE', 'BREAK', 'COMPUTE', 'CLEAR', 'EXIT', 'QUIT', 'CONNECT', 'CONN', 'DISCONNECT', 'DESC', 'DESCRIBE', 'VARIABLE', 'VAR', 'PRINT', 'ACCEPT', 'PAUSE', 'HOST', 'TIMING', 'START']);
const lineEnd = (source, offset) => { const at = source.indexOf('\n', offset); return at < 0 ? source.length : at; };
const delimiterLine = (source, token) => token?.value === '/' && source.slice(source.lastIndexOf('\n', token.start - 1) + 1, lineEnd(source, token.end)).trim() === '/';

// Script files mix SQL statements, SQL*Plus commands and PL/SQL units. Only PL/SQL units go to the PL/SQL parser: everything else
// is blanked with spaces so offsets stay the same. SQL statements and EXEC lines become statements of their own, so their table
// references and calls are indexed too; SQL*Plus commands are skipped.
export function splitScript(source) {
  const tokens = lexOracle(source).filter(token => token.kind !== 'comment'), statements = [], blank = [];
  let i = 0;
  const skipTo = offset => { while (i < tokens.length && tokens[i].start < offset) i++; };
  while (i < tokens.length) {
    const token = tokens[i], first = plainWord(token);
    const lineStart = source.lastIndexOf('\n', token.start - 1) + 1, atLineStart = !source.slice(lineStart, token.start).trim();
    let create = i;
    if (first === 'CREATE') { create++; if (word(tokens[create], 'OR') && word(tokens[create + 1], 'REPLACE')) create += 2; while (['EDITIONABLE', 'NONEDITIONABLE', 'EDITIONING'].includes(plainWord(tokens[create]))) create++; }
    if (first === 'DECLARE' || first === 'BEGIN' || first === 'CREATE' && UNIT_KINDS.has(plainWord(tokens[create])) || UNIT_KINDS.has(first) && first !== 'TYPE') {
      // A PL/SQL unit runs to its "/" line, or to the end of the file.
      let k = i + 1; while (k < tokens.length && !delimiterLine(source, tokens[k])) k++;
      i = k + 1; continue;
    }
    if (delimiterLine(source, token)) { i++; continue; }
    if (atLineStart && (SQLPLUS.has(first) || token.value === '@')) { const end = lineEnd(source, token.start); blank.push([token.start, end]); skipTo(end); continue; }
    if (atLineStart && (first === 'EXEC' || first === 'EXECUTE' && !word(tokens[i + 1], 'IMMEDIATE'))) {
      const end = lineEnd(source, token.start); statements.push({ start: token.start, end, kind: 'EXEC' }); blank.push([token.start, end]); skipTo(end); continue;
    }
    // A SQL statement runs to ";" outside parentheses, or to a "/" line.
    let depth = 0, k = i;
    for (; k < tokens.length; k++) {
      if (tokens[k].value === '(') depth++; else if (tokens[k].value === ')') depth = Math.max(0, depth - 1);
      else if (tokens[k].value === ';' && !depth || k > i && delimiterLine(source, tokens[k])) break;
    }
    const end = tokens[k] && tokens[k].value === ';' ? tokens[k].end : tokens[k - 1]?.end ?? token.end;
    statements.push({ start: token.start, end, kind: 'SQL' }); blank.push([token.start, end]);
    i = tokens[k]?.value === ';' ? k + 1 : k;
  }
  if (!blank.length) return { parseSource: source, statements };
  const chars = source.split('');
  for (const [start, end] of blank) for (let at = start; at < end; at++) if (chars[at] !== '\n' && chars[at] !== '\r') chars[at] = ' ';
  return { parseSource: chars.join(''), statements };
}

// Indexes one file: its routines with their body ranges, and the call candidates inside each body.
export function indexPlsqlFile(path, source) {
  const { parseSource, statements } = splitScript(source);
  const model = parsePlsql(parseSource), tokens = lexOracle(source).filter(token => token.kind !== 'comment'), lineAt = lineIndex(source);
  const routines = [], bodies = [];
  const record = (routine, bodyStart, end) => { routines.push(routine); if (bodyStart != null) bodies.push({ routine, start: bodyStart, end }); };
  for (const statement of statements) {
    const label = `${statement.kind === 'EXEC' ? 'EXEC' : 'SQL statement'}, line ${lineAt(statement.start)}`;
    record({ id: `${path}#${statement.start}`, label, path, kind: 'STATEMENT', part: 'body', owner: null, package: null, name: label, start: statement.start, end: statement.end, nameStart: statement.start, parent: null, anonymous: true }, statement.start, statement.end);
  }
  const visit = (node, context) => {
    if (node.kind === 'block' && !context.parent) {
      const label = `Anonymous block, line ${lineAt(node.start)}`, end = node.end ?? source.length;
      const block = { id: `${path}#${node.start}`, label, path, kind: 'BLOCK', part: 'body', owner: null, package: null, name: label, start: node.start, end, nameStart: node.start, parent: null, anonymous: true };
      record(block, node.start, end);
      for (const child of node.declarations || []) visit(child, { owner: null, package: null, parent: block });
      return;
    }
    if (node.kind !== 'routine') return;
    const header = unitHeader(tokens, node.start);
    if (!header) return;
    const end = node.end ?? source.length;
    if (!context.parent && (header.kind === 'PACKAGE' || header.kind === 'TYPE')) {
      const label = [header.owner, header.name].filter(Boolean).join('.');
      const unit = { id: `${header.owner || ''}.${header.name}`, label, path, kind: header.kind, part: header.body ? 'body' : 'spec', owner: header.owner, package: null, name: header.name, start: node.start, end, nameStart: header.nameToken.start, parent: null };
      // The package's own BEGIN section is its initialization code.
      record(unit, node.begin, end);
      for (const child of node.declarations || []) visit(child, { owner: header.owner, package: header.name, parent: unit });
      return;
    }
    const parent = context.parent, nested = parent && parent.kind !== 'PACKAGE' && parent.kind !== 'TYPE';
    const owner = parent ? context.owner : header.owner;
    const id = nested ? `${parent.id}/${header.name}` : `${owner || ''}.${context.package || ''}.${header.name}`;
    const label = nested ? `${parent.label} › ${header.name}` : [owner, context.package, header.name].filter(Boolean).join('.');
    const routine = { id, label, path, kind: header.kind, part: node.headerEnd == null && node.begin == null ? 'spec' : 'body', owner, package: context.package || null, name: header.name, start: node.start, end, nameStart: header.nameToken.start, parent: parent || null, local: Boolean(nested) };
    record(routine, node.headerEnd ?? node.begin, end);
    for (const child of node.declarations || []) visit(child, { owner, package: context.package, parent: routine });
  };
  for (const child of model.children || []) visit(child, {});

  // The innermost body around a token is its caller. Bodies nest or are disjoint, and tokens are visited in order, so a stack suffices.
  const ordered = bodies.sort((a, b) => a.start - b.start || b.end - a.end);
  // Each pass over increasing offsets gets its own sweep.
  const sweep = () => {
    const stack = []; let next = 0;
    return offset => {
      while (next < ordered.length && ordered[next].start <= offset) { const body = ordered[next++]; while (stack.length && stack.at(-1).end <= body.start) stack.pop(); stack.push(body); }
      while (stack.length && stack.at(-1).end <= offset) stack.pop();
      return stack.at(-1)?.routine || null;
    };
  };
  const callerAt = sweep();
  // Variables, parameters and cursors hide routines of the same name where they are visible.
  const locals = new Map();
  for (const scope of model.scopes || []) for (const symbol of scope.symbols || []) if (['variable', 'constant', 'parameter', 'cursor', 'iterator', 'type'].includes(symbol.kind)) {
    const list = locals.get(symbol.key) || []; list.push({ start: scope.start, end: scope.end, declared: symbol.start }); locals.set(symbol.key, list);
  }
  const shadowed = (name, offset) => (locals.get(name) || []).some(item => item.start <= offset && offset <= item.end && item.declared < offset);
  const declared = new Set(routines.map(routine => routine.nameStart)), candidates = [], dynamic = [];
  const site = (caller, start, end, kind) => dynamic.push({ caller: caller.id, path, start, end, line: lineAt(start), kind });
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== 'identifier' || tokens[i - 1]?.value === '.' || word(tokens[i - 1], 'END') || declared.has(token.start)) continue;
    const caller = callerAt(token.start);
    if (!caller) continue;
    if (word(token, 'EXECUTE') && word(tokens[i + 1], 'IMMEDIATE')) { site(caller, token.start, tokens[i + 1].end, 'EXECUTE IMMEDIATE'); i++; continue; }
    if (word(token, 'OPEN') && tokens[i + 1]?.kind === 'identifier' && word(tokens[i + 2], 'FOR') && !word(tokens[i + 3], 'SELECT') && !word(tokens[i + 3], 'WITH') && tokens[i + 3]?.value !== '(') { site(caller, token.start, tokens[i + 2].end, 'OPEN FOR with a string'); i += 2; continue; }
    const chain = [token]; let j = i;
    while (tokens[j + 1]?.value === '.' && tokens[j + 2]?.kind === 'identifier' && chain.length < 4) { chain.push(tokens[j + 2]); j += 2; }
    const after = tokens[j + 1];
    if (word(chain[0], 'DBMS_SQL') && chain.length > 1) { site(caller, token.start, chain.at(-1).end, 'DBMS_SQL'); i = j; continue; }
    // Named notation (name => value) and attributes (x%TYPE) are not calls.
    if (chain.length > 3 || after?.value === '%' || after?.value === '=' && tokens[j + 2]?.value === '>' || shadowed(keyOf(chain[0]), token.start)) { i = j; continue; }
    candidates.push({ caller: caller.id, path, names: chain.map(keyOf), start: token.start, end: chain.at(-1).end, line: lineAt(token.start) });
    i = j;
  }
  const references = sqlReferences(tokens, { callerAt: sweep(), shadowed, lineAt, path });
  const handlers = exceptionHandlers(model, tokens, { callerAt: sweep(), lineAt, path });
  return { path, routines, candidates, dynamic, references, handlers, errors: model.errors || [], complete: model.complete !== false };
}

// Resolves call candidates against every indexed routine. files: [{path, content}].
export function buildReferenceIndex(files, { skipped = [], truncated = false } = {}) {
  const indexed = files.map(file => indexPlsqlFile(file.path, file.content || ''));
  const routines = new Map(), standalone = new Map(), packaged = new Map();
  const add = (map, key, value) => { const list = map.get(key) || []; if (!list.includes(value)) list.push(value); map.set(key, list); };
  for (const file of indexed) for (const routine of file.routines) {
    // A routine's specification and body, and its overloads, share one id; every declaration is kept for navigation.
    const existing = routines.get(routine.id);
    if (existing) { existing.declarations.push(routine); continue; }
    const entry = { ...routine, declarations: [routine] };
    routines.set(routine.id, entry);
    if (routine.anonymous || routine.local || routine.kind === 'PACKAGE' || routine.kind === 'TYPE') continue;
    if (routine.package) add(packaged, `${routine.package}.${routine.name}`, entry); else add(standalone, routine.name, entry);
  }
  const sameOwner = (caller, list) => { const owned = list.filter(item => caller.owner && item.owner === caller.owner); return owned.length ? owned : list; };
  const resolve = (candidate, caller) => {
    const [a, b, c] = candidate.names;
    if (candidate.names.length === 1) {
      for (let scope = caller; scope && scope.kind !== 'PACKAGE' && scope.kind !== 'TYPE'; scope = scope.parent) { const local = routines.get(`${scope.id}/${a}`); if (local) return [local]; }
      const pkg = caller.package || (caller.kind === 'PACKAGE' ? caller.name : null);
      if (pkg) { const sibling = (packaged.get(`${pkg}.${a}`) || []).filter(item => !caller.owner || !item.owner || item.owner === caller.owner); if (sibling.length) return sibling; }
      return sameOwner(caller, standalone.get(a) || []);
    }
    if (candidate.names.length === 2) return sameOwner(caller, [...(packaged.get(`${a}.${b}`) || []), ...(standalone.get(b) || []).filter(item => item.owner === a)]);
    return (packaged.get(`${b}.${c}`) || []).filter(item => !item.owner || item.owner === a);
  };
  const calls = [];
  for (const file of indexed) for (const candidate of file.candidates) {
    const caller = routines.get(candidate.caller), targets = resolve(candidate, caller);
    for (const target of targets) calls.push({ caller: caller.id, callee: target.id, path: candidate.path, start: candidate.start, end: candidate.end, line: candidate.line, ambiguous: targets.length > 1 });
  }
  return {
    routines, calls, dynamic: indexed.flatMap(file => file.dynamic),
    references: indexed.flatMap(file => file.references), handlers: indexed.flatMap(file => file.handlers),
    problems: indexed.filter(file => !file.complete).map(file => ({ path: file.path, errors: file.errors })),
    fileCount: files.length, skipped, truncated,
  };
}

// The routine the caret names: a call under the caret first, otherwise the innermost routine around it.
export function routineAt(index, path, offset) {
  const key = String(path || '').toLowerCase();
  const call = index.calls.find(item => item.path.toLowerCase() === key && item.start <= offset && offset <= item.end);
  if (call) return index.routines.get(call.callee);
  let found = null;
  for (const routine of index.routines.values()) for (const declaration of routine.declarations) {
    if (declaration.path.toLowerCase() !== key || declaration.start > offset || offset > declaration.end) continue;
    if (!found || declaration.start >= found.start) found = { routine, start: declaration.start };
  }
  return found?.routine || null;
}

// One level of the hierarchy. Incoming: the routines that call id. Outgoing: the routines id calls. Call sites are grouped per routine.
export function callHierarchyLevel(index, id, direction) {
  const incoming = direction === 'incoming', groups = new Map();
  for (const call of index.calls) {
    if ((incoming ? call.callee : call.caller) !== id) continue;
    const other = incoming ? call.caller : call.callee;
    const group = groups.get(other) || { routine: index.routines.get(other), sites: [], ambiguous: false };
    group.sites.push(call); group.ambiguous ||= call.ambiguous; groups.set(other, group);
  }
  return [...groups.values()].sort((a, b) => routineLabel(a.routine).localeCompare(routineLabel(b.routine)));
}

export function dynamicSitesOf(index, id) { return index.dynamic.filter(site => site.caller === id); }

// Workspace sources are read from disk; open editors replace them with their current, possibly unsaved, text.
export function mergeIndexSources(files, documents) {
  const open = new Map((documents || []).filter(item => item?.path && typeof item.content === 'string').map(item => [pathKey(item.path), item]));
  const merged = (files || []).map(file => { const editor = open.get(pathKey(file.path)); if (editor) open.delete(pathKey(file.path)); return editor ? { path: file.path, content: editor.content, unsaved: Boolean(editor.dirty) } : file; });
  for (const editor of open.values()) if (/\.(sql|pks|pkb|pck|pls|plb|prc|fnc|trg|tps|tpb|typ)$/i.test(editor.path)) merged.push({ path: editor.path, content: editor.content, unsaved: Boolean(editor.dirty) });
  return merged;
}
