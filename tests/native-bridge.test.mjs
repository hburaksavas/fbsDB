import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('native commands retain their explicit SQL-tab scope', async () => {
 const original=globalThis.window, messages=[];
 globalThis.window={chrome:{webview:{postMessage:value=>messages.push(JSON.parse(value)),addEventListener(){},removeEventListener(){}}}};
 try {
  const source=(await readFile(new URL('../src/nativeBridge.js',import.meta.url),'utf8')).replace("'./oracleTemporal.js'",JSON.stringify(new URL('../src/oracleTemporal.js',import.meta.url).href));
  const bridge=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  bridge.announceUiReady(); assert.equal(messages.at(-1).tabId,'tab-1');
  bridge.setNativeTabId('tab-b');bridge.sendNativeCommand('sql.execute',{sql:'SELECT 1 FROM DUAL'});
  assert.equal(messages.at(-1).tabId,'tab-b');
  bridge.sendNativeCommand('transaction.rollback',{tabId:'tab-a'});
  assert.equal(messages.at(-1).tabId,'tab-a');
  bridge.sendNativeCommand('sql.cancel');assert.equal(messages.at(-1).tabId,'tab-b');
 } finally {globalThis.window=original;}
});
