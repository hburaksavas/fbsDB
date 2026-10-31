import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { desktopRegressionFixture } from './desktopRegressionFixture.mjs';

function fixture() {
  const forwarded = [], listeners = new Set(), window = { addEventListener() {} };
  const chrome = { webview: { postMessage: value => forwarded.push(JSON.parse(value)),
    addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) } };
  vm.runInNewContext(desktopRegressionFixture('D:\\qa\\files'), { window, chrome });
  const send = (command, payload) => chrome.webview.postMessage(JSON.stringify({ type: 'command', id: 'r', tabId: 'a', command, payload }));
  return { state: window.__desktopRegression, send, forwarded, listeners, chrome };
}

test('desktop fixture forwards actual native saves only to queued isolated paths', () => {
  const f = fixture();
  f.state.savePaths.push({ path: 'D:\\qa\\files\\saved.sql', diskVersion: 'baseline' });
  f.send('file.save', { path: null, content: 'SELECT 1' });
  assert.equal(f.forwarded[0].payload.path, 'D:\\qa\\files\\saved.sql');
  assert.equal(f.forwarded[0].payload.content, 'SELECT 1');
  assert.equal(f.forwarded[0].payload.diskVersion, 'baseline');
  assert.throws(() => f.send('file.save', { path: null, content: 'no picker queued' }), /No isolated path/);
  assert.throws(() => f.send('file.save', { path: 'D:\\user\\important.sql', content: 'outside' }), /escaped/);
  assert.throws(() => f.send('file.save', { path: 'D:\\qa\\files\\..\\outside.sql', content: 'outside' }), /escaped/);
  assert.equal(f.forwarded.length, 1);
});

test('desktop fixture blocks Oracle commands and delays genuine replies without fabricating them', () => {
  const f = fixture(), received = [], listener = event => received.push(event.data);
  f.send('sql.execute', { sql: 'SELECT 1' }); f.send('connection.connect', { profileId: 'DEV' });
  assert.equal(f.forwarded.length, 0); assert.equal(f.state.blocked.length, 2);
  f.chrome.webview.addEventListener('message', listener);
  f.state.holdSaves = true;
  const reply = { type: 'file.saved', requestId: 'r', path: 'D:\\qa\\files\\a.sql', diskVersion: 'v2' };
  for (const callback of f.listeners) callback({ data: reply });
  assert.equal(received.length, 0);
  f.state.releaseSaves(); assert.equal(received[0], reply);
  f.chrome.webview.removeEventListener('message', listener);
  assert.equal(f.state.pendingReplies.length, 0);
});
