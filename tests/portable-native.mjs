import assert from 'node:assert/strict';
import { connectNativePage } from './nativeCdp.mjs';
const cdp = await connectNativePage(process.argv[2]);
try {
  const deadline = Date.now() + 45000;
  let ready;
  do {
    ready = await cdp.evaluate(`Boolean(document.querySelector('.desktop-shell') && window.monaco?.editor.getEditors().length && performance.getEntriesByName('fbsdb:editor-ready', 'mark').length)`);
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.ok(ready, 'The portable web editor must finish mounting.');
  assert.equal(await cdp.evaluate(`Boolean(document.querySelector('.application-error'))`), false);
  console.log('PASS extracted portable WebView2 and Monaco startup');
} finally { cdp.close(); }
