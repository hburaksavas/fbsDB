import test from 'node:test';
import assert from 'node:assert/strict';
import { editorPresentable } from '../src/editorStartup.js';

const monacoWith = colorize => ({ editor: { colorize } });
const never = () => new Promise(() => {});
const settled = async promise => {
  let done = false;
  promise.then(() => { done = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  return done;
};

test.beforeEach(() => {
  globalThis.document = { fonts: { ready: Promise.resolve() } };
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
});
test.afterEach(() => {
  delete globalThis.document;
  delete globalThis.requestAnimationFrame;
});

test('the splash waits for SQL colors and fonts', async () => {
  let finishColors;
  const waiting = editorPresentable(monacoWith(() => new Promise(resolve => { finishColors = resolve; })), 1000);
  assert.equal(await settled(waiting), false);
  finishColors();
  assert.equal(await settled(waiting), true);
});

test('a font that never loads cannot keep the splash up', async () => {
  globalThis.document = { fonts: { ready: never() } };
  await editorPresentable(monacoWith(async () => ''), 10);
});

test('stuck or failed coloring cannot keep the splash up', async () => {
  await editorPresentable(monacoWith(never), 10);
  await editorPresentable(monacoWith(() => Promise.reject(new Error('no language'))), 10);
});

test('stopped animation frames cannot keep the splash up', async () => {
  globalThis.requestAnimationFrame = () => {};
  await editorPresentable(monacoWith(async () => ''), 10);
});
