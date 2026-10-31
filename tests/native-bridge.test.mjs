import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('native commands retain their explicit SQL-tab scope', async () => {
 const original=globalThis.window, messages=[];
 globalThis.window={chrome:{webview:{postMessage:value=>messages.push(JSON.parse(value)),addEventListener(){},removeEventListener(){}}}};
 try {
  const source=(await readFile(new URL('../src/nativeBridge.js',import.meta.url),'utf8')).replace("'./oracleTemporal.js'",JSON.stringify(new URL('../src/oracleTemporal.js',import.meta.url).href)).replace("'./bridge/validation.js'",JSON.stringify(new URL('../src/bridge/validation.js',import.meta.url).href));
  const bridge=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  bridge.announceUiReady(); assert.equal(messages.at(-1).tabId,'tab-1');
  bridge.setNativeTabId('tab-b');bridge.sendNativeCommand('sql.execute',{sql:'SELECT 1 FROM DUAL'});
  assert.equal(messages.at(-1).tabId,'tab-b');
  bridge.sendNativeCommand('transaction.rollback',{tabId:'tab-a'});
  assert.equal(messages.at(-1).tabId,'tab-a');
  bridge.sendNativeCommand('sql.cancel');assert.equal(messages.at(-1).tabId,'tab-b');
 } finally {globalThis.window=original;}
});

test('the bridge rejects malformed commands before posting and drops malformed native replies', async () => {
 const originalWindow=globalThis.window, originalWarn=console.warn, posted=[], received=[], warnings=[], handlers=new Set();
 globalThis.window={chrome:{webview:{postMessage:value=>posted.push(JSON.parse(value)),addEventListener:(_,handler)=>handlers.add(handler),removeEventListener:(_,handler)=>handlers.delete(handler)}}};
 console.warn=(...args)=>warnings.push(args);
 try {
  const source=(await readFile(new URL('../src/nativeBridge.js',import.meta.url),'utf8'))
   .replace("'./oracleTemporal.js'",JSON.stringify(new URL('../src/oracleTemporal.js',import.meta.url).href))
   .replace("'./bridge/validation.js'",JSON.stringify(new URL('../src/bridge/validation.js',import.meta.url).href));
  const bridge=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// bridge validation fixture').toString('base64'));
  assert.throws(()=>bridge.sendNativeCommand('file.save',{content:42}),TypeError);
  assert.equal(posted.length,0);
  const requestId=bridge.sendNativeCommand('file.save',{content:'SELECT 1',path:null,tabId:'a'});
  assert.equal(posted[0].tabId,'a');
  const unsubscribe=bridge.subscribeNativeMessages(message=>received.push(message));
  const emit=data=>{for(const handler of handlers)handler({data})};
  emit(JSON.stringify({type:'file.saved',requestId,tabId:'a',path:'a.sql',fileName:'a.sql'}));
  assert.equal(received.length,0);assert.equal(warnings.length,1);
  emit({type:'file.saved',requestId,tabId:'a',path:'a.sql',fileName:'a.sql',diskVersion:'v2'});
  assert.equal(received[0].diskVersion,'v2');
  unsubscribe();assert.equal(handlers.size,0);
 } finally {globalThis.window=originalWindow;console.warn=originalWarn;}
});
