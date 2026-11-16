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

test('function safety does not count closures that only run after the render, and still counts a ref called during it', async () => {
  const body = (mid) => `import { useRef, useState } from 'react';
export function App() {
  const [count, setCount] = useState(0);
  const lateRef = useRef(null);
  lateRef.current = () => deferred();
  const storeRef = useRef(null);
  storeRef.current = stored;
${mid}
  const limit = count + 1;
  const alias = () => viaConst();
  function deferred() { return limit; }
  function stored() { return limit; }
  function viaConst() { return limit; }
  function clicked() { return limit; }
  function direct() { return limit; }
  return <button onClick={() => clicked()}>{alias.name}</button>;
}
`;
  const problems = async (src) => Object.fromEntries((await analyseFunctions(src)).results.map(r => [r.name, r.problems.length]));
  assert.deepEqual(await problems(body('')), { deferred: 0, stored: 0, viaConst: 0, clicked: 0, direct: 0 }, 'ref closures, stored functions, const arrows and JSX handlers are after the render');
  const called = await problems(body('  lateRef.current(); storeRef.current(); direct();'));
  assert.equal(called.deferred, 1, 'a ref closure called in the render may run before the const it reads');
  assert.equal(called.stored, 1, 'a stored function called through its ref in the render is counted');
  assert.equal(called.direct, 1);
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

test('a component wrapped in memo or forwardRef is found, moved and verified like a plain exported function', async () => {
  const wrapped = component.replace('export function App() {', 'export const Grid = memo(forwardRef(function Grid(props, ref) {').replace(/\n  return unused;\n\}\n$/, '\n  return unused;\n}));\n');
  assert.notEqual(wrapped, component);
  const { results } = await analyseFunctions(wrapped, 'Grid');
  assert.deepEqual(results.find(r => r.name === 'bump').problems, []);
  const arrow = component.replace('export function App() {', 'export const Grid = memo(() => {').replace(/\n  return unused;\n\}\n$/, '\n  return unused;\n});\n');
  assert.deepEqual((await analyseFunctions(arrow, 'Grid')).results.find(r => r.name === 'save').problems, []);
  const { dir, stage } = fixture();
  const file = path.join(dir, 'src', 'Grid.jsx');
  fs.writeFileSync(file, wrapped);
  await moveFunctions({ plan: [{ module: 'Actions', ns: 'actions', comment: 'Test actions.', functions: ['bump', 'save'] }], stage, file, component: 'Grid' });
  assert.match(fs.readFileSync(path.join(stage, 'Grid.jsx'), 'utf8'), /return actions\.bump\(\{/);
  assert.deepEqual(await verifyFunctions(stage, quiet), []);
  await assert.rejects(analyseFunctions(component, 'Missing'), /no exported function Missing/);
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
