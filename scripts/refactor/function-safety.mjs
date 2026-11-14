// Which function declarations of a component can move into a module behind a wrapper that passes the component's values in one object.
//   node scripts/refactor/function-safety.mjs [--file src/App.jsx] [--component App] [--min 600]
// The wrapper builds that object when it is called, so it reads every const the body reads at that moment. A function is reported OK only
// if each of those consts is initialised before the earliest point the render can reach a reference to the function.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { freeNames, appBindings } from './scope.mjs';
import { parseAst, findComponent, patternIds, containsFunction, parseArgs } from './lib.mjs';

export async function analyseFunctions(src, component = 'App') {
  const ast = parseAst(src, { jsx: true });
  const app = findComponent(ast, component);
  const { moduleNames, appNames } = await appBindings(src, component);
  const top = app.body.body;
  const constEnd = new Map(), fnDecl = new Map(), kinds = new Map();
  for (const s of top) {
    if (s.type === 'VariableDeclaration') { const ns = []; s.declarations.forEach(d => patternIds(d.id, ns)); ns.forEach(n => { constEnd.set(n, s.end); kinds.set(n, s.kind); }); }
    if (s.type === 'FunctionDeclaration') fnDecl.set(s.id.name, s);
  }
  // Every reference to a component name, with its top-level statement, the enclosing top-level function declaration if any, and whether it
  // sits in an effect callback. A nested binding that shadows the name makes this over-report, which only makes the result more conservative.
  const refs = new Map();
  for (const s of top) {
    const isEffect = s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && ['useEffect', 'useLayoutEffect'].includes(s.expression.callee.name);
    const effectCb = isEffect ? s.expression.arguments[0] : null;
    (function walk(node, parentKey, inEffect) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(n => walk(n, parentKey, inEffect)); return; }
      if (node === effectCb) inEffect = true;
      if (node.type === 'Identifier' && appNames.has(node.name) && parentKey !== 'property' && parentKey !== 'key-noncomputed' && parentKey !== 'decl-id') {
        if (!refs.has(node.name)) refs.set(node.name, []);
        refs.get(node.name).push({ stmt: s, fn: s.type === 'FunctionDeclaration' ? s.id.name : null, inEffect });
      }
      for (const k of Object.keys(node)) {
        if (k === 'type' || k === 'start' || k === 'end') continue;
        let pk = k;
        if (node.type === 'MemberExpression' && k === 'property' && !node.computed) pk = 'property';
        else if ((node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') && k === 'key' && !node.computed) pk = node.shorthand ? 'value' : 'key-noncomputed';
        else if (node.type === 'JSXAttribute' || node.type === 'JSXIdentifier') pk = 'property';
        else if (s.type === 'FunctionDeclaration' && node === s && k === 'id') pk = 'decl-id';
        walk(node[k], pk, inEffect);
      }
    })(s, null, false);
  }
  // Earliest point a reference can run during the render: its statement's start; for a reference inside function g, the earliest point of g's
  // references; effects run after the render. Recursion through hoisted functions is unknown and treated as the start of the component.
  const memo = new Map();
  function earliest(name, stack = new Set()) {
    if (memo.has(name)) return memo.get(name);
    if (stack.has(name)) return -Infinity;
    stack.add(name);
    let min = Infinity;
    for (const r of refs.get(name) || []) {
      if (r.fn === name) continue;
      const at = r.inEffect ? Infinity : r.fn ? earliest(r.fn, stack) : r.stmt.start;
      if (at < min) min = at;
    }
    stack.delete(name); memo.set(name, min); return min;
  }
  const results = [];
  for (const [name, decl] of fnDecl) {
    const body = src.slice(decl.body.start + 1, decl.body.end - 1);
    const free = await freeNames(src.slice(decl.start, decl.end));
    free.delete(name);
    const appUsed = [...free.keys()].filter(n => appNames.has(n)).sort();
    const latest = Math.max(-1, ...appUsed.filter(n => constEnd.has(n)).map(n => constEnd.get(n)));
    const at = earliest(name);
    const problems = [];
    const only = decl.body.body.length === 1 && decl.body.body[0].type === 'ReturnStatement' ? decl.body.body[0].argument : null;
    if (only?.type === 'CallExpression' && only.callee.type === 'MemberExpression' && moduleNames.get(only.callee.object.name)?.type === 'ImportNamespaceSpecifier') problems.push('already a wrapper of a moved body');
    if (appUsed.some(n => kinds.get(n) && kinds.get(n) !== 'const')) problems.push('reads a let or var');
    if (decl.generator) problems.push('generator');
    // Parameter defaults and patterns stay in the wrapper; a function inside them would close over the wrapper's parameters.
    if (containsFunction(decl.params)) problems.push('function in params');
    const boundParams = []; decl.params.forEach(p => patternIds(p, boundParams));
    // this, arguments and new.target of the declaration itself (nested non-arrow functions have their own).
    let own = false;
    (function walk(n, isTop) {
      if (!n || typeof n !== 'object' || own) return;
      if (Array.isArray(n)) { n.forEach(x => walk(x, false)); return; }
      if (!isTop && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression')) return;
      if (n.type === 'ThisExpression' || n.type === 'MetaProperty' || (n.type === 'Identifier' && n.name === 'arguments')) own = true;
      for (const k of Object.keys(n)) if (k !== 'type') walk(n[k], false);
    })(decl.body, true);
    if (own) problems.push('this/arguments/new.target');
    if ([...free.values()].some(e => e.writes)) problems.push('assigns to a component value');
    if (!(latest <= at)) problems.push(`may run before a const it reads is initialised (offset ${latest} > ${at})`);
    const modUsed = [...free.keys()].filter(n => !appNames.has(n) && moduleNames.has(n));
    if (modUsed.some(n => moduleNames.get(n).kind !== 'import')) problems.push('reads a declaration of the component module');
    // Names the body reads once the parameters are bound. A body that calls its own function by name gets the wrapper through ctx.
    const bodyFree = await freeNames(`(${decl.async ? 'async ' : ''}function(${boundParams.join(',')}){${body}})`);
    const bodyAppUsed = [...bodyFree.keys()].filter(n => appNames.has(n)).sort();
    const bodyModUsed = [...bodyFree.keys()].filter(n => !appNames.has(n) && moduleNames.has(n));
    results.push({ name, decl, size: decl.end - decl.start, problems, async: decl.async, boundParams, bodyAppUsed, bodyModUsed });
  }
  return { results, app, moduleNames, appNames };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { options } = parseArgs(process.argv.slice(2), { file: 'src/App.jsx', component: 'App', min: '600' });
  const { results } = await analyseFunctions(fs.readFileSync(options.file, 'utf8'), options.component);
  for (const r of results.filter(r => r.size >= +options.min).sort((a, b) => b.size - a.size))
    console.log(String(r.size).padStart(6), r.name + (r.async ? ' (async)' : ''), `${r.bodyAppUsed.length} names`, r.problems.join('; ') || 'OK');
}
