// Checks a move-functions.mjs stage independently of how it was produced.
//   node scripts/refactor/verify-functions.mjs <stage dir>
// Puts each moved body back into its wrapper (restoring async) and requires the original component file byte for byte outside import
// lines; checks every wrapper, module signature and ctx list, that functions a module already had are unchanged, that no moved body reaches
// the module's own exports instead of the component's functions, the safety analysis of each moved function, and the imports.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { freeNames } from './scope.mjs';
import { analyseFunctions } from './function-safety.mjs';
import { parseAst, eolOf, findComponent, patternIds, containsFunction, checkImports, firstDifference } from './lib.mjs';

export async function verifyFunctions(stage, log = console.log) {
  const failures = [], fail = (m) => { failures.push(m); log('FAIL ' + m); };
  const { file, component, modules } = JSON.parse(fs.readFileSync(path.join(stage, 'plan-files.json'), 'utf8'));
  const orig = fs.readFileSync(path.join(stage, 'original', file), 'utf8'), next = fs.readFileSync(path.join(stage, file), 'utf8'), eol = eolOf(orig);
  const mods = new Map();
  for (const { ns, file: mfile } of modules) {
    const msrc = fs.readFileSync(path.join(stage, mfile), 'utf8');
    if (msrc.includes('\r')) fail(mfile + ' has CR line endings');
    const mast = parseAst(msrc, { jsx: mfile.endsWith('.jsx') });
    const exportNames = [], fns = new Map();
    for (const n of mast.body) {
      if (n.type === 'ImportDeclaration') continue;
      if (n.type !== 'ExportNamedDeclaration' || n.declaration?.type !== 'FunctionDeclaration') { fail(`top-level ${n.type} in ${mfile}`); continue; }
      exportNames.push(n.declaration.id.name);
    }
    for (const n of mast.body) {
      if (n.type !== 'ExportNamedDeclaration') continue;
      const fn = n.declaration, b = fn.body.body, name = fn.id.name;
      if (fn.generator || fn.params[0]?.name !== 'ctx' || fn.params.some(p => p.type !== 'Identifier')) fail('signature of ' + name);
      if (b[0]?.type !== 'VariableDeclaration' || b[0].declarations.length !== 1 || b[0].declarations[0].init?.name !== 'ctx' || b[0].declarations[0].id.type !== 'ObjectPattern') { fail('ctx destructuring of ' + name); continue; }
      const ctxNames = b[0].declarations[0].id.properties.map(p => { if (p.type !== 'Property' || !p.shorthand) fail('ctx entry of ' + name); return p.key.name; });
      const args = fn.params.slice(1).map(p => p.name);
      const alone = await freeNames(`(${fn.async ? 'async ' : ''}function(${fn.params.map(p => p.name).join(',')}){${msrc.slice(fn.body.start + 1, fn.body.end - 1)}})`);
      for (const e of exportNames) if (alone.has(e)) fail(`${name} reads the module's own ${e}`);
      const rest = await freeNames(`(${fn.async ? 'async ' : ''}function(){${msrc.slice(b[0].end, fn.body.end - 1)}})`);
      if (rest.has('ctx')) fail('ctx read again in ' + name);
      for (const a of args) if (ctxNames.includes(a)) fail(`parameter ${a} of ${name} is also in ctx`);
      fns.set(name, { ctxNames, args, async: fn.async, body: msrc.slice(b[0].end, fn.body.end - 1).replace(/\n/g, eol) });
    }
    mods.set(ns, fns);
    const oldPath = path.join(stage, 'original', mfile);
    if (fs.existsSync(oldPath)) {
      const oldSrc = fs.readFileSync(oldPath, 'utf8').replace(/\r\n/g, '\n'), oast = parseAst(oldSrc, { jsx: mfile.endsWith('.jsx') });
      for (const n of oast.body) if (n.type === 'ExportNamedDeclaration') {
        const nn = mast.body.find(x => x.type === 'ExportNamedDeclaration' && x.declaration.id.name === n.declaration.id.name);
        if (!nn || msrc.slice(nn.start, nn.end) !== oldSrc.slice(n.start, n.end)) fail('existing function changed: ' + n.declaration.id.name);
      }
      for (const n of oast.body) if (n.type === 'ImportDeclaration') for (const sp of n.specifiers)
        if (!mast.body.some(x => x.type === 'ImportDeclaration' && x.source.value === n.source.value && x.specifiers.some(y => y.local.name === sp.local.name && y.type === sp.type))) fail('existing import lost: ' + sp.local.name);
    }
    log(`${mfile}: ${fns.size} functions; global names: ${[...(await freeNames(msrc)).keys()].sort().join(' ') || 'none'}`);
  }
  const app = findComponent(parseAst(next, { jsx: true }), component);
  const seen = new Set(), wrappers = [];
  for (const s of app.body.body) {
    if (s.type !== 'FunctionDeclaration') continue;
    const b = s.body.body, call = b.length === 1 && b[0].type === 'ReturnStatement' ? b[0].argument : null;
    if (call?.type !== 'CallExpression' || call.callee.type !== 'MemberExpression' || !mods.has(call.callee.object.name)) continue;
    const f = mods.get(call.callee.object.name).get(call.callee.property.name);
    if (!f || call.callee.property.name !== s.id.name) { fail('wrapper target of ' + s.id.name); continue; }
    if (s.async || s.generator) fail('wrapper is async or a generator: ' + s.id.name);
    if (containsFunction(s.params)) fail('function in the parameters of ' + s.id.name);
    const bound = []; s.params.forEach(p => patternIds(p, bound));
    const [obj, ...rest] = call.arguments;
    if (obj?.type !== 'ObjectExpression') { fail('wrapper object of ' + s.id.name); continue; }
    const passed = obj.properties.map(p => { if (p.type !== 'Property' || !p.shorthand) fail('ctx entry passed by ' + s.id.name); return p.key.name; });
    if (JSON.stringify([...passed].sort()) !== JSON.stringify([...f.ctxNames].sort())) fail('ctx names differ for ' + s.id.name);
    if (JSON.stringify(rest.map(a => a.type === 'Identifier' ? a.name : '?')) !== JSON.stringify(bound) || JSON.stringify(bound) !== JSON.stringify(f.args)) fail('arguments differ for ' + s.id.name);
    seen.add(s.id.name);
    if (orig.includes(next.slice(s.start, s.end))) continue; // a wrapper from an earlier move
    wrappers.push({ s, f });
  }
  for (const [, fns] of mods) for (const name of fns.keys()) if (!seen.has(name)) fail('no wrapper for ' + name);
  let rebuilt = next;
  for (const { s, f } of wrappers.sort((a, b) => b.s.start - a.s.start)) rebuilt = rebuilt.slice(0, s.start) + (f.async ? 'async ' : '') + next.slice(s.start, s.body.start) + '{' + f.body + '}' + rebuilt.slice(s.end);
  const strip = (t) => t.split('\n').filter(l => !l.startsWith('import ')).join('\n');
  if (strip(rebuilt) === strip(orig)) log(`OK ${wrappers.length} new wrappers: putting the bodies back gives the original outside import lines`);
  else fail('putting the bodies back does not give the original:\n' + firstDifference(strip(rebuilt), strip(orig)));
  const { results } = await analyseFunctions(orig, component);
  for (const { s } of wrappers) { const r = results.find(r => r.name === s.id.name); if (!r || r.problems.length) fail(`${s.id.name} is not safe to move: ${r?.problems.join('; ')}`); }
  const { newSources } = await checkImports(orig, next, fail);
  log('new import sources: ' + (newSources.join(' ') || 'none'));
  log(failures.length ? 'VERIFY FAILED' : 'VERIFY OK');
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stage = process.argv[2];
  if (!stage) { console.error('usage: verify-functions.mjs <stage dir>'); process.exit(2); }
  process.exitCode = (await verifyFunctions(stage)).length ? 1 : 0;
}
