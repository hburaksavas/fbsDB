import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentSaves } from '../src/documentSaves.js';

function fixture() {
  const saves = new DocumentSaves(), commands = [];
  const send = (command, payload) => {
    const id = `save-${commands.length + 1}`;
    commands.push({ id, command, payload });
    return id;
  };
  const document = { id: 'a', path: 'a.sql', name: 'a.sql', content: 'SELECT 1', dirty: true, diskVersion: 'v1' };
  const reply = (requestId, tabId = 'a') => ({ type: 'file.saved', requestId, tabId, path: `${tabId}.sql`, fileName: `${tabId}.sql`, diskVersion: 'v2' });
  return { saves, commands, send, document, reply };
}

test('a delayed save retains newer editor text and its unsaved state without closing the document', () => {
  const { saves, send, document, reply } = fixture();
  let closed = false;
  const id = saves.start(send, document, () => { closed = true; });
  const result = saves.saved(reply(id), { ...document, content: 'SELECT 2' });
  assert.equal(result.document.content, 'SELECT 2');
  assert.equal(result.document.dirty, true);
  assert.equal(result.document.diskVersion, 'v2');
  result.afterSave?.();
  assert.equal(closed, false);
});

test('out-of-order replies across tabs only resume their own save-and-close actions', () => {
  const { saves, send, document, reply } = fixture(), closed = [];
  const b = { ...document, id: 'b', path: 'b.sql' };
  const aId = saves.start(send, document, () => closed.push('a'));
  const bId = saves.start(send, b, () => closed.push('b'));
  saves.saved(reply(bId, 'b'), b).afterSave?.();
  assert.deepEqual(closed, ['b']);
  saves.saved(reply(aId), document).afterSave?.();
  assert.deepEqual(closed, ['b', 'a']);
  assert.equal(saves.saved(reply(aId), document), null);
});

test('errors and cancellation release only the matching request; wrong-tab replies cannot consume it', () => {
  const { saves, send, document, reply } = fixture();
  const aId = saves.start(send, document);
  const b = { ...document, id: 'b', path: 'b.sql' };
  const bId = saves.start(send, b);
  assert.equal(saves.take('unrelated-error'), null);
  assert.equal(saves.saved(reply(aId, 'b'), b), null);
  assert.ok(saves.take(bId, 'b'));
  assert.ok(saves.start(send, b));
  assert.equal(saves.saved(reply(aId), document).document.dirty, false);
});

test('saves of the same document cannot race, and retries use the acknowledged disk baseline', () => {
  const { saves, commands, send, document, reply } = fixture();
  const id = saves.start(send, document);
  assert.equal(saves.start(send, { ...document, content: 'SELECT 2' }), null);
  assert.equal(commands.length, 1);
  const result = saves.saved(reply(id), { ...document, content: 'SELECT 2' });
  assert.ok(saves.start(send, result.document));
  assert.equal(commands[1].payload.diskVersion, 'v2');
  assert.equal(commands[1].payload.content, 'SELECT 2');
  assert.equal(commands[1].payload.tabId, 'a');
});

test('closing or moving a document makes its late save reply inert', () => {
  const { saves, send, document, reply } = fixture();
  const id = saves.start(send, document);
  saves.forget('a');
  assert.equal(saves.saved(reply(id), document), null);
  const moved = saves.start(send, document);
  assert.equal(saves.saved(reply(moved), { ...document, path: 'moved.sql' }), null);
  const removed = saves.start(send, document);
  assert.equal(saves.saved(reply(removed), null), null);
});

test('Save As updates the target and metadata while retaining changes made during the picker', () => {
  const { saves, send, document, reply } = fixture();
  const draft = { ...document, path: null, diskVersion: null };
  const id = saves.start(send, draft);
  const result = saves.saved({ ...reply(id), profileId: 'oracle-profile' }, { ...draft, content: 'SELECT 3' });
  assert.equal(result.document.path, 'a.sql');
  assert.equal(result.document.connectionProfileId, 'oracle-profile');
  assert.equal(result.document.dirty, true);
});

test('a missing native host does not leave a document stuck saving', () => {
  const { saves, send, document } = fixture();
  assert.equal(saves.start(() => null, document), null);
  assert.ok(saves.start(send, document));
});
