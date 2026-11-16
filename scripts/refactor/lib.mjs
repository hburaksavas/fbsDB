// Shared helpers of the scripts/refactor tools. See scripts/refactor/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { parseAst } from 'rollup/parseAst';
import { freeNames, exportedComponent } from './scope.mjs';

export { parseAst };

export function parseArgs(argv, defaults) {
  const options = { ...defaults }, positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) { const key = arg.slice(2); if (!(key in defaults)) throw new Error(`unknown option ${arg}`); options[key] = argv[++i]; }
    else positional.push(arg);
  }
  return { options, positional };
}

export const eolOf = (text) => text.includes('\r\n') ? '\r\n' : '\n';

export function findComponent(ast, component) {
  return exportedComponent(ast, component);
}

export function patternIds(p, out) {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => patternIds(q.type === 'RestElement' ? q.argument : q.value, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach(e => patternIds(e, out));
  else if (p.type === 'AssignmentPattern') patternIds(p.left, out);
  else if (p.type === 'RestElement') patternIds(p.argument, out);
  else throw new Error('pattern ' + p.type);
  return out;
}

export function containsFunction(node) {
  let found = false;
  (function walk(n) {
    if (!n || typeof n !== 'object' || found) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (/Function/.test(n.type) || n.type === 'ClassExpression') { found = true; return; }
    for (const k of Object.keys(n)) if (k !== 'type') walk(n[k]);
  })(node);
  return found;
}

// Names joined with ", " and wrapped at `width` columns, each line starting with `indent`.
export function wrapNames(names, indent, width = 140) {
  const lines = []; let cur = '';
  for (const n of names) {
    const add = (cur ? ' ' : '') + n + ',';
    if (cur && indent.length + cur.length + add.length > width) { lines.push(indent + cur); cur = n + ','; } else cur += add;
  }
  if (cur) lines.push(indent + cur.replace(/,$/, ''));
  return lines;
}

export function importLine(from, specs, quote = '"', keepOrder = false) {
  const def = specs.find(s => s.type === 'ImportDefaultSpecifier'), ns = specs.find(s => s.type === 'ImportNamespaceSpecifier');
  const named = specs.filter(s => s.type === 'ImportSpecifier').map(s => s.imported === s.local ? s.local : `${s.imported} as ${s.local}`);
  if (!keepOrder) named.sort();
  const parts = [];
  if (def) parts.push(def.local);
  if (ns) parts.push(`* as ${ns.local}`);
  if (named.length) parts.push(`{ ${named.join(', ')} }`);
  return `import ${parts.join(', ')} from ${quote}${from}${quote};`;
}

// Import lines for the names a moved text reads from the component's module, in the order the existing modules use: local files first.
export function importsFor(names, moduleNames, into = new Map()) {
  for (const n of names) {
    const x = moduleNames.get(n);
    if (x?.kind !== 'import') throw new Error(`${n} is declared in the component's module, not imported; it cannot be reached from another module`);
    if (!into.has(x.source)) into.set(x.source, new Map());
    into.get(x.source).set(n, { type: x.type, local: n, imported: x.imported });
  }
  return into;
}
export function importBlock(bySource) {
  const rank = s => s.startsWith('.') ? 0 : 1, key = s => s.replace(/^\.\//, '').toLowerCase();
  return [...bySource.keys()].sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b))).map(s => importLine(s, [...bySource.get(s).values()]));
}

export const withoutImportLines = (text) => text.split('\n').map(l => l.startsWith('import ') ? '' : l).join('\n');

// Adds lines after the last top-level import.
export function insertAfterImports(text, lines) {
  if (!lines.length) return text;
  const last = parseAst(text, { jsx: true }).body.filter(n => n.type === 'ImportDeclaration').at(-1);
  if (!last) throw new Error('no import to insert after');
  return text.slice(0, last.end) + lines.map(l => eolOf(text) + l).join('') + text.slice(last.end);
}

// Imports the text no longer names become bare imports, which keeps the module evaluation order; specifiers that are still used keep their order.
export async function pruneImports(text) {
  const ast = parseAst(text, { jsx: true });
  const used = await freeNames(withoutImportLines(text));
  let out = text; const removed = [];
  for (const node of ast.body.filter(n => n.type === 'ImportDeclaration').reverse()) {
    if (!node.specifiers.length) continue;
    const keep = node.specifiers.filter(s => used.has(s.local.name));
    if (keep.length === node.specifiers.length) continue;
    removed.push(...node.specifiers.filter(s => !used.has(s.local.name)).map(s => s.local.name));
    const q = text.slice(node.source.start, node.source.start + 1);
    const line = keep.length ? importLine(node.source.value, keep.map(s => ({ type: s.type, local: s.local.name, imported: s.imported?.name })), q, true) : `import ${q}${node.source.value}${q};`;
    out = out.slice(0, node.start) + line + out.slice(node.end);
  }
  return { text: out, removed };
}

// Checks shared by the verify scripts: import order, dropped and added specifiers, new free names, unused imports.
export async function checkImports(orig, next, fail) {
  const specs = (t) => { const out = new Map(); for (const n of parseAst(t, { jsx: true }).body) if (n.type === 'ImportDeclaration') { const s = out.get(n.source.value) || new Set(); n.specifiers.forEach(x => s.add(x.local.name)); out.set(n.source.value, s); } return out; };
  const order = (t) => parseAst(t, { jsx: true }).body.filter(n => n.type === 'ImportDeclaration').map(n => n.source.value);
  const so = specs(orig), sn = specs(next), oo = order(orig), on = order(next);
  if (JSON.stringify(on.filter(s => oo.includes(s))) !== JSON.stringify(oo)) fail('import order changed');
  const origUsed = await freeNames(withoutImportLines(orig));
  for (const [k, s] of so) {
    const n = sn.get(k);
    if (!n) { fail('import removed: ' + k); continue; }
    for (const name of s) if (!n.has(name) && !origUsed.has(name)) fail('dropped an import that was unused before: ' + name);
    for (const name of n) if (!s.has(name)) fail('added specifier ' + name);
  }
  const before = new Set((await freeNames(orig)).keys()), after = new Set((await freeNames(next)).keys());
  const added = [...after].filter(n => !before.has(n));
  if (added.length) fail('component module reads new free names: ' + added.join(' '));
  const nextUsed = await freeNames(withoutImportLines(next));
  for (const [, s] of sn) for (const n of s) if (!nextUsed.has(n)) fail('unused import left: ' + n);
  return { newSources: on.filter(s => !oo.includes(s)) };
}

export function firstDifference(a, b) {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return `${JSON.stringify(a.slice(Math.max(0, i - 80), i + 80))}\nvs\n${JSON.stringify(b.slice(Math.max(0, i - 80), i + 80))}`;
}

// The stage folder holds the rewritten files plus original/ with copies of every file they replace.
export function writeStage(stage, file, text) { fs.mkdirSync(path.dirname(path.join(stage, file)), { recursive: true }); fs.writeFileSync(path.join(stage, file), text); }
export function keepOriginal(stage, srcDir, file) {
  const from = path.join(srcDir, file);
  if (fs.existsSync(from)) writeStage(path.join(stage, 'original'), file, fs.readFileSync(from, 'utf8'));
}
