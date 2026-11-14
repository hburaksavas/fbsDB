import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyseFunctions } from '../scripts/refactor/function-safety.mjs';
import { moveFunctions } from '../scripts/refactor/move-functions.mjs';
import { verifyFunctions } from '../scripts/refactor/verify-functions.mjs';
import { moveEffects } from '../scripts/refactor/move-effects.mjs';
import { verifyEffects } from '../scripts/refactor/verify-effects.mjs';

const component = `import { useEffect, useMemo, useState } from 'react';
import { helper, unused } from './helper.js';

export function App() {
  const [count, setCount] = useState(0);
  const early = useMemo(() => late(), []);
  const limit = 3;
  function late() { return limit; }
  function bump(step = 1) { setCount(count + step); return helper(count); }
  async function save(name) { return name + count + early; }
  function again() { return this; }
  useEffect(() => {
    const timer = setTimeout(() => bump(), 1);
    return () => clearTimeout(timer);
  }, [count]);
  return unused;
}
`;

const dirs = [];
test.after(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-tools-'));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), component);
  fs.writeFileSync(path.join(dir, 'src', 'helper.js'), 'export const helper = x => x; export const unused = null;\n');
  return { dir, file: path.join(dir, 'src', 'App.jsx'), stage: path.join(dir, 'stage') };
}
const quiet = () => {};

test('function safety refuses a function the render can reach before a const it reads, and one that uses its own this', async () => {
  const { results } = await analyseFunctions(component);
  const problems = Object.fromEntries(results.map(r => [r.name, r.problems]));
  assert.match(problems.late.join(), /before a const it reads is initialised/);
  assert.match(problems.again.join(), /this/);
  assert.deepEqual(problems.bump, []);
  assert.deepEqual(problems.save, []);
});

test('moved functions keep their parameter list in the wrapper and verify back to the original', async () => {
  const { file, stage } = fixture();
  await moveFunctions({ plan: [{ module: 'Actions', ns: 'actions', comment: 'Test actions.', functions: ['bump', 'save'] }], stage, file });
  const app = fs.readFileSync(path.join(stage, 'App.jsx'), 'utf8'), mod = fs.readFileSync(path.join(stage, 'Actions.js'), 'utf8');
  assert.match(app, /function bump\(step = 1\) \{\n    return actions\.bump\(\{\n      count, setCount\n    \}, step\);\n  \}/);
  assert.match(app, /  function save\(name\) \{/, 'the wrapper of an async function is not async');
  assert.match(mod, /export async function save\(ctx, name\)/);
  assert.match(mod, /import \{ helper \} from "\.\/helper\.js";/);
  assert.equal(fs.readFileSync(file, 'utf8'), component, 'src is not touched');
  assert.deepEqual(await verifyFunctions(stage, quiet), []);
  fs.writeFileSync(path.join(stage, 'Actions.js'), mod.replace('count + step', 'count - step'));
  assert.ok((await verifyFunctions(stage, quiet)).some(f => /does not give the original/.test(f)));
});

test('a function that is not safe to move is refused', async () => {
  const { file, stage } = fixture();
  await assert.rejects(moveFunctions({ plan: [{ module: 'Actions', ns: 'actions', comment: '', functions: ['late'] }], stage, file }), /late: may run before/);
});

test('a moved effect body keeps its cleanup and verifies back to the original', async () => {
  const { file, stage } = fixture();
  await moveEffects({ plan: [{ module: 'Effects.js', comment: 'Test effects.', effects: [{ fn: 'startTimer', marker: 'setTimeout' }] }], stage, file });
  const app = fs.readFileSync(path.join(stage, 'App.jsx'), 'utf8');
  assert.match(app, /useEffect\(\(\) => startTimer\(\{\n    bump\n  \}\), \[count\]\);/);
  assert.match(fs.readFileSync(path.join(stage, 'Effects.js'), 'utf8'), /return \(\) => clearTimeout\(timer\);/);
  assert.deepEqual(await verifyEffects(stage, quiet), []);
});
