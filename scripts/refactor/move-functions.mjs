// Moves the bodies of chosen function declarations of a component into modules, behind a wrapper of the same name and parameters:
//   [async] function f(a, b = 1) { BODY }  ->  function f(a, b = 1) { return ns.f({ names }, a, b); }
//   module: export [async] function f(ctx, a, b) { const { names } = ctx; BODY }
// node scripts/refactor/move-functions.mjs <plan.json> <stage dir> [--file src/App.jsx] [--component App]
// The plan is [{ "module": "WorkbenchTabActions", "ns": "tabActions", "comment": "…", "functions": ["closeTabs", …] }]. A module that the
// component already imports as `* as <ns>` gets the functions appended. Nothing in src changes: the stage folder receives the new files,
// original/ with the files they replace, and plan-files.json for verify-functions.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyseFunctions } from './function-safety.mjs';
import { parseAst, parseArgs, eolOf, wrapNames, importsFor, importBlock, insertAfterImports, pruneImports, writeStage, keepOriginal } from './lib.mjs';

export async function moveFunctions({ plan, stage, file = 'src/App.jsx', component = 'App' }) {
  const srcDir = path.dirname(file), base = path.basename(file);
  const src = fs.readFileSync(file, 'utf8'), eol = eolOf(src);
  const { results, moduleNames } = await analyseFunctions(src, component);
  const usedNames = new Set(results.flatMap(r => r.bodyAppUsed));
  const edits = [], report = [];
  keepOriginal(stage, srcDir, base);
  for (const m of plan) {
    const prior = moduleNames.get(m.ns);
    m.existing = !!prior && prior.type === 'ImportNamespaceSpecifier' && prior.source.startsWith(`./${m.module}.`) && fs.existsSync(path.join(srcDir, prior.source.slice(2)));
    if ((prior && !m.existing) || results.some(r => r.name === m.ns) || usedNames.has(m.ns)) throw new Error('namespace name taken: ' + m.ns);
    const bySource = new Map(), fns = [];
    for (const name of m.functions) {
      const r = results.find(r => r.name === name);
      if (!r) throw new Error('no function declaration ' + name);
      if (r.problems.length) throw new Error(`${name}: ${r.problems.join('; ')}`);
      const d = r.decl, params = r.boundParams, names = r.bodyAppUsed;
      const body = src.slice(d.body.start + 1, d.body.end - 1);
      importsFor(r.bodyModUsed, moduleNames, bySource);
      const header = src.slice(d.start, d.body.start);
      if (!header.startsWith(`${d.async ? 'async ' : ''}function ${name}(`)) throw new Error('unexpected header of ' + name);
      fns.push(`export ${d.async ? 'async ' : ''}function ${name}(${['ctx', ...params].join(', ')}) {\n  const {\n${wrapNames(names, '    ').join('\n')}\n  } = ctx;${body.replace(/\r\n/g, '\n')}}\n`);
      // The wrapper is never async: it returns the moved function's promise as it is, with no extra await.
      const call = `${m.ns}.${name}({${eol}${wrapNames(names, '      ').join(eol)}${eol}    }${params.map(p => ', ' + p).join('')})`;
      edits.push({ start: d.start, end: d.end, text: `${header.slice(d.async ? 6 : 0)}{${eol}    return ${call};${eol}  }` });
      report.push(`${name}${d.async ? ' (async)' : ''}: ${body.length} bytes, ${names.length} names, ${r.bodyModUsed.length} imports`);
    }
    let priorFns = '';
    if (m.existing) {
      m.file = prior.source.slice(2);
      keepOriginal(stage, srcDir, m.file);
      const old = fs.readFileSync(path.join(srcDir, m.file), 'utf8').replace(/\r\n/g, '\n');
      const oast = parseAst(old, { jsx: m.file.endsWith('.jsx') });
      for (const n of oast.body) if (n.type === 'ImportDeclaration') for (const sp of n.specifiers) {
        if (!bySource.has(n.source.value)) bySource.set(n.source.value, new Map());
        bySource.get(n.source.value).set(sp.local.name, { type: sp.type, local: sp.local.name, imported: sp.imported?.name });
      }
      priorFns = old.slice(oast.body.find(n => n.type !== 'ImportDeclaration').start) + '\n';
    }
    const mod = [`// ${m.comment}`, ...importBlock(bySource), '', priorFns + fns.join('\n')].join('\n');
    let jsx = false; try { parseAst(mod); } catch { jsx = true; }
    if (!m.existing) m.file = m.module + (jsx ? '.jsx' : '.js');
    else if (jsx && !m.file.endsWith('.jsx')) throw new Error('JSX would go into ' + m.file);
    writeStage(stage, m.file, mod);
  }
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  out = insertAfterImports(out, plan.filter(m => !m.existing).map(m => `import * as ${m.ns} from './${m.file}';`));
  const pruned = await pruneImports(out);
  writeStage(stage, base, pruned.text);
  writeStage(stage, 'plan-files.json', JSON.stringify({ file: base, component, modules: plan.map(m => ({ ns: m.ns, file: m.file })) }, null, 1));
  return { report, removed: pruned.removed, before: src.length, after: pruned.text.length, files: [base, ...plan.map(m => m.file)] };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { options, positional: [planPath, stage] } = parseArgs(process.argv.slice(2), { file: 'src/App.jsx', component: 'App' });
  if (!planPath || !stage) { console.error('usage: move-functions.mjs <plan.json> <stage dir> [--file src/App.jsx] [--component App]'); process.exit(2); }
  const r = await moveFunctions({ plan: JSON.parse(fs.readFileSync(planPath, 'utf8')), stage, ...options });
  console.log(r.report.join('\n'));
  console.log(`imports no longer named: ${r.removed.length ? r.removed.join(' ') : 'none'}`);
  console.log(`${options.file}: ${r.before} -> ${r.after} bytes; staged ${r.files.join(' ')}`);
}
