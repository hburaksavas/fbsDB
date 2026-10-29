// Explicit integration check against a running fbsDB WebView2 debug endpoint.
// No screenshots, SQL execution, connections, or database mutations.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'http://127.0.0.1:9337';
const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find(item => item.type === 'page' && item.url.startsWith('https://fbsdb.local/'));
assert.ok(target, 'A native fbsDB WebView2 page is required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map(), errors = [], checks = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) { const action = pending.get(message.id); pending.delete(message.id); message.error ? action?.reject(message.error) : action?.resolve(message.result); }
  else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
});
function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000); pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
const settle = () => evaluate('new Promise(resolve => { const timer=setTimeout(resolve,250); requestAnimationFrame(() => requestAnimationFrame(() => {clearTimeout(timer);resolve()})) })');
const click = async (selector, text) => { const found = await evaluate(`(()=>{const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!element)return false;element.click();return true})()`); assert.ok(found, `Missing control: ${text || selector}`); await settle(); };
const geometry = selector => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return null;const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
const record = name => { checks.push(name); console.log(`PASS ${name}`); };
async function drag(panel, side, destination = null, placement = 'merge', cancel = false) {
  const result = await evaluate(`(async()=>{
    const source=[...document.querySelectorAll('.dock-panel-tab')].find(e=>e.textContent.trim()===${JSON.stringify(panel)});
    const r=source.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    const event=(type,target,px,py)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,buttons:type==='pointerup'?0:1,pointerId:999,pointerType:'mouse',clientX:px,clientY:py}));
    event('pointerdown',source,x,y);event('pointermove',document,x+12,y+5);
    await new Promise(resolve=>setTimeout(resolve,30));
    const destination=${JSON.stringify(destination)},placement=${JSON.stringify(placement)},side=${JSON.stringify(side)};
    let target=document,px,py;
    if(destination){
      const panel=document.querySelector('[data-group-id="'+destination+'"]');if(!panel)return false;
      const box=(placement.startsWith('merge')?panel.querySelector('.dock-group-header'):panel).getBoundingClientRect();
      px=placement==='left'?box.x+4:placement==='right'?box.right-4:placement==='merge-first'?box.x+30:placement==='merge'?box.right-30:box.x+box.width/2;
      py=placement==='top'?box.y+4:placement==='bottom'?box.bottom-4:box.y+box.height/2;
      target=panel;
    }else{const box=document.querySelector('.dock-workbench').getBoundingClientRect();px=side==='left'?box.x+14:box.right-14;py=placement==='start'?box.y+14:box.bottom-14;}
    event('pointermove',target,px,py);
    await new Promise(resolve=>{const timer=setTimeout(resolve,100);requestAnimationFrame(()=>{clearTimeout(timer);resolve()})});
    const previews=[...document.querySelectorAll('.dock-drop-preview')].filter(e=>!e.hidden);
    if(previews.length!==1)throw new Error('Docking must show exactly one spatial preview');
    if(document.querySelector('.dock-group-targets,.dock-edge-target'))throw new Error('Legacy drop zones must not be rendered');
    if(${cancel})document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    const preview=previews[0].getBoundingClientRect();const expected={x:preview.x,y:preview.y,width:preview.width,height:preview.height};event('pointerup',target,px,py);return expected;
  })()`);
  assert.ok(result,'Dock target is available');await settle();
  if(!cancel){const actual=await evaluate(`(()=>{const e=[...document.querySelectorAll('.dock-panel-tab')].find(e=>e.textContent.trim()===${JSON.stringify(panel)}),r=e.closest('.dock-group').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual[key]-result[key])<2,`Spatial preview ${key} must match the dropped panel: ${JSON.stringify({actual,preview:result})}`);}

}

await call('Runtime.enable');
if (process.argv.includes('--reload')) { await call('Page.reload'); await new Promise(resolve => setTimeout(resolve, 500)); }
for (let attempt = 0; attempt < 100; attempt++) {
  try { if (await evaluate(`document.querySelectorAll('.dock-panel-tab').length===4&&!!window.monaco?.editor.getEditors().length`)) break; } catch {}
  await new Promise(resolve => setTimeout(resolve, 150));
}
const initial = await evaluate(`({modal:!!document.querySelector('.modal-backdrop'),editor:!!window.monaco?.editor.getEditors().length,panels:[...document.querySelectorAll('.dock-panel-tab')].map(e=>e.textContent.trim()),bounds:[...document.querySelectorAll('.dock-group')].map(e=>({name:e.getAttribute('aria-label'),height:Math.round(e.getBoundingClientRect().height)}))})`);
console.log(JSON.stringify(initial));
if (process.argv.includes('--inspect')) { socket.close(); process.exit(0); }
assert.equal(initial.modal, false, 'Dismiss existing dialogs before running native acceptance checks');
const preferenceKeys = ['fbsdb.settings.v1','fbsdb.explorerExpandedPaths','fbsdb.resultsInspectorWidth','fbsdb.theme','fbsdb.codeStyle','fbsdb.tokenColors','fbsdb.completion','fbsdb.autoCompletion','fbsdb.queryTimeout'];
const savedPreferences = await evaluate(`Object.fromEntries(${JSON.stringify(preferenceKeys)}.map(key=>[key,localStorage.getItem(key)]))`);
await evaluate(`window.__viewQa={settings:localStorage.getItem('fbsdb.settings.v1'),expanded:localStorage.getItem('fbsdb.explorerExpandedPaths'),refs:Object.fromEntries([...document.querySelectorAll('.dock-panel-slot')].map(e=>[e.dataset.panelId,e.firstElementChild])),sql:window.monaco?.editor.getEditors()[0]?.getValue()}`);
try {
  // Use the public reset action to start from a deterministic layout.
  if (!await evaluate(`document.querySelector('.view-popover')!==null`)) await click('.ide-view-menu>button'); await click('.view-categories button', 'Layout'); await click('[role="menuitem"]', 'Reset Panel Layout');
  await drag('Object Explorer', 'right');
  assert.equal(await evaluate(`document.querySelector('[data-panel-id="objects"]').closest('.dock-side').dataset.side`), 'right');
  assert.equal(await evaluate(`document.querySelector('[data-panel-id="objects"]').firstElementChild===window.__viewQa.refs.objects`), true);
  record('native drag docks right without recreating panel content');
  await drag('Explorer', 'right', await evaluate(`document.querySelector('[data-panel-id="objects"]').closest('.dock-group').dataset.groupId`), 'left');
  assert.equal(await evaluate(`(()=>{const a=document.querySelector('[data-panel-id="files"]').closest('.dock-group').getBoundingClientRect(),b=document.querySelector('[data-panel-id="objects"]').closest('.dock-group').getBoundingClientRect();return a.right<=b.left&&Math.abs(a.y-b.y)<1&&Math.abs(a.height-b.height)<1})()`),true);
  record('dropping beside a panel creates a real horizontal split');
  const beforeResize=await evaluate(`document.querySelector('[data-panel-id="files"]').closest('.dock-group').getBoundingClientRect().width`);
  await evaluate(`document.querySelector('.dock-side[data-side="right"] .dock-split-divider-x').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);await settle();
  assert.ok(await evaluate(`document.querySelector('[data-panel-id="files"]').closest('.dock-group').getBoundingClientRect().width`)>beforeResize);
  record('horizontal split sizing is adjustable and persisted');
  await drag('Connections','right',await evaluate(`document.querySelector('[data-panel-id="files"]').closest('.dock-group').dataset.groupId`),'bottom');
  assert.equal(await evaluate(`(()=>{const a=document.querySelector('[data-panel-id="files"]').closest('.dock-group').getBoundingClientRect(),b=document.querySelector('[data-panel-id="connections"]').closest('.dock-group').getBoundingClientRect(),other=document.querySelector('[data-panel-id="objects"]').closest('.dock-group').getBoundingClientRect();return b.top>=a.bottom&&Math.abs(a.x-b.x)<1&&other.height>a.height})()`),true);
  record('dropping below one column creates a nested vertical split');
  await drag('Connections','left',null,'end');

  await drag('Explorer', 'right', await evaluate(`document.querySelector('[data-panel-id="objects"]').closest('.dock-group').dataset.groupId`));
  assert.deepEqual(await evaluate(`[...document.querySelector('.dock-side[data-side="right"] .dock-panel-tabs').querySelectorAll('button')].map(e=>e.textContent.trim())`), ['Object Explorer', 'Explorer']);
  assert.equal(await evaluate(`document.querySelector('[data-panel-id="files"]').firstElementChild===window.__viewQa.refs.files`), true);
  record('native drag groups panels as tabs with stable content');
  await drag('Explorer','right',await evaluate(`document.querySelector('[data-panel-id="objects"]').closest('.dock-group').dataset.groupId`),'merge-first');
  assert.deepEqual(await evaluate(`[...document.querySelector('[data-panel-id="objects"]').closest('.dock-group').querySelectorAll('.dock-panel-tab')].map(e=>e.textContent.trim())`),['Explorer','Object Explorer']);
  record('heading drops insert tabs at the requested position');

  assert.equal(await evaluate(`document.querySelectorAll('.dock-collapse').length`), 0);
  await click('.dock-side[data-side="right"] .dock-group-menu'); await click('.dock-actions-menu button', 'Hide panel');
  assert.equal(await evaluate(`document.querySelector('[data-panel-id="files"]').hidden`), true);
  await click('.ide-view-menu>button'); await click('.view-categories button', 'Panels'); await click('[role="menuitemcheckbox"]', 'Explorer');
  assert.equal(await evaluate(`document.querySelector('[data-panel-id="files"]').hidden`), false);
  assert.equal(await evaluate(`document.querySelector('[data-panel-id="files"]').firstElementChild===window.__viewQa.refs.files`), true);
  await click('.ide-view-menu>button');
  record('panels hide and reopen without collapse controls or remounting');
  const beforeCancel = await evaluate(`localStorage.getItem('fbsdb.settings.v1')`);
  await drag('Explorer', 'left', null, 'after', true);
  assert.equal(await evaluate(`localStorage.getItem('fbsdb.settings.v1')`), beforeCancel);
  record('Escape cancels docking without saving a new layout');
  await click('.ide-view-menu>button'); await click('.view-categories button', 'Layout'); await click('[role="menuitemcheckbox"]', 'Editor focus mode');
  assert.equal(await evaluate(`document.querySelector('main').dataset.focus`), 'true');
  assert.equal(await evaluate(`document.querySelector('.result-panel').getBoundingClientRect().height`), 37);
  assert.equal(await evaluate(`!!document.querySelector('.dock-side:not([hidden])')`), false);
  await click('[role="menuitemcheckbox"]', 'Editor focus mode');
  assert.equal(await evaluate(`document.querySelector('main').dataset.focus`), 'false');
  assert.equal(await evaluate(`document.querySelector('[data-panel-id="objects"]').closest('.dock-side').dataset.side`), 'right');
  record('focus mode restores docking and keeps the bottom tab strip');
  await click('.ide-view-menu>button');
  await drag('Object Explorer','left',null,'end');
  assert.equal(await evaluate(`(()=>{const panel=document.querySelector('[data-panel-id="objects"]').closest('.dock-group').getBoundingClientRect(),root=document.querySelector('.dock-workbench').getBoundingClientRect(),above=document.querySelector('[data-panel-id="connections"]').closest('.dock-group').getBoundingClientRect();return Math.abs(panel.bottom-root.bottom)<1&&panel.top>=above.bottom})()`),true);
  record('bottom-left drop places the panel at the sidebar bottom');
  await click('.ide-view-menu>button');

  await click('.view-categories button', 'Editor');
  const previousWrap = await evaluate(`window.monaco?.editor.getEditors()[0]?.getRawOptions().wordWrap`);
  await click('[role="menuitemcheckbox"]', 'Word wrap');
  if (initial.editor) {
    assert.equal(await evaluate(`window.monaco.editor.getEditors()[0].getRawOptions().wordWrap`), previousWrap === 'on' ? 'off' : 'on');
    assert.equal(await evaluate(`window.monaco.editor.getEditors()[0].getValue()===window.__viewQa.sql`), true);
    record('editor options apply immediately without changing SQL');
  }
  await click('.view-categories button', 'Appearance');
  await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Theme"]');e.value='light';e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await settle();
  assert.equal(await evaluate(`document.querySelector('main').dataset.theme`), 'light');
  const themes = await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Theme"]');return [...e.options].map(o=>o.value)})()`);
  assert.deepEqual(themes, ['default', 'dark', 'light']);
  record('theme selection updates the live native workbench');
  const originalFontSize = await evaluate(`window.monaco?.editor.getEditors()[0]?.getRawOptions().fontSize`);
  await click('[role="menuitem"]', 'Reset scale to 100%'); await new Promise(resolve => setTimeout(resolve, 150));
  const originalWidth = await evaluate('innerWidth');
  await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Interface scale"]');e.value='125';e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await settle();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await evaluate(`window.monaco?.editor.getEditors()[0]?.getRawOptions().fontSize`), originalFontSize);
  assert.ok(await evaluate('innerWidth') < originalWidth, 'Native host should expose a smaller logical viewport at 125% scale');
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true);
  record('native host scaling changes the viewport without changing editor font preferences');
  assert.deepEqual(errors.filter(error => !error.includes('Canceled')), []);
  record('no native WebView runtime exceptions');
} finally {
  await evaluate(`(()=>{for(const[key,value]of Object.entries(${JSON.stringify(savedPreferences)})){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}delete window.__viewQa})()`);
  // Restore persisted user preferences and let the clean startup rehydrate them.
  await call('Page.reload'); socket.close();
}
console.log(JSON.stringify({ checks, errors: errors.filter(error => !error.includes('Canceled')) }));
