// FI-069 desktop check: the real app reaches the local Oracle database through
// an SSH tunnel. A stand-in ssh opens a real local forward, so every Oracle
// byte crosses it. Run with scripts/test-desktop.ps1 -SshTunnelTest.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import net from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectNativePage } from './nativeCdp.mjs';

const [endpoint, root, PROFILE = 'FBSDB_LOCAL'] = process.argv.slice(2);
assert.ok(endpoint && root, 'Run scripts/test-desktop.ps1 -SshTunnelTest.');
const settings = JSON.parse(await readFile(path.join(root, 'settings.json'), 'utf8'));
assert.equal(settings.connectionProfiles?.[0]?.ssh?.host, 'unknown.test', 'Only the isolated SSH test profile may be used.');
const publicKey = (await readFile(path.join(root, 'ssh_host_key.pub'), 'utf8')).split(' ')[1];
const fingerprint = 'SHA256:' + createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('base64').replace(/=+$/, '');
const editor = `window.monaco?.editor.getEditors().find(e=>document.contains(e.getDomNode()))`;
const cdp = await connectNativePage(endpoint), checks = [];
let failure;
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
const set = (selector, value) => cdp.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
const control = () => cdp.evaluate(`document.querySelector('.connection-control').getAttribute('aria-label')`);
const idle = () => cdp.until(`!document.querySelector('.connection-control')?.dataset.working`, 'Session idle', 40000);
async function pick() {
  await cdp.click('.connection-control');
  await cdp.until(`document.querySelector('[aria-label="Change connection"]')`, 'Connection picker');
  await set('[aria-label="Change connection"] .picker-search input', PROFILE); await cdp.frame();
  await cdp.evaluate(`document.querySelector('[aria-label="Change connection"] .picker-search input').focus()`);
  await cdp.key('Enter');
}
async function read(sql) {
  await cdp.evaluate(`(()=>{const e=${editor};e.setValue(${JSON.stringify(sql)});e.setPosition({lineNumber:1,column:1});e.focus()})()`);
  await new Promise(resolve => setTimeout(resolve, 300)); await cdp.key('Enter', 2); await new Promise(resolve => setTimeout(resolve, 200)); await idle();
  return cdp.evaluate(`[...document.querySelectorAll('[data-cell^="0:"]')].map(cell=>cell.textContent.trim())`);
}
const tunnelPort = async () => Number(await cdp.evaluate(`document.querySelector('.footer-ssh')?.dataset.localPort`));
const accepts = port => new Promise(resolve => { const socket = net.connect(port, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); });

try {
  await cdp.until(`location.hostname==='fbsdb.local'&&document.readyState!=='loading'&&${editor}`, 'Workbench', 60000);
  await cdp.evaluate(`localStorage.setItem('fbsdb.onboardingSeen','true')`);
  await cdp.call('Page.reload');
  await cdp.until(`${editor}&&document.querySelector('.connection-control')`, 'Workbench after reload', 60000);
  let first, port;
  await check('unknown SSH server: its fingerprint is shown and nothing connects until it is trusted', async () => {
    first = await cdp.evaluate(`document.querySelector('.file-tab.active').dataset.editorTab`);
    await pick();
    await cdp.until(`document.querySelector('[aria-label="Unknown SSH server"]')`, 'Fingerprint prompt', 40000);
    assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="SSH host key fingerprint"]').textContent`), fingerprint, 'The fingerprint differs from ssh-keygen.');
    assert.notEqual(await control(), `Change connection: ${PROFILE}`, 'The tab connected before the key was trusted.');
    await cdp.textClick('[aria-label="Unknown SSH server"] button', 'Trust and connect');
    await cdp.until(`document.querySelector('.connection-control').getAttribute('aria-label')==='Change connection: ${PROFILE}'&&!document.querySelector('.connection-control').dataset.working`, 'Connected through the tunnel', 40000);
    assert.equal((await readFile(path.join(root, 'known_hosts'), 'utf8')).trim(), `[unknown.test]:2222 ssh-ed25519 ${publicKey}`);
  });
  await check('tunnel: Oracle answers through it and the status bar names it', async () => {
    assert.deepEqual(await read(`SELECT 'through ssh' AS via FROM dual`), ['through ssh']);
    assert.match(await cdp.evaluate(`document.querySelector('.footer-ssh').getAttribute('aria-label')`), /qa@unknown\.test:2222/);
    port = await tunnelPort();
    assert.ok(port > 0 && await accepts(port), `The tunnel port is not open: ${port}`);
  });
  await check('shared tunnel: a second tab of the profile uses the same tunnel, which closes after both disconnect', async () => {
    await cdp.click('[aria-label="New SQL file"]');
    await cdp.until(`document.querySelector('.file-tab.active')?.dataset.editorTab!==${JSON.stringify(first)}`, 'Second tab');
    await pick();
    await cdp.until(`document.querySelector('.connection-control').getAttribute('aria-label')==='Change connection: ${PROFILE}'&&!document.querySelector('.connection-control').dataset.working`, 'Second tab connected', 40000);
    assert.equal(await tunnelPort(), port, 'The second tab opened its own tunnel.');
    assert.deepEqual(await read(`SELECT 2 FROM dual`), ['2']);
    for (const tab of [null, first]) {
      if (tab) { await cdp.click(`[data-editor-tab="${tab}"] [role="tab"]`); await cdp.frame(); }
      await cdp.click('.connection-control');
      await cdp.until(`[...document.querySelectorAll('[aria-label="Change connection"] button')].some(b=>b.textContent==='Disconnect')`, 'Disconnect offered');
      await cdp.textClick('[aria-label="Change connection"] button', 'Disconnect');
      await cdp.until(`!document.querySelector('.footer-ssh')`, 'Tab disconnected', 20000);
      await cdp.key('Escape').catch(() => {});
      if (!tab) assert.ok(await accepts(port), 'The tunnel closed while another tab still used it.');
    }
    const deadline = Date.now() + 10000;
    while (await accepts(port)) { assert.ok(Date.now() < deadline, 'The tunnel outlived its last tab.'); await new Promise(resolve => setTimeout(resolve, 200)); }
  });
} catch (error) {
  failure = error;
  try { failure.message += `\nScreen: ${await cdp.evaluate(`[...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="alert"],.feedback-item')].map(e=>e.textContent).join(' | ').slice(0,1500)`)}`; } catch {}
} finally {
  await writeFile(path.join(root, 'ssh-tunnel-report.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', checks, error: failure?.message }, null, 2));
  if (failure) console.error(failure.stack || failure.message);
  cdp.close();
}
process.exit(failure ? 1 : 0);
