import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentSessions } from '../src/documentSessions.js';
import { DocumentSaves } from '../src/documentSaves.js';
import { draftSnapshot, parseDraftSnapshot } from '../src/draftRecovery.js';

const a = () => ({ id: 'a', name: 'a.sql', path: 'C:/sql/a.sql', content: 'SELECT 1', dirty: false, diskVersion: 'v1' });
const b = () => ({ id: 'b', name: 'b.sql', path: 'C:/sql/b.sql', content: 'SELECT 2', dirty: false, diskVersion: 'b1' });
function savesFor(store) {
  const saves = new DocumentSaves(), sent = [];
  const send = (command, payload) => { const id = `save-${sent.length}`; sent.push({ id, command, payload }); return id; };
  return {
    saves, sent, start: callback => saves.start(send, store.active, callback),
    reply(id, tabId, extra = {}) {
      const document = store.tabs.find(tab => tab.id === tabId);
      const result = saves.saved({ requestId: id, tabId, path: document?.path, fileName: document?.name, diskVersion: 'v2', ...extra }, document);
      if (result) { store.patch(tabId, result.document); result.afterSave?.(); }
    },
  };
}

test('editing and switching tabs always reads the same document state, including before a render', () => {
  const store = createDocumentSessions([a(), b()]);
  const readAsync = () => ({ id: store.activeId, text: store.text, dirty: store.active.dirty });
  store.edit('unsaved A'); store.activate('b'); store.edit('unsaved B'); store.activate('a');
  assert.deepEqual(readAsync(), { id: 'a', text: 'unsaved A', dirty: true });
  assert.equal(store.tabs[1].content, 'unsaved B');
  store.activate('does-not-exist');
  assert.equal(store.activeId, 'a');
});

test('a background save updates only its document after the user switches and edits another tab', () => {
  const store = createDocumentSessions([a(), b()]), io = savesFor(store);
  store.edit('new A'); const request = io.start();
  store.activate('b'); store.edit('new B'); io.reply(request, 'a');
  assert.equal(store.activeId, 'b'); assert.equal(store.text, 'new B'); assert.equal(store.active.dirty, true);
  assert.equal(store.tabs[0].dirty, false); assert.equal(store.tabs[0].diskVersion, 'v2');
});

test('save-and-close waits for the exact content, and a late reply cannot resurrect a closed tab', () => {
  const store = createDocumentSessions([a(), b()]), io = savesFor(store);
  const close = () => { io.saves.forget('a'); store.setTabs(tabs => tabs.filter(tab => tab.id !== 'a')); };
  const old = io.start(close); store.edit('newer A'); io.reply(old, 'a');
  assert.equal(store.activeId, 'a'); assert.equal(store.active.dirty, true);
  const current = io.start(close); io.reply(current, 'a');
  assert.equal(store.activeId, 'b'); assert.deepEqual(store.tabs.map(tab => tab.id), ['b']);
  io.reply(current, 'a'); assert.deepEqual(store.tabs.map(tab => tab.id), ['b']);
});

test('Save As keeps its target on the originating draft while another document is active', () => {
  const store = createDocumentSessions([{ ...a(), path: null, diskVersion: null }, b()]), io = savesFor(store);
  const request = io.start(); store.edit('typed during picker'); store.activate('b');
  io.reply(request, 'a', { path: 'C:/sql/saved-as.sql', fileName: 'saved-as.sql' });
  assert.equal(store.activeId, 'b'); assert.equal(store.active.name, 'b.sql');
  assert.equal(store.tabs[0].name, 'saved-as.sql'); assert.equal(store.tabs[0].content, 'typed during picker');
  assert.equal(store.tabs[0].dirty, true);
});

test('external changes preserve edits; explicit reload and keep-editor resolve against the same state', () => {
  const store = createDocumentSessions([a(), b()]);
  store.edit('editor text'); store.activate('b');
  store.dispatch({ type: 'externalChanges', changes: [{ path: 'c:\\sql\\a.sql', expectedVersion: 'v1', snapshot: { version: 'v2', content: 'disk text' } }] });
  assert.equal(store.tabs[0].content, 'editor text'); assert.equal(store.tabs[0].externalChange.content, 'disk text');
  store.dispatch({ type: 'resolveExternal', id: 'a', reload: false });
  assert.equal(store.tabs[0].diskVersion, 'v2'); assert.equal(store.tabs[0].content, 'editor text'); assert.equal(store.tabs[0].dirty, true);
  store.dispatch({ type: 'externalChanges', changes: [{ path: a().path, expectedVersion: 'v2', snapshot: { version: 'v3', content: 'new disk' } }] });
  store.dispatch({ type: 'resolveExternal', id: 'a', reload: true });
  store.activate('a'); assert.equal(store.text, 'new disk'); assert.equal(store.active.dirty, false);
  store.dispatch({ type: 'externalChanges', changes: [{ path: a().path, expectedVersion: 'v1', snapshot: { version: 'stale', content: 'stale' } }] });
  assert.equal(store.active.externalChange, null);
});

test('keeping a deleted file creates a draft and a save pending against the old target is inert', () => {
  const store = createDocumentSessions([a()]), io = savesFor(store);
  store.edit('keep me'); const request = io.start();
  store.dispatch({ type: 'externalChanges', changes: [{ path: a().path, expectedVersion: 'v1', snapshot: { version: 'missing', missing: true, content: null } }] });
  store.dispatch({ type: 'resolveExternal', id: 'a', reload: true });
  assert.equal(store.active.path, a().path);
  store.dispatch({ type: 'resolveExternal', id: 'a', reload: false });
  io.reply(request, 'a', { path: a().path });
  assert.equal(store.active.path, null); assert.equal(store.text, 'keep me'); assert.equal(store.active.dirty, true);
});

test('recovery snapshots contain the latest edits across documents without an active-file overlay', () => {
  const store = createDocumentSessions([a(), b()]);
  store.edit('draft A'); store.activate('b'); store.edit('draft B');
  const recovered = parseDraftSnapshot(JSON.stringify(draftSnapshot(store.tabs, store.activeId)));
  const restored = createDocumentSessions(recovered.files, recovered.activeTabId);
  assert.equal(restored.activeId, 'b'); assert.equal(restored.text, 'draft B');
  restored.activate('a'); assert.equal(restored.text, 'draft A');
});

test('read-only definitions cannot be edited and subscribers observe atomic opens', () => {
  const store = createDocumentSessions([a()]), observed = [];
  const unsubscribe = store.subscribe(() => observed.push([store.activeId, store.text]));
  store.open({ id: 'definition', name: 'P.sql', path: null, content: 'BEGIN NULL; END;', dirty: false, readOnly: true });
  store.edit('overwrite');
  assert.equal(store.text, 'BEGIN NULL; END;'); assert.equal(store.active.dirty, false);
  assert.deepEqual(observed[0], ['definition', 'BEGIN NULL; END;']);
  unsubscribe(); store.activate('a'); assert.equal(observed.length, 2);
});
