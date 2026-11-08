import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentSessions } from '../src/documentSessions.js';

test('a document other than the active one can be edited, read-only documents stay unchanged', () => {
  const store = createDocumentSessions([{ id: 'a', content: 'one' }, { id: 'b', content: 'two' }, { id: 'c', content: 'locked', readOnly: true }], 'a');
  store.editTab('b', 'two edited');
  const tabs = store.getSnapshot().tabs;
  assert.deepEqual(tabs.map(tab => [tab.id, tab.content, Boolean(tab.dirty)]), [['a', 'one', false], ['b', 'two edited', true], ['c', 'locked', false]]);
  assert.equal(store.activeId, 'a');
  store.editTab('c', 'changed');
  assert.equal(store.getSnapshot().tabs[2].content, 'locked');
});
