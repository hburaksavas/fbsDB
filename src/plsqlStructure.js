import { lexOracle } from './oracleLexer.js';

const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;
const key = token => token?.quoted ? token.value : token?.value?.toUpperCase();
const name = token => ({ name: token.value, key: key(token), quoted: !!token.quoted, start: token.start });
const rawType = tokens => tokens.map(token => token.quoted ? `"${token.value.replace(/"/g, '""')}"` : token.value).join('');
const typeTokens = tokens => {
  let end = tokens.findIndex(token => token.value === ':' || word(token, 'DEFAULT') || word(token, 'NOT') || word(token, 'CONSTANT'));
  if (end < 0) end = tokens.length;
  return tokens.slice(0, end).filter(token => !['IN', 'OUT', 'NOCOPY'].some(value => word(token, value)));
};

class Parser {
  constructor(source) {
    this.source = source; this.all = lexOracle(source); this.tokens = this.all.filter(token => token.kind !== 'comment');
    this.at = 0; this.scopes = []; this.errors = []; this.root = { kind: 'module', start: 0, end: source.length, children: [] };
    if (this.all.some(token => token.open && !(token.kind === 'comment' && source.startsWith('--', token.start)))) this.errors.push('Unclosed literal, identifier or comment.');
    if (this.tokens.some(token => /^\$(?:IF|THEN|ELSE|ELSIF|END|ERROR)$/i.test(token.value))) this.errors.push('Conditional compilation directives are preserved without formatting.');
  }
  token(offset = 0) { return this.tokens[this.at + offset]; }
  is(value) { return word(this.token(), value); }
  scope(parent, start) { const scope = { parent, start, end: this.source.length, symbols: [], types: [], routines: [], label: this.pendingLabel }; this.pendingLabel = null; this.scopes.push(scope); return scope; }
  label() {
    if (this.token()?.value === '<' && this.token(1)?.value === '<' && this.token(2)?.kind === 'identifier' && this.token(3)?.value === '>' && this.token(4)?.value === '>') { const label = { ...name(this.token(2)), start: this.token().start }; this.at += 5; return label; }
    return null;
  }
  fail(message) { this.errors.push(message); }
  until(stopWords, semicolon = false) {
    const begin = this.at; let depth = 0, cases = 0;
    while (this.at < this.tokens.length) {
      const token = this.token();
      if (!depth && !cases && (stopWords.some(value => word(token, value)) || semicolon && token.value === ';')) break;
      if (token.value === '(') depth++;
      if (token.value === ')') { if (!depth) break; depth--; }
      if (word(token, 'CASE')) cases++;
      if (word(token, 'END') && cases) cases--;
      this.at++;
    }
    return this.tokens.slice(begin, this.at);
  }
  endNode(node, scope, closingWord) {
    if (!this.is('END')) { this.fail('Missing END.'); node.end = this.source.length; return node; }
    node.closeStart = this.token().start; this.at++;
    if (closingWord && word(this.token(), closingWord)) this.at++;
    if (this.token()?.kind === 'identifier') this.at++;
    if (this.token()?.value === ';') this.at++; else this.fail('Missing semicolon after END.');
    node.end = this.tokens[this.at - 1]?.end || node.closeStart;
    if (scope) scope.end = node.end;
    return node;
  }
  parameters(tokens) {
    const parameters = []; if (tokens[0]?.value !== '(') return parameters;
    let current = [], depth = 0;
    const finish = () => {
      if (current[0]?.kind === 'identifier') {
        const type = rawType(typeTokens(current.slice(1)));
        parameters.push({ ...name(current[0]), kind: 'parameter', type, mode: current.some(token => word(token, 'OUT')) ? current.some(token => word(token, 'IN')) ? 'IN/OUT' : 'OUT' : 'IN', optional: current.some(token => word(token, 'DEFAULT') || token.value === ':'), position: parameters.length + 1 });
      }
      current = [];
    };
    for (const token of tokens.slice(1)) {
      if (token.value === ')' && !depth) { finish(); break; }
      if (token.value === ',' && !depth) { finish(); continue; }
      current.push(token);
      if (token.value === '(') depth++; if (token.value === ')') depth--;
    }
    return parameters;
  }
  declaration(scope) {
    const first = this.token();
    if (this.is('PROCEDURE') || this.is('FUNCTION')) return this.routine(scope, false);
    const begin = this.at; this.until(['BEGIN', 'END'], true);
    if (this.at === begin) { this.fail('Unsupported declaration.'); this.at++; return null; }
    const content = this.tokens.slice(begin, this.at), node = { kind: 'declaration', start: first.start, end: content.at(-1)?.end, fields: [] };
    if (this.token()?.value === ';') node.end = this.tokens[this.at++].end; else this.fail('Incomplete declaration.');
    if (word(first, 'TYPE') || word(first, 'SUBTYPE')) {
      const typeName = content[1], isAt = content.findIndex(token => word(token, 'IS'));
      if (typeName?.kind !== 'identifier' || isAt < 0) return node;
      const definition = content.slice(isAt + 1), type = { ...name(typeName), kind: 'alias', type: rawType(definition), fields: [] };
      if (word(definition[0], 'RECORD') && definition[1]?.value === '(') {
        type.kind = 'record'; let current = [], depth = 0;
        const finish = () => { if (current[0]?.kind === 'identifier') { const field = { ...name(current[0]), kind: 'field', type: rawType(typeTokens(current.slice(1))) }; type.fields.push(field); node.fields.push(field); } current = []; };
        for (const token of definition.slice(2)) {
          if (token.value === ')' && !depth) { finish(); node.fieldsEnd = token.start; break; }
          if (token.value === ',' && !depth) { finish(); continue; }
          current.push(token); if (token.value === '(') depth++; if (token.value === ')') depth--;
        }
      } else if (definition.some(token => word(token, 'OF'))) {
        const of = definition.findIndex(token => word(token, 'OF')), index = definition.findIndex(token => word(token, 'INDEX'));
        type.kind = 'collection'; type.elementType = rawType(definition.slice(of + 1, index < 0 ? undefined : index));
      }
      scope.types.push(type); scope.symbols.push({ ...type, kind: 'type', type: type.name });
    } else if (word(first, 'CURSOR') && content[1]?.kind === 'identifier') {
      const selectAt = content.findIndex(token => word(token, 'SELECT'));
      const cursor = { ...name(content[1]), kind: 'cursor', type: content[1].value + '%ROWTYPE', query: selectAt < 0 ? '' : this.source.slice(content[selectAt].start, content.at(-1).end) };
      scope.symbols.push(cursor);
    } else if (first.kind === 'identifier' && !['PRAGMA', 'EXCEPTION', 'END'].includes(key(first)) && content[1]) {
      const body = word(content[1], 'CONSTANT') ? content.slice(2) : content.slice(1);
      scope.symbols.push({ ...name(first), kind: word(content[1], 'CONSTANT') ? 'constant' : 'variable', type: rawType(typeTokens(body)) });
    }
    return node;
  }
  declarations(scope) {
    const nodes = [];
    while (this.at < this.tokens.length && !this.is('BEGIN') && !this.is('END')) {
      const previous = this.at, node = this.declaration(scope); if (node) nodes.push(node);
      if (this.at === previous) { this.fail('Unsupported declaration.'); break; }
    }
    return nodes;
  }
  routine(parent, create) {
    const start = this.token().start; let kind = key(this.token());
    if (create) {
      while (this.at < this.tokens.length && !['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'].some(value => this.is(value))) this.at++;
      kind = key(this.token());
    }
    this.at++;
    if ((kind === 'PACKAGE' || kind === 'TYPE') && this.is('BODY')) this.at++;
    let routineName = this.token(); this.at++;
    if (this.token()?.value === '.') { this.at++; routineName = this.token(); this.at++; }
    const headerStart = this.at, header = this.until(['IS', 'AS', 'BEGIN'], true);
    const parameters = this.parameters(header), returnAt = header.findIndex(token => word(token, 'RETURN'));
    const modifierAt = header.findIndex((token, at) => at > returnAt && ['AUTHID', 'DETERMINISTIC', 'PIPELINED', 'PARALLEL_ENABLE', 'RESULT_CACHE', 'ACCESSIBLE', 'AGGREGATE'].some(value => word(token, value)));
    const routine = { ...name(routineName || this.tokens[0]), kind: 'routine', routineKind: kind, parameters, returnType: returnAt < 0 ? null : rawType(header.slice(returnAt + 1, modifierAt < 0 ? undefined : modifierAt)), subprogramId: start };
    if (kind === 'FUNCTION' || kind === 'PROCEDURE') { parent?.routines.push(routine); parent?.symbols.push({ ...routine, type: routine.returnType || 'PROCEDURE' }); }
    const node = { kind: 'routine', routineKind: kind, start, declarations: [], children: [] };
    if (this.token()?.value === ';') { node.end = this.tokens[this.at++].end; return node; }
    const scope = this.scope(parent, start); scope.symbols.push(...parameters); routine.scope = scope;
    if (this.is('IS') || this.is('AS')) { node.headerEnd = this.tokens[this.at++].end; node.declarations = this.declarations(scope); }
    else if (!this.is('BEGIN')) { this.fail('Incomplete routine header.'); node.end = this.source.length; return node; }
    if (this.is('BEGIN')) { node.begin = this.tokens[this.at++].start; node.children = this.statements(scope, ['END', 'EXCEPTION']); }
    if (this.is('EXCEPTION')) node.handlers = this.handlers(scope);
    this.endNode(node, scope);
    // A forward declaration shares its signature with a later body; both retain source offsets.
    if (headerStart === this.at) this.fail('Empty routine.');
    return node;
  }
  block(parent) {
    const node = { kind: 'block', start: this.token().start, declarations: [], children: [] }, scope = this.scope(parent, this.token().start);
    if (this.is('DECLARE')) { node.declare = this.tokens[this.at++].start; node.declarations = this.declarations(scope); }
    if (this.is('BEGIN')) { node.begin = this.tokens[this.at++].start; node.children = this.statements(scope, ['END', 'EXCEPTION']); }
    else this.fail('Missing BEGIN.');
    if (this.is('EXCEPTION')) node.handlers = this.handlers(scope);
    return this.endNode(node, scope);
  }
  handlers(scope) {
    const node = { kind: 'handlers', start: this.tokens[this.at++].start, children: [] };
    while (this.is('WHEN')) {
      const branch = { kind: 'branch', start: this.token().start }; this.at++; this.until(['THEN']);
      if (this.is('THEN')) this.at++; else this.fail('Missing THEN.');
      branch.children = this.statements(scope, ['WHEN', 'END']); node.children.push(branch);
    }
    return node;
  }
  conditional(scope, kind) {
    const start = this.token().start, node = { kind, start, branches: [] }; this.at++;
    if (kind === 'if') {
      this.until(['THEN']); if (this.is('THEN')) this.at++; else this.fail('Missing THEN.');
      node.branches.push({ start, children: this.statements(scope, ['ELSIF', 'ELSE', 'END']) });
      while (this.is('ELSIF') || this.is('ELSE')) {
        const branchStart = this.token().start, otherwise = this.is('ELSE'); this.at++;
        if (!otherwise) { this.until(['THEN']); if (this.is('THEN')) this.at++; else this.fail('Missing THEN.'); }
        node.branches.push({ start: branchStart, children: this.statements(scope, ['ELSIF', 'ELSE', 'END']) });
      }
      return this.endNode(node, null, 'IF');
    }
    this.until(['WHEN']);
    while (this.is('WHEN') || this.is('ELSE')) {
      const branch = { start: this.token().start }, otherwise = this.is('ELSE'); this.at++;
      if (!otherwise) { this.until(['THEN']); if (this.is('THEN')) this.at++; else this.fail('Missing THEN.'); }
      branch.children = this.statements(scope, ['WHEN', 'ELSE', 'END']); node.branches.push(branch);
    }
    return this.endNode(node, null, 'CASE');
  }
  loop(parent) {
    const start = this.token().start, isFor = this.is('FOR'), iterator = isFor ? this.token(1) : null, header = this.until(['LOOP']);
    const node = { kind: 'loop', start, children: [] }, scope = this.scope(parent, start);
    if (this.is('LOOP')) this.at++; else { this.fail('Missing LOOP.'); this.at++; }
    if (iterator?.kind === 'identifier') {
      const inAt = header.findIndex(token => word(token, 'IN'));
      const iteration = header.slice(inAt + 1), queryAt = iteration.findIndex(token => word(token, 'SELECT'));
      scope.symbols.push({ ...name(iterator), kind: 'iterator', type: queryAt >= 0 ? 'CURSOR RECORD' : iteration[0]?.kind === 'number' || iteration.some((token, at) => token.value.includes('..') || token.value === '.' && iteration[at + 1]?.value === '.') ? 'PLS_INTEGER' : (iteration[0]?.value || 'PLS_INTEGER') + '%ROWTYPE', query: queryAt < 0 ? null : this.source.slice(iteration[queryAt].start, iteration.at(-1)?.value === ')' ? iteration.at(-1).start : iteration.at(-1).end) });
    }
    node.children = this.statements(scope, ['END']); return this.endNode(node, scope, 'LOOP');
  }
  statements(scope, stops) {
    const nodes = [];
    while (this.at < this.tokens.length && !stops.some(value => this.is(value))) {
      const previous = this.at;
      const label = this.label(); this.pendingLabel = label;
      if (this.is('DECLARE') || this.is('BEGIN')) nodes.push(this.block(scope));
      else if (this.is('IF')) nodes.push(this.conditional(scope, 'if'));
      else if (this.is('CASE')) nodes.push(this.conditional(scope, 'case'));
      else if (this.is('FOR') || this.is('WHILE') || this.is('LOOP')) nodes.push(this.loop(scope));
      else {
        const start = this.token().start, tokens = this.until(stops, true);
        if (this.token()?.value === ';') this.at++; else if (tokens.length) this.fail('Missing statement semicolon.');
        nodes.push({ kind: 'statement', start, end: this.tokens[this.at - 1]?.end || start });
      }
      this.pendingLabel = null; if (label && nodes.length) nodes.at(-1).labelStart = label.start;
      if (previous === this.at) { this.fail('Unsupported statement.'); this.at++; }
    }
    return nodes;
  }
  parse() {
    const rootScope = this.scope(null, 0);
    while (this.at < this.tokens.length) {
      const previous = this.at;
      const label = this.label(); this.pendingLabel = label;
      if (this.is('DECLARE') || this.is('BEGIN')) this.root.children.push(this.block(rootScope));
      else if (this.is('CREATE')) this.root.children.push(this.routine(rootScope, true));
      else if (['PACKAGE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE'].some(value => this.is(value))) this.root.children.push(this.routine(rootScope, false));
      else if (this.token()?.value === '/' && this.source.slice(this.source.lastIndexOf('\n', this.token().start - 1) + 1, this.source.indexOf('\n', this.token().end) < 0 ? this.source.length : this.source.indexOf('\n', this.token().end)).trim() === '/') { this.root.children.push({ kind: 'delimiter', start: this.token().start, end: this.tokens[this.at++].end }); }
      else { this.fail('Unsupported PL/SQL unit.'); break; }
      this.pendingLabel = null; if (label && this.root.children.length) this.root.children.at(-1).labelStart = label.start;
      if (previous === this.at) break;
    }
    return { ...this.root, source: this.source, tokens: this.all, scopes: this.scopes, errors: this.errors, complete: !this.errors.length };
  }
}

let cachedSource, cachedModel;
export function parsePlsql(source) {
  if (source === cachedSource) return cachedModel;
  cachedSource = source;
  try { cachedModel = new Parser(source).parse(); }
  catch { cachedModel = { kind: 'module', source, tokens: lexOracle(source), scopes: [], children: [], errors: ['Incomplete PL/SQL structure.'], complete: false }; }
  return cachedModel;
}

export function plsqlScopesAt(source, cursor) {
  return parsePlsql(source).scopes.filter(scope => scope.start <= cursor && cursor <= scope.end).sort((a, b) => a.start - b.start);
}

export function plsqlVisibleSymbols(source, cursor) {
  const symbols = new Map();
  for (const scope of plsqlScopesAt(source, cursor)) for (const symbol of scope.symbols) if (symbol.start < cursor) symbols.set(symbol.key, symbol);
  return [...symbols.values()];
}

export function plsqlVisibleTypes(source, cursor) {
  const types = new Map();
  for (const scope of plsqlScopesAt(source, cursor)) for (const type of scope.types) if (type.start < cursor) types.set(type.key, type);
  return types;
}

export function plsqlVisibleRoutines(source, cursor) {
  const visible = new Map();
  for (const scope of plsqlScopesAt(source, cursor)) {
    const groups = new Map();
    for (const routine of scope.routines.filter(routine => routine.start < cursor)) {
      if (!groups.has(routine.key)) groups.set(routine.key, new Map());
      groups.get(routine.key).set(JSON.stringify(routine.parameters.map(parameter => [parameter.name, parameter.type, parameter.mode])), routine);
    }
    for (const [key, group] of groups) visible.set(key, [...group.values()]);
  }
  return [...visible.values()].flat();
}
