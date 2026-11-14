// Checks a move-effects.mjs stage independently of how it was produced.
//   node scripts/refactor/verify-effects.mjs <stage dir>
// Puts each moved body back as the effect callback's block and requires the original component file byte for byte outside import lines;
// checks that each call is the whole body of a parameterless arrow, that ctx lists match, that ctx is read only by the destructuring, and the imports.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { freeNames } from './scope.mjs';
import { parseAst, eolOf, checkImports, firstDifference } from './lib.mjs';

export async function verifyEffects(stage, log = console.log) {
  const failures = [], fail = (m) => { failures.push(m); log('FAIL ' + m); };
  const { file, modules } = JSON.parse(fs.readFileSync(path.join(stage, 'plan-files.json'), 'utf8'));
  const orig = fs.readFileSync(path.join(stage, 'original', file), 'utf8'), next = fs.readFileSync(path.join(stage, file), 'utf8'), eol = eolOf(orig);
  const fns = new Map();
  for (const mfile of modules) {
    const msrc = fs.readFileSync(path.join(stage, mfile), 'utf8');
    if (msrc.includes('\r')) fail(mfile + ' has CR line endings');
    for (const n of parseAst(msrc, { jsx: mfile.endsWith('.jsx') }).body) {
      if (n.type === 'ImportDeclaration') continue;
      if (n.type !== 'ExportNamedDeclaration' || n.declaration?.type !== 'FunctionDeclaration') { fail(`top-level ${n.type} in ${mfile}`); continue; }
      const fn = n.declaration, b = fn.body.body;
      if (fn.async || fn.generator || fn.params.length !== 1 || fn.params[0].name !== 'ctx') fail('signature of ' + fn.id.name);
      if (b[0]?.type !== 'VariableDeclaration' || b[0].declarations.length !== 1 || b[0].declarations[0].init?.name !== 'ctx') { fail('ctx destructuring of ' + fn.id.name); continue; }
      const ctxNames = b[0].declarations[0].id.properties.map(p => { if (p.type !== 'Property' || !p.shorthand) fail('ctx entry of ' + fn.id.name); return p.key.name; });
      const body = msrc.slice(b[0].end, fn.body.end - 1);
      if ((await freeNames(`(()=>{${body}})`)).has('ctx')) fail('ctx read again in ' + fn.id.name);
      fns.set(fn.id.name, { ctxNames, body: body.replace(/\n/g, eol) });
    }
    log(`${mfile}: global names: ${[...(await freeNames(msrc)).keys()].sort().join(' ') || 'none'}`);
  }
  const calls = [];
  (function find(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => find(n, parent)); return; }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && fns.has(node.callee.name)) calls.push({ node, parent });
    for (const k of Object.keys(node)) if (k !== 'type' && typeof node[k] === 'object') find(node[k], node);
  })(parseAst(next, { jsx: true }), null);
  if (calls.length !== fns.size) fail(`${calls.length} calls for ${fns.size} functions`);
  let rebuilt = next;
  for (const { node, parent } of calls.sort((a, b) => b.node.start - a.node.start)) {
    const f = fns.get(node.callee.name);
    if (parent.type !== 'ArrowFunctionExpression' || parent.body !== node || parent.params.length || parent.async) fail(`${node.callee.name} is not the whole body of () =>`);
    const arg = node.arguments[0];
    if (node.arguments.length !== 1 || arg.type !== 'ObjectExpression') { fail('call of ' + node.callee.name); continue; }
    const passed = arg.properties.map(p => { if (p.type !== 'Property' || !p.shorthand) fail('ctx entry passed to ' + node.callee.name); return p.key.name; });
    if (JSON.stringify([...passed].sort()) !== JSON.stringify([...f.ctxNames].sort())) fail('ctx names differ for ' + node.callee.name);
    rebuilt = rebuilt.slice(0, node.start) + '{' + f.body + '}' + rebuilt.slice(node.end);
  }
  const strip = (t) => t.split('\n').filter(l => !l.startsWith('import ')).join('\n');
  if (strip(rebuilt) === strip(orig)) log(`OK ${calls.length} effects: putting the bodies back gives the original outside import lines`);
  else fail('putting the bodies back does not give the original:\n' + firstDifference(strip(rebuilt), strip(orig)));
  const { newSources } = await checkImports(orig, next, fail);
  log('new import sources: ' + (newSources.join(' ') || 'none'));
  log(failures.length ? 'VERIFY FAILED' : 'VERIFY OK');
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stage = process.argv[2];
  if (!stage) { console.error('usage: verify-effects.mjs <stage dir>'); process.exit(2); }
  process.exitCode = (await verifyEffects(stage)).length ? 1 : 0;
}
