import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberClipboard,clipboardPasteTexts} from '../src/clipboardHistory.js';

test('session history deduplicates and keeps bounded fragments',()=>{
  let history=[];for(let i=0;i<25;i++)history=rememberClipboard(history,[`SELECT ${i} FROM dual`]);
  assert.equal(history.length,20);
  history=rememberClipboard(history,['SELECT 24 FROM dual']);assert.equal(history.length,20);
  assert.equal(history[0].text,'SELECT 24 FROM dual');
  assert.equal(rememberClipboard(history,['x'.repeat(20001)]),history);
});

test('multi selection paste distributes copied ranges or matching lines',()=>{
  const entry=rememberClipboard([],['one','two'])[0];
  assert.deepEqual(clipboardPasteTexts(entry,2).texts,['one','two']);
  assert.deepEqual(clipboardPasteTexts(entry,3).texts,['one\ntwo','one\ntwo','one\ntwo']);
  assert.match(clipboardPasteTexts(entry,3,true).error,/2 lines/);
  assert.deepEqual(clipboardPasteTexts(entry,2,true).texts,['one','two']);
});
