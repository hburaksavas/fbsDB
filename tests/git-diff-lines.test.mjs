import test from 'node:test';
import assert from 'node:assert/strict';
import { gitChangeGroups, gitDiffLines, gitStatusLabel } from '../src/gitDiffLines.js';

test('a unified diff becomes rows with old and new line numbers; file headers are dropped', () => {
  const text = `diff --git a/x.sql b/x.sql
index 1111111..2222222 100644
--- a/x.sql
+++ b/x.sql
@@ -3,3 +3,4 @@ BEGIN
 keep;
-old;
+new;
+added;
 end;
\\ No newline at end of file`;
  assert.deepEqual(gitDiffLines(text), [
    { kind: 'hunk', text: '@@ -3,3 +3,4 @@ BEGIN' },
    { kind: 'context', oldLine: 3, newLine: 3, text: 'keep;' },
    { kind: 'remove', oldLine: 4, text: 'old;' },
    { kind: 'add', newLine: 4, text: 'new;' },
    { kind: 'add', newLine: 5, text: 'added;' },
    { kind: 'context', oldLine: 5, newLine: 6, text: 'end;' },
    { kind: 'note', text: 'No newline at end of file' },
  ]);
  assert.deepEqual(gitDiffLines(''), []);
});

test('changed files are grouped as staged and not staged; a file with both appears in both', () => {
  const files = [
    { relativePath: 'b.sql', status: 'M', index: 'M', workTree: '' },
    { relativePath: 'a.sql', status: 'MM', index: 'M', workTree: 'M' },
    { relativePath: 'c.sql', status: '??', index: '', workTree: '?' },
    { relativePath: 'd.sql', status: 'D', index: '', workTree: 'D' },
  ];
  const groups = gitChangeGroups(files);
  assert.deepEqual(groups.staged.map(file => file.relativePath), ['a.sql', 'b.sql']);
  assert.deepEqual(groups.changes.map(file => file.relativePath), ['a.sql', 'c.sql', 'd.sql']);
  assert.deepEqual(['M', 'A', 'D', '?', 'U'].map(gitStatusLabel), ['modified', 'added', 'deleted', 'untracked', 'conflict']);
});
