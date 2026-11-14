// Moves the bodies of chosen effects of a component into new modules; the effect and its dependency list stay in the component:
//   useEffect(() => { BODY }, deps)  ->  useEffect(() => fn({ names }), deps)
//   module: export function fn(ctx) { const { names } = ctx; BODY }
// node scripts/refactor/move-effects.mjs <plan.json> <stage dir> [--file src/App.jsx] [--component App]
// The plan is [{ "module": "WorkbenchShortcutEffects.js", "comment": "…", "effects": [{ "fn": "installEditorShortcuts", "marker": "text only
// that effect contains" }] }]. The object is built when the effect runs, so it holds the values the inline body read, and the function
// returns what the body returned, so the cleanup is unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { freeNames, appBindings } from './scope.mjs';
import { parseAst, parseArgs, eolOf, findComponent, patternIds, wrapNames, importsFor, importBlock, insertAfterImports, pruneImports, writeStage, keepOriginal } from './lib.mjs';

export async function moveEffects({ plan, stage, file = 'src/App.jsx', component = 'App' }) {
  const srcDir = path.dirname(file), base = path.basename(file);
  const src = fs.readFileSync(file, 'utf8'), eol = eolOf(src);
  const app = findComponent(parseAst(src, { jsx: true }), component);
  const { moduleNames, appNames } = await appBindings(src, component);
  const kinds = new Map();
  for (const s of app.body.body) if (s.type === 'VariableDeclaration') { const ns = []; s.declarations.forEach(d => patternIds(d.id, ns)); ns.forEach(n => kinds.set(n, s.kind)); }
  const effects = app.body.body.filter(s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && ['useEffect', 'useLayoutEffect'].includes(s.expression.callee.name));
  const edits = [], report = [];
  keepOriginal(stage, srcDir, base);
  for (const m of plan) {
    if (fs.existsSync(path.join(srcDir, m.module))) throw new Error(m.module + ' exists; move-effects writes new modules only');
    const bySource = new Map(), fns = [];
    for (const e of m.effects) {
      if (appNames.has(e.fn) || moduleNames.has(e.fn)) throw new Error('name taken: ' + e.fn);
      const hits = effects.filter(s => src.slice(s.start, s.end).includes(e.marker));
      if (hits.length !== 1) throw new Error(`${e.fn}: ${hits.length} effects contain the marker`);
      const [cb, deps] = hits[0].expression.arguments;
      if (cb.type !== 'ArrowFunctionExpression' || cb.async || cb.params.length || cb.body.type !== 'BlockStatement') throw new Error(`${e.fn}: the callback is not () => { … }`);
      if (!deps) throw new Error(`${e.fn}: no dependency list`);
      const body = src.slice(cb.body.start + 1, cb.body.end - 1);
      if (/\bthis\b/.test(body)) throw new Error(`${e.fn}: reads this`);
      const free = await freeNames(`(()=>{${body}})`);
      if (free.has('arguments')) throw new Error(`${e.fn}: reads arguments`);
      if ([...free.values()].some(x => x.writes)) throw new Error(`${e.fn}: assigns to a component value`);
      const names = [...free.keys()].filter(n => appNames.has(n)).sort();
      if (names.some(n => kinds.get(n) && kinds.get(n) !== 'const')) throw new Error(`${e.fn}: reads a let or var`);
      importsFor([...free.keys()].filter(n => !appNames.has(n) && moduleNames.has(n)), moduleNames, bySource);
      fns.push(`export function ${e.fn}(ctx) {\n  const {\n${wrapNames(names, '    ').join('\n')}\n  } = ctx;${body.replace(/\r\n/g, '\n')}}\n`);
      edits.push({ start: cb.body.start, end: cb.body.end, text: `${e.fn}({${eol}${wrapNames(names, '    ').join(eol)}${eol}  })` });
      report.push(`${e.fn}: ${body.length} bytes, ${names.length} names`);
    }
    const mod = [`// ${m.comment}`, ...importBlock(bySource), '', fns.join('\n')].join('\n');
    try { parseAst(mod, { jsx: m.module.endsWith('.jsx') }); } catch (error) { throw new Error(`${m.module} does not parse: ${error.message}`); }
    writeStage(stage, m.module, mod);
  }
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  out = insertAfterImports(out, plan.map(m => `import { ${m.effects.map(e => e.fn).join(', ')} } from './${m.module}';`));
  const pruned = await pruneImports(out);
  writeStage(stage, base, pruned.text);
  writeStage(stage, 'plan-files.json', JSON.stringify({ file: base, component, modules: plan.map(m => m.module) }, null, 1));
  return { report, removed: pruned.removed, before: src.length, after: pruned.text.length, files: [base, ...plan.map(m => m.module)] };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { options, positional: [planPath, stage] } = parseArgs(process.argv.slice(2), { file: 'src/App.jsx', component: 'App' });
  if (!planPath || !stage) { console.error('usage: move-effects.mjs <plan.json> <stage dir> [--file src/App.jsx] [--component App]'); process.exit(2); }
  const r = await moveEffects({ plan: JSON.parse(fs.readFileSync(planPath, 'utf8')), stage, ...options });
  console.log(r.report.join('\n'));
  console.log(`imports no longer named: ${r.removed.length ? r.removed.join(' ') : 'none'}`);
  console.log(`${options.file}: ${r.before} -> ${r.after} bytes; staged ${r.files.join(' ')}`);
}
