// Free-variable analysis for a JSX/JS module, independent of TypeScript.
// freeNames(code) -> Map(name -> {reads, writes}) of identifiers that resolve to no binding inside the module.
import { transform } from 'esbuild';
import { parseAst } from 'rollup/parseAst';

export async function parse(source) {
  const result = await transform(source, { loader: 'jsx', jsx: 'automatic' });
  return parseAst(result.code);
}

function patternNames(node, out) {
  if (!node) return;
  switch (node.type) {
    case 'Identifier': out.push(node.name); break;
    case 'ObjectPattern': for (const p of node.properties) patternNames(p.type === 'RestElement' ? p.argument : p.value, out); break;
    case 'ArrayPattern': for (const e of node.elements) patternNames(e, out); break;
    case 'AssignmentPattern': patternNames(node.left, out); break;
    case 'RestElement': patternNames(node.argument, out); break;
    default: throw new Error('pattern ' + node.type);
  }
}

class Scope {
  constructor(parent, fn) { this.parent = parent; this.fn = fn; this.names = new Set(); }
  fnScope() { let s = this; while (!s.fn) s = s.parent; return s; }
  has(name) { for (let s = this; s; s = s.parent) if (s.names.has(name)) return true; return false; }
}

export function analyse(ast) {
  const free = new Map();
  const note = (name, kind) => { const e = free.get(name) || { reads: 0, writes: 0 }; e[kind]++; free.set(name, e); };

  // Hoist declarations of a statement list into the scope before walking it.
  function declare(statements, scope) {
    for (const s of statements) hoist(s, scope, true);
  }
  function hoist(node, scope, top) {
    if (!node) return;
    switch (node.type) {
      case 'VariableDeclaration': {
        const names = []; for (const d of node.declarations) patternNames(d.id, names);
        const target = node.kind === 'var' ? scope.fnScope() : (top ? scope : null);
        if (target) for (const n of names) target.names.add(n);
        break;
      }
      case 'FunctionDeclaration': if (top) scope.names.add(node.id.name); break;
      case 'ClassDeclaration': if (top) scope.names.add(node.id.name); break;
      case 'ImportDeclaration': for (const sp of node.specifiers) scope.names.add(sp.local.name); break;
      case 'ExportNamedDeclaration': case 'ExportDefaultDeclaration': if (node.declaration) hoist(node.declaration, scope, top); break;
      // var declarations nested in blocks hoist to the function
      case 'BlockStatement': for (const s of node.body) hoist(s, scope, false); break;
      case 'IfStatement': hoist(node.consequent, scope, false); hoist(node.alternate, scope, false); break;
      case 'ForStatement': hoist(node.init, scope, false); hoist(node.body, scope, false); break;
      case 'ForInStatement': case 'ForOfStatement': hoist(node.left, scope, false); hoist(node.body, scope, false); break;
      case 'WhileStatement': case 'DoWhileStatement': case 'LabeledStatement': hoist(node.body, scope, false); break;
      case 'TryStatement': hoist(node.block, scope, false); if (node.handler) hoist(node.handler.body, scope, false); hoist(node.finalizer, scope, false); break;
      case 'SwitchStatement': for (const c of node.cases) for (const s of c.consequent) hoist(s, scope, false); break;
    }
  }

  function fnBody(node, scope) {
    const inner = new Scope(scope, true);
    if (node.type === 'FunctionExpression' && node.id) inner.names.add(node.id.name);
    const params = []; for (const p of node.params) patternNames(p, params);
    for (const n of params) inner.names.add(n);
    if (node.type !== 'ArrowFunctionExpression') inner.names.add('arguments');
    for (const p of node.params) patternDefaults(p, inner);
    if (node.body.type === 'BlockStatement') { declare(node.body.body, inner); for (const s of node.body.body) walk(s, inner); }
    else walk(node.body, inner);
  }
  // Default values and computed keys inside patterns are expressions.
  function patternDefaults(node, scope) {
    if (!node) return;
    switch (node.type) {
      case 'ObjectPattern': for (const p of node.properties) { if (p.type === 'RestElement') patternDefaults(p.argument, scope); else { if (p.computed) walk(p.key, scope); patternDefaults(p.value, scope); } } break;
      case 'ArrayPattern': for (const e of node.elements) patternDefaults(e, scope); break;
      case 'AssignmentPattern': walk(node.right, scope); patternDefaults(node.left, scope); break;
      case 'RestElement': patternDefaults(node.argument, scope); break;
    }
  }
  // Assignment targets: identifiers written, member expressions read.
  function target(node, scope) {
    switch (node.type) {
      case 'Identifier': if (!scope.has(node.name)) note(node.name, 'writes'); else written.add(node.name); break;
      case 'MemberExpression': walk(node, scope); break;
      case 'ObjectPattern': for (const p of node.properties) { if (p.type === 'RestElement') target(p.argument, scope); else { if (p.computed) walk(p.key, scope); target(p.value, scope); } } break;
      case 'ArrayPattern': for (const e of node.elements) if (e) target(e, scope); break;
      case 'AssignmentPattern': walk(node.right, scope); target(node.left, scope); break;
      case 'RestElement': target(node.argument, scope); break;
      default: walk(node, scope);
    }
  }
  const written = new Set();

  function walk(node, scope) {
    if (!node) return;
    if (Array.isArray(node)) { for (const n of node) walk(n, scope); return; }
    switch (node.type) {
      case 'Identifier': if (!scope.has(node.name)) note(node.name, 'reads'); return;
      case 'Literal': case 'ThisExpression': case 'Super': case 'MetaProperty': case 'EmptyStatement': case 'DebuggerStatement': case 'TemplateElement': case 'BreakStatement': case 'ContinueStatement': return;
      case 'ImportDeclaration': return;
      case 'ExportNamedDeclaration': if (node.declaration) walk(node.declaration, scope); else if (!node.source) for (const sp of node.specifiers) walk(sp.local, scope); return;
      case 'ExportDefaultDeclaration': walk(node.declaration, scope); return;
      case 'ExportAllDeclaration': return;
      case 'VariableDeclaration': for (const d of node.declarations) { patternDefaults(d.id, scope); walk(d.init, scope); } return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': fnBody(node, scope); return;
      case 'ClassDeclaration': case 'ClassExpression': {
        const inner = new Scope(scope, false); if (node.id) inner.names.add(node.id.name);
        walk(node.superClass, scope);
        for (const m of node.body.body) { if (m.computed) walk(m.key, inner); if (m.type === 'StaticBlock') { const b = new Scope(inner, true); declare(m.body, b); walk(m.body, b); } else walk(m.value, inner); }
        return;
      }
      case 'BlockStatement': { const inner = new Scope(scope, false); declare(node.body, inner); walk(node.body, inner); return; }
      case 'Program': { declare(node.body, scope); walk(node.body, scope); return; }
      case 'ForStatement': { const inner = new Scope(scope, false); if (node.init?.type === 'VariableDeclaration') hoist(node.init, inner, true); walk(node.init, inner); walk(node.test, inner); walk(node.update, inner); walk(node.body, inner); return; }
      case 'ForInStatement': case 'ForOfStatement': {
        const inner = new Scope(scope, false);
        if (node.left.type === 'VariableDeclaration') { hoist(node.left, inner, true); for (const d of node.left.declarations) patternDefaults(d.id, inner); } else target(node.left, inner);
        walk(node.right, inner); walk(node.body, inner); return;
      }
      case 'SwitchStatement': { walk(node.discriminant, scope); const inner = new Scope(scope, false); for (const c of node.cases) declare(c.consequent, inner); for (const c of node.cases) { walk(c.test, inner); walk(c.consequent, inner); } return; }
      case 'TryStatement': walk(node.block, scope); if (node.handler) { const inner = new Scope(scope, false); if (node.handler.param) { const names = []; patternNames(node.handler.param, names); for (const n of names) inner.names.add(n); patternDefaults(node.handler.param, inner); } declare(node.handler.body.body, inner); walk(node.handler.body.body, inner); } walk(node.finalizer, scope); return;
      case 'LabeledStatement': walk(node.body, scope); return;
      case 'MemberExpression': walk(node.object, scope); if (node.computed) walk(node.property, scope); return;
      case 'Property': if (node.computed) walk(node.key, scope); walk(node.value, scope); return;
      case 'PropertyDefinition': case 'MethodDefinition': if (node.computed) walk(node.key, scope); walk(node.value, scope); return;
      case 'AssignmentExpression': target(node.left, scope); if (node.operator !== '=' && node.left.type === 'Identifier' && !scope.has(node.left.name)) note(node.left.name, 'reads'); walk(node.right, scope); return;
      case 'UpdateExpression': target(node.argument, scope); return;
      case 'ExpressionStatement': walk(node.expression, scope); return;
      case 'ReturnStatement': case 'ThrowStatement': case 'SpreadElement': case 'UnaryExpression': case 'AwaitExpression': case 'YieldExpression': case 'RestElement': walk(node.argument, scope); return;
      case 'IfStatement': case 'ConditionalExpression': walk(node.test, scope); walk(node.consequent, scope); walk(node.alternate, scope); return;
      case 'WhileStatement': case 'DoWhileStatement': walk(node.test, scope); walk(node.body, scope); return;
      case 'BinaryExpression': case 'LogicalExpression': walk(node.left, scope); walk(node.right, scope); return;
      case 'CallExpression': case 'NewExpression': walk(node.callee, scope); walk(node.arguments, scope); return;
      case 'ImportExpression': walk(node.source, scope); return;
      case 'ChainExpression': case 'ParenthesizedExpression': walk(node.expression, scope); return;
      case 'SequenceExpression': walk(node.expressions, scope); return;
      case 'ArrayExpression': walk(node.elements, scope); return;
      case 'ObjectExpression': walk(node.properties, scope); return;
      case 'TemplateLiteral': walk(node.expressions, scope); return;
      case 'TaggedTemplateExpression': walk(node.tag, scope); walk(node.quasi, scope); return;
      default: throw new Error('unhandled node ' + node.type);
    }
  }
  const root = new Scope(null, true);
  walk(ast, root);
  return { free, root, written };
}

export async function freeNames(source) { return analyse(await parse(source)).free; }

// Names bound at module level, and at the top level of the exported function component (App by default).
export async function appBindings(source, component = 'App') {
  const ast = await parse(source);
  const moduleNames = new Map(); // name -> {kind:'import', source, imported, type} | {kind:'decl'}
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') for (const sp of node.specifiers) moduleNames.set(sp.local.name, { kind: 'import', source: node.source.value, type: sp.type, imported: sp.imported?.name });
    else { const names = []; collectTop(node, names); for (const n of names) moduleNames.set(n, { kind: 'decl' }); }
  }
  const app = ast.body.find(n => n.type === 'ExportNamedDeclaration' && n.declaration?.id?.name === component)?.declaration;
  if (!app) throw new Error(`no exported function ${component}`);
  const appNames = new Set();
  const params = []; for (const p of app.params) patternNames(p, params); for (const n of params) appNames.add(n);
  for (const s of app.body.body) { const names = []; collectTop(s, names); for (const n of names) appNames.add(n); }
  // var declarations nested deeper inside App would also be function-scoped; report them so they are never missed.
  const nestedVars = [];
  (function findVars(node, depth) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) findVars(n, depth); return; }
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return;
    if (node.type === 'VariableDeclaration' && node.kind === 'var' && depth > 0) { const names = []; for (const d of node.declarations) patternNames(d.id, names); nestedVars.push(...names); }
    for (const key of Object.keys(node)) if (key !== 'type') findVars(node[key], depth + 1);
  })(app.body.body, 0);
  return { moduleNames, appNames, nestedVars };
}
function collectTop(node, out) {
  if (node.type === 'ExportNamedDeclaration' && node.declaration) return collectTop(node.declaration, out);
  if (node.type === 'VariableDeclaration') for (const d of node.declarations) patternNames(d.id, out);
  else if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') out.push(node.id.name);
}
