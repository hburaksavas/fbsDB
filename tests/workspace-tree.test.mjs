import test from 'node:test';
import assert from 'node:assert/strict';
import { filteredWorkspaceTree, remapWorkspacePath } from '../src/workspaceTree.js';

test('workspace search retains ancestors and duplicate basenames in their own folders', () => {
  const files = ['queries/report.sql', 'archive/report.sql', 'other.sql'].map(relativePath => ({ relativePath, path: `C:\\project\\${relativePath.replaceAll('/', '\\')}` }));
  const tree = filteredWorkspaceTree(files, 'REPORT');
  assert.equal(tree.filter(item => !item.isDirectory).length, 2);
  assert.deepEqual(tree.filter(item => item.isDirectory).map(item => item.name), ['queries', 'archive']);
  assert.equal(tree[0].path, 'C:\\project\\queries');
  assert.equal(filteredWorkspaceTree(files, 'missing').length, 0);
});

test('file moves preserve descendants and leave similarly named siblings alone', () => {
  assert.equal(remapWorkspacePath('C:\\project\\q\\draft.sql', 'C:\\project\\q', 'C:\\project\\archive'), 'C:\\project\\archive\\draft.sql');
  assert.equal(remapWorkspacePath('C:\\project\\queries\\draft.sql', 'C:\\project\\q', 'C:\\project\\archive'), 'C:\\project\\queries\\draft.sql');
  assert.equal(remapWorkspacePath(null, 'a', 'b'), null);
});
