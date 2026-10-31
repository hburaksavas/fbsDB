// Run against the real desktop WebView2. Creates/removes one temporary tool
// in the active workspace. Never connects, executes SQL, or captures screenshots.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const targets = await (await fetch(`${process.argv[2] || 'http://127.0.0.1:9337'}/json/list`)).json();
const target = targets.find(t => t.type === 'page' && t.url.startsWith('https://fbsdb.local/'));
assert.ok(target, 'Native WebView2 is required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0; const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data); if (!message.id) return;
  const resolve = pending.get(message.id); pending.delete(message.id); resolve(message);
});
async function evaluate(expression) {
  const id = ++sequence;
  const promise = new Promise(resolve => pending.set(id, resolve));
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  const message = await promise;
  if (message.result?.exceptionDetails) throw new Error(message.result.exceptionDetails.exception?.description);
  return message.result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 80; i++) { const value = await evaluate(expression); if (value) return value; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(`Timed out: ${expression}`);
}
async function click(selector) { assert.ok(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.focus();e.click();return true})()`), selector); }
async function input(selector, value) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
let file, folder, createdFolder = false;
try {
  assert.equal(await evaluate(`!!document.querySelector('.modal-backdrop')`), false, 'Close existing dialogs first');
  const root = await evaluate(`new Promise(resolve=>{const h=e=>{const m=typeof e.data==='string'?JSON.parse(e.data):e.data;if(m.type==='workspace.state'){chrome.webview.removeEventListener('message',h);resolve(m.root)}};chrome.webview.addEventListener('message',h);chrome.webview.postMessage(JSON.stringify({type:'command',id:'mini-tools-qa-state',command:'workspace.refresh',payload:{},tabId:'tab-1'}))})`);
  assert.ok(root, 'Open a workspace before this test');
  const id = randomUUID().replaceAll('-', '');
  folder = path.join(root, '.fbsdb', 'tools');
  createdFolder = !await fs.stat(folder).then(() => true, () => false);
  await fs.mkdir(folder, { recursive: true }); file = path.join(folder, `${id}.json`);
  await fs.writeFile(file, JSON.stringify({ version: 1, id, name: `QA ${id}`, sql: 'SELECT :id, :region FROM dual',
    fields: [{ name: 'ID', label: 'Customer ID', type: 'NUMBER', required: true, description: '' }, { name: 'REGION', label: 'Region', type: 'VARCHAR2', required: false, description: '' }],
    columns: [{ index: 0, name: 'ID', visible: true }, { index: 1, name: 'REGION', visible: true }] }));
  await evaluate(`window.__miniQa={post:chrome.webview.postMessage,commands:[]};chrome.webview.postMessage=function(value){try{window.__miniQa.commands.push(JSON.parse(value))}catch{}return window.__miniQa.post.call(this,value)}`);
  await click('[aria-label="SQL mini tools"]');
  await until(`document.querySelectorAll('.mini-tool-item').length`);
  await evaluate(`[...document.querySelectorAll('.mini-tool-item')].find(e=>e.textContent===${JSON.stringify(`QA ${id}`)}).click()`);
  await until(`document.querySelectorAll('.mini-tool-field').length===2`);
  assert.match(await evaluate(`document.querySelector('.mini-tool-fields').textContent`), /Customer ID/);
  assert.equal(await evaluate(`window.__miniQa.commands.filter(c=>c.command==='sql.execute').length`), 0, 'Opening a tool must not execute');
  await input('.mini-tool-field input', '123456789012345678901234567890');
  await input('.mini-tool-field:nth-child(2) input', 'SECRET_BIND_VALUE');
  await click('.mini-tool-content>details>summary');
  assert.equal(await evaluate(`document.querySelector('.mini-tool-content textarea').value`), 'SELECT :id, :region FROM dual');
  await click('.mini-tool-content fieldset label:nth-of-type(2) input');
  await click('.mini-tool-field details summary');
  await input('.mini-tool-field details input', 'Account identifier');
  await evaluate(`[...document.querySelectorAll('.mini-tool-actions button')].find(e=>e.textContent.includes('Save tool')).click()`);
  await until(`document.querySelector('.mini-tool-content').textContent.includes('Saved SQL and view definition')`);
  const text = await fs.readFile(file, 'utf8'); const saved = JSON.parse(text);
  assert.equal(saved.fields[0].label, 'Account identifier'); assert.equal(saved.columns[1].visible, false);
  assert.ok(!text.includes('SECRET_BIND_VALUE') && !text.includes('123456789012345678901234567890'));
  assert.equal(await evaluate(`window.__miniQa.commands.filter(c=>c.command==='sql.execute').length`), 0, 'Saving must not execute');
  await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await until(`!document.querySelector('.mini-tools-modal')`);
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`), 'SQL mini tools');
  await click('[aria-label="SQL mini tools"]');
  await until(`document.querySelectorAll('.mini-tool-item').length`);
  await evaluate(`[...document.querySelectorAll('.mini-tool-item')].find(e=>e.textContent===${JSON.stringify(`QA ${id}`)}).click()`);
  await until(`document.querySelector('.mini-tool-fields')?.textContent.includes('Account identifier')`);
  assert.equal(await evaluate(`document.querySelector('.mini-tool-field input').value`), '', 'Reopening must clear bind values');
  const geometry = await evaluate(`(()=>{const e=document.querySelector('.mini-tools-modal'),r=e.getBoundingClientRect();return {inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflow:e.scrollWidth>e.clientWidth}})()`);
  assert.equal(geometry.inside, true); assert.equal(geometry.overflow, false);
  console.log('PASS native tool catalog/save/reopen, labels, visibility, definition-only persistence, no execution on open/save, Escape focus and desktop bounds.');
} finally {
  await evaluate(`document.querySelector('[aria-label="Close mini tools"]')?.click();if(window.__miniQa){chrome.webview.postMessage=window.__miniQa.post;delete window.__miniQa}`).catch(() => {});
  if (file) await fs.rm(file, { force: true });
  if (createdFolder) await fs.rmdir(folder).catch(() => {});
  socket.close();
}
