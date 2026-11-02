import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('local history never writes to disk: restore edits the editor and no save command is issued by the dialog',async()=>{
 const source=await readFile(new URL('../src/LocalHistoryDialog.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/file\.save|workspace\.createFile|file\.openPath/);
 assert.match(source,/file\.history\.list/);assert.match(source,/file\.history\.read/);assert.match(source,/Restoring changes the editor only/);
});
