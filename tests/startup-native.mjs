// Integration check against a running native WebView2 host. Reloads the UI and
// observes normal startup only; it never connects to Oracle or runs SQL.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'http://127.0.0.1:9337';
const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find(item => item.type === 'page' && item.url.startsWith('https://fbsdb.local/'));
assert.ok(target, 'A running native fbsDB page is required.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id); pending.delete(message.id);
    message.error ? request?.reject(new Error(message.error.message)) : request?.resolve(message.result);
  }
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
await command('Page.enable');
await command('Runtime.enable');
const installed = await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const state = window.__startupQa = { ready: false, replies: [], errors: [] };
  window.addEventListener('error', event => state.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => state.errors.push(String(event.reason)));
  const post = chrome.webview.postMessage.bind(chrome.webview);
  chrome.webview.postMessage = value => {
    const message = typeof value === 'string' ? JSON.parse(value) : value;
    if (message.type === 'ui.ready') state.ready = true;
    post(value);
  };
  chrome.webview.addEventListener('message', event => {
    const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    state.replies.push(message.type);
  });
})()` });
try {
  await command('Page.reload', { ignoreCache: true });
  let state;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const result = await command('Runtime.evaluate', { expression: `JSON.stringify({
      qa: window.__startupQa, editor: !!document.querySelector('.monaco-editor'),
      error: document.querySelector('.application-error pre')?.textContent
    })`, returnByValue: true });
    if (result.result?.value) {
      state = JSON.parse(result.result.value);
      assert.ok(!state.error, state.error);
      assert.deepEqual(state.qa?.errors || [], [], 'Startup raised a browser error.');
      if (state.editor && state.qa?.ready && ['connection.profiles', 'workspace.state'].every(type => state.qa.replies.includes(type))) break;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(state?.editor && state.qa?.ready, `Editor never completed its native startup handshake: ${JSON.stringify(state)}`);
  assert.ok(['connection.profiles', 'workspace.state'].every(type => state.qa.replies.includes(type)), 'The native host did not finish initialization.');
  console.log('PASS native startup: Monaco mounted, ui.ready sent, host initialization completed without runtime errors.');
} finally {
  await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: installed.identifier });
  socket.close();
}
