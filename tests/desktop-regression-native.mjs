import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { connectNativePage } from './nativeCdp.mjs';
import { desktopRegressionFixture } from './desktopRegressionFixture.mjs';

const [endpoint, runDirectory] = process.argv.slice(2);
assert.ok(endpoint && runDirectory, 'Run scripts/test-desktop.ps1 to provide an isolated application and profile.');
const root = path.resolve(runDirectory), fixtureRoot = path.join(root, 'files');
assert.equal(JSON.parse(await readFile(path.join(root, 'settings.json'), 'utf8')).lastWorkspace, undefined, 'The runner must start with isolated settings.');
await mkdir(fixtureRoot, { recursive: true });
const cdp = await connectNativePage(endpoint), checks = [], startedAt = new Date().toISOString();
const editor = `window.monaco?.editor.getEditors().find(editor => document.contains(editor.getDomNode()))`;
const activeTab = `document.querySelector('.file-tab.active')?.dataset.editorTab`;
const quote = JSON.stringify;
let installed, failure, startupMetrics;
const reportFile = path.join(root, 'report.json');

async function healthy() {
  const state = await cdp.evaluate('({errors: window.__desktopRegression.errors, blocked: window.__desktopRegression.blocked})');
  assert.deepEqual(state.errors, [], 'Desktop runtime errors.');
  assert.deepEqual(state.blocked, [], 'The suite attempted an unexpected/database command.');
}
async function check(name, operation) {
  const start = Date.now();
  try { await operation(); await healthy(); checks.push({ name, status: 'passed', durationMs: Date.now() - start }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, status: 'failed', durationMs: Date.now() - start, error: error.message }); throw error; }
}
async function setSql(text) {
  await cdp.evaluate(`(() => { const editor = ${editor}; editor.setValue(${quote(text)}); editor.focus(); })()`);
  await cdp.frame();
}
async function expectSql(text) { await cdp.until(`${editor}?.getValue() === ${quote(text)}`, 'Expected editor content'); }
async function newTab(text) {
  const previous = await cdp.evaluate(activeTab);
  await cdp.click('[aria-label="New SQL file"]');
  await cdp.until(`${activeTab} !== ${quote(previous)}`, 'New tab activation');
  const id = await cdp.evaluate(activeTab); if (text !== undefined) await setSql(text); return id;
}
async function activate(id) { await cdp.click(`[data-editor-tab=${quote(id)}] [role="tab"]`); }
async function closeTab(id) { await cdp.click(`[data-editor-tab=${quote(id)}] [aria-label^="Close "]`); }
async function absentTab(id) { await cdp.until(`!document.querySelector('[data-editor-tab=' + CSS.escape(${quote(id)}) + ']')`, 'Closed tab removal'); }
async function queueSave(name) {
  const file = path.join(fixtureRoot, name); await writeFile(file, '');
  const diskVersion = createHash('sha256').update('').digest('hex').toUpperCase();
  await cdp.evaluate(`window.__desktopRegression.savePaths.push(${quote({ path: file, diskVersion })})`);
  return file;
}
async function expectFile(file, text) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await readFile(file, 'utf8').catch(() => null) === text) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await readFile(file, 'utf8'), text, 'Native save did not write the expected file.');
}
async function saved() { await cdp.until(`document.querySelector('.editor-save-button')?.textContent.trim() === 'Saved'`, 'Saved indicator'); }

try {
  const fixture = desktopRegressionFixture(fixtureRoot);
  new Function(fixture); // Fail early if the document-start fixture is invalid.
  // A debugger target can advertise the requested URL before the first native
  // navigation has committed. Reloading at that point can leave about:blank.
  await cdp.until(`location.hostname === 'fbsdb.local' && document.getElementById('root') && document.readyState !== 'loading'`, 'Initial native navigation', 45000);
  installed = await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: fixture });
  await cdp.call('Page.reload', { ignoreCache: true });
  await check('startup: real Monaco mount and native initialization', async () => {
    await cdp.until(`window.__desktopRegression?.ready && ${editor} && ['workspace.state', 'connection.profiles'].every(type => window.__desktopRegression.replies.some(reply => reply.type === type))`, 'Desktop startup', 60000);
    assert.equal(await cdp.evaluate('window.__desktopRegression.root'), fixtureRoot);
    startupMetrics=await cdp.evaluate(`performance.getEntriesByType('measure').filter(m=>m.name.startsWith('fbsdb:startup:')).map(m=>({name:m.name,durationMs:m.duration}))`);
    assert.ok(startupMetrics.some(m=>m.name==='fbsdb:startup:editor-ready'));
  });

  await check('first-use guide: visible, dismissible and remembered across reloads', async () => {
    await cdp.until(`document.getElementById('getting-started-title')`, 'Getting started guide');
    assert.equal(await cdp.evaluate(`document.querySelectorAll('.welcome-template-grid button').length`),3);
    assert.ok(await cdp.evaluate(`document.querySelector('[aria-label="Welcome workspace hub"]').textContent.includes('Pinned workspaces')&&document.querySelector('[aria-label="Welcome workspace hub"]').textContent.includes('Recent projects')`));
    await cdp.click('[aria-label="Show workspace hub on startup"]');
    await cdp.textClick('[aria-labelledby="getting-started-title"] button', 'Start working');
    assert.equal(await cdp.evaluate(`localStorage.getItem('fbsdb.onboardingSeen')`),'true');
    await cdp.call('Page.reload');
    await cdp.until(`window.__desktopRegression?.ready && ${editor}`, 'Restart after onboarding');
    await cdp.until(`document.getElementById('getting-started-title')`,'Opt-in startup hub');
    assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="Show workspace hub on startup"]').checked`),true);
    await cdp.click('[aria-label="Show workspace hub on startup"]');
    await cdp.textClick('[aria-labelledby="getting-started-title"] button','Start working');
    await cdp.call('Page.reload');await cdp.until(`window.__desktopRegression?.ready && ${editor}`,'Restart with startup hub disabled');
    assert.equal(await cdp.evaluate(`!!document.getElementById('getting-started-title')`),false);
  });

  let firstDraft, secondDraft;
  const firstSql = "SELECT 'first draft' FROM dual;", secondSql = "SELECT 'second draft' FROM dual;";
  await check('tabs: create, switch and retain independent unsaved text', async () => {
    firstDraft = await newTab(firstSql); secondDraft = await newTab(secondSql);
    await activate(firstDraft); await expectSql(firstSql);
    await activate(secondDraft); await expectSql(secondSql);
    assert.equal(await cdp.evaluate(`document.querySelector('.editor-save-button').textContent.trim()`), 'Unsaved');
  });
  await check('dirty close: Cancel retains text; Discard closes only the chosen tab', async () => {
    await closeTab(secondDraft); await cdp.until(`document.querySelector('.transaction-guard')`, 'Unsaved guard');
    await cdp.textClick('.transaction-guard button', 'Cancel'); await expectSql(secondSql);
    await closeTab(secondDraft); await cdp.textClick('.transaction-guard button', 'Discard changes'); await absentTab(secondDraft);
    await activate(firstDraft); await expectSql(firstSql);
  });

  const openedFile = path.join(fixtureRoot, 'opened.sql'), original = "SELECT 'disk original' FROM dual;";
  let openedTab;
  await check('Open: UI shortcut reaches the real native file reader', async () => {
    await writeFile(openedFile, original);
    await cdp.evaluate(`window.__desktopRegression.openPaths.push(${quote(openedFile)})`);
    await cdp.key('o', 10);
    await expectSql(original); openedTab = await cdp.evaluate(activeTab);
    assert.ok(await cdp.evaluate(`window.__desktopRegression.replies.some(reply => reply.type === 'file.opened' && reply.path === ${quote(openedFile)})`));
  });
  await check('Save: Ctrl+S writes through the native service and clears dirty state', async () => {
    const text = "SELECT 'native saved' FROM dual;";
    await setSql(text); await cdp.key('s', 2); await expectFile(openedFile, text); await saved();
  });
  await check('delayed save: newer edits remain unsaved after the real save acknowledgement', async () => {
    const sent = "SELECT 'saved earlier' FROM dual;", newer = "SELECT 'newer editor text' FROM dual;";
    await cdp.evaluate('window.__desktopRegression.holdSaves = true');
    await setSql(sent); await cdp.key('s', 2); await expectFile(openedFile, sent);
    await cdp.until('window.__desktopRegression.pendingReplies.length > 0', 'Held native save acknowledgement');
    await setSql(newer); await cdp.evaluate('window.__desktopRegression.releaseSaves()'); await cdp.frame();
    await expectSql(newer);
    assert.equal(await cdp.evaluate(`document.querySelector('.editor-save-button').textContent.trim()`), 'Unsaved');
    assert.equal(await readFile(openedFile, 'utf8'), sent);
    await cdp.key('s', 2); await expectFile(openedFile, newer); await saved();
  });
  await check('background save: switching tabs cannot clear another document dirty state', async () => {
    await cdp.evaluate('window.__desktopRegression.holdSaves = true');
    const sent = "SELECT 'background save' FROM dual;";
    await setSql(sent); await cdp.key('s', 2); await expectFile(openedFile, sent);
    await cdp.until('window.__desktopRegression.pendingReplies.length > 0', 'Background acknowledgement');
    await activate(firstDraft); await expectSql(firstSql);
    await cdp.evaluate('window.__desktopRegression.releaseSaves()'); await cdp.frame();
    await expectSql(firstSql);
    assert.equal(await cdp.evaluate(`document.querySelector('.editor-save-button').textContent.trim()`), 'Unsaved');
    await activate(openedTab); await saved();
  });

  await check('Save As: a draft receives a new path via real native persistence', async () => {
    const text = "SELECT 'save as draft' FROM dual;";
    const id = await newTab(text), target = await queueSave('saved-as.sql');
    await cdp.key('s', 2); await expectFile(target, text); await saved();
    assert.match(await cdp.evaluate(`document.querySelector('.file-tab.active').textContent`), /saved-as\.sql/);
    await closeTab(id); await absentTab(id);
  });
  await check('save-and-close: native acknowledgement precedes tab removal', async () => {
    const text = "SELECT 'save on close' FROM dual;", id = await newTab(text), target = await queueSave('saved-on-close.sql');
    await cdp.evaluate('window.__desktopRegression.holdSaves = true');
    await closeTab(id); await cdp.until(`document.querySelector('.transaction-guard')`, 'Save-on-close guard');
    await cdp.textClick('.transaction-guard button', 'Save'); await expectFile(target, text);
    await cdp.until('window.__desktopRegression.pendingReplies.length > 0', 'Save-on-close acknowledgement');
    assert.ok(await cdp.evaluate(`!!document.querySelector('[data-editor-tab=' + CSS.escape(${quote(id)}) + ']')`), 'Tab closed before the save reply.');
    await cdp.evaluate('window.__desktopRegression.releaseSaves()'); await absentTab(id);
  });
  await check('external change: dirty editor text survives disk modification and polling', async () => {
    await activate(openedTab); await setSql("SELECT 'unsaved before external change' FROM dual;");
    await writeFile(openedFile, "SELECT 'changed outside' FROM dual;");
    await cdp.until(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Keep editor')`, 'External-change notice');
    await expectSql("SELECT 'unsaved before external change' FROM dual;");
    await cdp.textClick('button', 'Keep editor'); await cdp.key('s', 2);
    await expectFile(openedFile, "SELECT 'unsaved before external change' FROM dual;"); await saved();
  });

  const recoveryText = "SELECT 'recover active unsaved draft' FROM dual;";
  await check('recovery: reload offers drafts and restores text without executing SQL', async () => {
    await activate(firstDraft); await expectSql(firstSql);
    await newTab(recoveryText);
    await cdp.until(`JSON.parse(localStorage.getItem('fbsdb.sqlDrafts') || '{}').files?.some(file => file.content === ${quote(recoveryText)})`, 'Persisted recovery snapshot');
    await cdp.call('Page.reload', { ignoreCache: true });
    await cdp.until(`document.querySelector('[aria-label="Restore SQL drafts"]') && ${editor}`, 'Recovery dialog', 60000);
    await cdp.click('.draft-reconnect input');
    await cdp.textClick('.draft-recovery button', 'Restore selected drafts');
    await cdp.until(`!document.querySelector('.draft-recovery')`, 'Restored drafts'); await expectSql(recoveryText);
    const activeRecovered = await cdp.evaluate(activeTab);
    await cdp.until(`JSON.parse(localStorage.getItem('fbsdb.sqlDrafts') || '{}').files?.some(file => file.content === ${quote(firstSql)} && file.id.startsWith('recovered-'))`, 'Other restored draft');
    const recoveredFirst = await cdp.evaluate(`JSON.parse(localStorage.getItem('fbsdb.sqlDrafts')).files.find(file => file.content === ${quote(firstSql)}).id`);
    await activate(recoveredFirst); await expectSql(firstSql);
    await activate(activeRecovered); await expectSql(recoveryText);
    await cdp.until('window.__desktopRegression.ready', 'Post-recovery native handshake');
  });
  await check('discard recovery: start empty without restoring or executing drafts', async () => {
    await cdp.call('Page.reload', { ignoreCache: true });
    await cdp.until(`document.querySelector('[aria-label="Restore SQL drafts"]') && ${editor}`, 'Discard-recovery dialog', 60000);
    await cdp.textClick('.draft-recovery button', 'Discard recovery');
    await cdp.until(`!document.querySelector('.draft-recovery')`, 'Discarded recovery'); await expectSql('');
    assert.equal(await cdp.evaluate(`document.querySelectorAll('.file-tab').length`), 1);
    await cdp.until('window.__desktopRegression.ready', 'Post-discard native handshake');
  });
} catch (error) {
  failure = error;
  console.error(error.stack || error.message);
} finally {
  let diagnostics;
  try { diagnostics = await cdp.evaluate('({url: location.href, readyState: document.readyState, errors: window.__desktopRegression?.errors, blocked: window.__desktopRegression?.blocked, commands: window.__desktopRegression?.commands, replies: window.__desktopRegression?.replies, error: document.querySelector(".application-error pre")?.textContent})'); } catch { diagnostics = { debuggerDisconnected: true }; }
  await writeFile(reportFile, JSON.stringify({ startedAt, completedAt: new Date().toISOString(), status: failure ? 'failed' : 'passed',
    coverage: { host: 'real WinUI/WebView2', files: 'real native handlers and disk writes', picker: 'path selection substituted; OS picker interaction excluded', oracle: 'blocked' },
    startupMetrics, checks, diagnostics, error: failure?.message }, null, 2));
  if (installed) await cdp.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: installed.identifier }).catch(() => {});
  cdp.close();
}
if (failure) process.exitCode = 1;
