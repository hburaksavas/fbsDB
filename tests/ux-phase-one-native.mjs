// Real WinUI/WebView2 rendering and keyboard test with an isolated bridge fixture.
// Database/file commands are blocked; only UI scaling is forwarded. No Oracle calls or screenshots.
import assert from 'node:assert/strict';
import {nativeUxFixture} from './nativeUxFixture.mjs';

const endpoint=process.argv[2]||'http://127.0.0.1:9337';
const targets=await(await fetch(`${endpoint}/json/list`)).json();
const target=targets.find(t=>t.type==='page'&&t.url.startsWith('https://fbsdb.local/'));
assert.ok(target,'Run the native app with WebView2 debugging enabled');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let sequence=0;const pending=new Map(),errors=[];
socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout: ${method}`))},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
async function until(expression){for(let i=0;i<100;i++){const value=await evaluate(`Boolean(${expression})`);if(value)return value;await new Promise(r=>setTimeout(r,70))}throw Error(`Timed out: ${expression}`)}
async function click(selector){assert.ok(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.focus();e.click();return true})()`),selector);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
async function textClick(selector,text){assert.ok(await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e||e.disabled)return false;e.focus();e.click();return true})()`),text);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
async function input(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);await evaluate('new Promise(r=>requestAnimationFrame(r))')}
async function key(key,modifiers=0){await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:{Enter:13,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38}[key]||key.toUpperCase().charCodeAt(0),modifiers});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
const editor=`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode()))`;
const fixture=nativeUxFixture;


let scriptId,storage;
try{
  await call('Page.enable');await call('Runtime.enable');
  storage=await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('fbsdb.')).map(k=>[k,localStorage.getItem(k)]))`);
  scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:fixture})).identifier;
  await call('Page.reload');
  await until(`window.__uxFixture&&!!window.monaco?.editor.getEditors().length&&document.querySelector('.connection-control')`);
  await until(`window.__uxFixture.commands.some(c=>c.type==='ui.ready')`);await until(`document.querySelector('.app-status')?.textContent.includes('UX fixture')`);
  await click('[aria-label="Search workbench"]');
  await until(`document.querySelector('[role="combobox"]')`);
  await input('[role="combobox"]','invoice');
  assert.match(await evaluate(`document.querySelector('.ide-palette-results').textContent`),/Files/);
  assert.match(await evaluate(`document.querySelector('.ide-palette-results').textContent`),/History/);
  await textClick('.ide-search-kinds button','History');
  assert.equal(await evaluate(`document.querySelectorAll('.ide-palette-results [role="option"]').length`),1);
  const executions=await evaluate(`window.__uxFixture.commands.filter(c=>c.command==='sql.execute').length`);
  await key('Enter');
  // Category buttons keep their own Enter behavior; focus the search to choose a result.
  await evaluate(`document.querySelector('[role="combobox"]').focus()`);await key('Enter');
  await until(`${editor}.getValue().includes('historic_invoice')`);
  assert.equal(await evaluate(`window.__uxFixture.commands.filter(c=>c.command==='sql.execute').length`),executions);
  console.log('PASS common search groups/history navigation without execution');

  // Start from the original tab; fixture controls connection replies without touching Oracle.
  await click('[data-editor-tab="tab-1"] [role="tab"]');
  await evaluate(`window.__uxFixture.emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV'},serverVersion:'23'})`);
  await until(`document.querySelector('.connection-control-summary')?.textContent.includes('DEV_PDB')`);
  const sql='SELECT :id, name FROM invoices;\nSELECT 2 FROM dual;';
  await evaluate(`${editor}.setValue(${JSON.stringify(sql)});${editor}.setSelection({startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:31});${editor}.focus()`);
  await key('Enter',2);
  await until(`document.querySelector('[aria-label="SQL bind parameters"]')`);
  assert.match(await evaluate(`document.querySelector('.execution-target-status').textContent`),/selection/);
  assert.ok(await evaluate(`${editor}.getModel().getAllDecorations().some(d=>d.options.className==='sql-execution-target')`));
  await key('Escape');
  assert.equal(await evaluate(`${editor}.hasTextFocus()`),true);
  assert.equal(await evaluate(`${editor}.getSelection().endColumn`),31);
  await key('Enter',2);await until(`document.querySelector('.bind-fields input')`);
  await input('.bind-fields input','123456789012345678901234567890');
  await textClick('.bind-modal button','Run statement');
  await until(`window.__uxFixture.commands.some(c=>c.command==='sql.execute')`);
  await evaluate(`window.__uxFixture.first=window.__uxFixture.commands.filter(c=>c.command==='sql.execute').at(-1)`);
  assert.equal(await evaluate(`window.__uxFixture.first.payload.parameters[0].value`),'123456789012345678901234567890');
  await evaluate(`window.__uxFixture.emit({type:'sql.stage',requestId:window.__uxFixture.first.id,tabId:'tab-1',stage:'Waiting for first rows'})`);
  await until(`document.querySelector('.connection-control-summary').textContent.includes('Waiting for first rows')`);
  await click('[aria-label="New SQL file"]');
  const second=await evaluate(`document.querySelector('.file-tab.active').dataset.editorTab`);
  await until(`!document.querySelector('.connection-control-summary').textContent.includes('Waiting for first rows')`);
  await evaluate(`window.__uxFixture.emit({type:'sql.stage',requestId:window.__uxFixture.first.id,tabId:'tab-1',stage:'Fetching first page'})`);
  assert.ok(!await evaluate(`document.querySelector('.connection-control-summary').textContent.includes('Fetching first page')`));
  await click('[data-editor-tab="tab-1"] [role="tab"]');
  await until(`document.querySelector('.connection-control-summary').textContent.includes('Fetching first page')`);
  await evaluate(`window.__uxFixture.result(window.__uxFixture.first)`);
  await until(`document.querySelector('.result-scope')`);
  await until(`window.__uxFixture.phaseLog.some(p=>p?.includes('Rendering results'))`);
  await until(`document.querySelector('.connection-control-summary').textContent.includes('Connected')`);
  assert.equal(await evaluate(`document.querySelectorAll('.session-profile').length`),0);
  console.log('PASS exact execution range, bind Escape focus, exact NUMBER input, per-tab stages and render completion');

  await click('[aria-label="Filters"]');
  await input('[aria-label="Filter value"]','123456789012345678901234567890');
  await textClick('.result-hover-popover button','Add filter');
  await until(`document.querySelectorAll('.scope-chip').length===1`);
  await key('Escape');
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Filters');
  await click('[aria-label="Sorting"]');
  await textClick('.result-hover-popover button','Add sort');await key('Escape');
  assert.equal(await evaluate(`document.querySelectorAll('.scope-chip').length`),2);
  await click('.scope-chip');
  assert.equal(await evaluate(`document.querySelectorAll('.scope-chip').length`),1);
  assert.match(await evaluate(`document.querySelector('.scope-chip').textContent`),/Sort:/);
  await click('[aria-label="Filters"]');
  await input('[aria-label="Filter value"]','A');await textClick('.result-hover-popover button','Add filter');
  await click('.result-server-filter-control summary');
  await textClick('.result-server-filter-content button','Run filtered SQL');
  await until(`window.__uxFixture.commands.filter(c=>c.command==='sql.execute').length===2`);
  await key('Escape');
  await evaluate(`window.__uxFixture.filtered=window.__uxFixture.commands.filter(c=>c.command==='sql.execute').at(-1);window.__uxFixture.result(window.__uxFixture.filtered,[['123456789012345678901234567890','A']],true)`);
  await until(`document.querySelector('.server-scope')`);
  assert.match(await evaluate(`document.querySelector('.result-scope-label').textContent`),/Loaded rows only/);
  await until(`!document.querySelector('[aria-label="Remove server filter and rerun original SELECT"]').disabled`);
  await click('[aria-label="Remove server filter and rerun original SELECT"]');
  await until(`window.__uxFixture.commands.filter(c=>c.command==='sql.execute').length===3`);
  assert.equal(await evaluate(`window.__uxFixture.commands.filter(c=>c.command==='sql.execute').at(-1).payload.sql`),await evaluate(`window.__uxFixture.first.payload.sql`));
  await evaluate(`window.__uxFixture.result(window.__uxFixture.commands.filter(c=>c.command==='sql.execute').at(-1))`);
  await until(`!document.querySelector('.server-scope')`);
  console.log('PASS independently removable local filter/sort chips and explicit server filter/remove reruns');

  await evaluate(`${editor}.setPosition({lineNumber:2,column:5});${editor}.focus()`);await key('Enter',2);
  await until(`document.querySelector('.run-button').getAttribute('aria-label')==='Cancel current SQL statement'`);
  await click('.run-button');
  assert.match(await evaluate(`document.querySelector('.connection-control-summary').textContent`),/Cancelling/);
  assert.equal(await evaluate(`window.__uxFixture.commands.filter(c=>c.command==='sql.cancel').at(-1).tabId`),'tab-1');
  await evaluate(`window.__uxFixture.emit({type:'sql.cancelled',tabId:'tab-1',complete:true,transactionPending:false})`);
  await until(`document.querySelector('.connection-control-summary').textContent.includes('Connected')`);
  console.log('PASS explicit cancellation stays on its SQL tab');

  // Denied metadata keeps the original Oracle detail and one actionable next step.
  await evaluate(`window.__uxFixture.emit({type:'schema.error',tabId:'tab-1',message:'ORA-01031: insufficient privileges'})`);
  await until(`document.querySelector('.objects-section-content').textContent.includes('Oracle access denied')`);
  assert.match(await evaluate(`document.querySelector('.objects-section-content .actionable-state').textContent`),/ORA-01031.*Choose another profile/s);
  await click('.objects-section-content .actionable-state button');await until(`document.querySelector('[aria-label="Change connection"]')`);await key('Escape');
  await click('[aria-label^="Open editors ("]');
  await input('[aria-label="Search open editors"]','UX_DEV');
  assert.ok(await evaluate(`document.querySelectorAll('.editor-tabs-menu [role="menuitem"]').length>=1`));
  await key('ArrowDown');assert.equal(await evaluate(`document.activeElement.getAttribute('role')`),'menuitem');await key('Escape');
  console.log('PASS access-denied action/detail and keyboard profile search in open editors');

  await call('Emulation.setDeviceMetricsOverride',{width:760,height:850,deviceScaleFactor:1.5,mobile:false});
  await click('.ide-view-menu>button');await textClick('.view-categories button','Appearance');await input('[aria-label="Interface scale"]','150');await key('Escape');
  await until(`getComputedStyle(document.querySelector('.editor-toolbar-overflow')).display!=='none'`);
  assert.equal(await evaluate(`document.querySelector('.run-button').innerText.trim()`),'');
  await click('[aria-label="More editor actions"]');
  const bounds=await evaluate(`(()=>{const r=document.querySelector('.editor-overflow-menu').getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth}})()`);
  assert.ok(bounds.left>=0&&bounds.right<=bounds.viewport+1,JSON.stringify(bounds));
  assert.equal(await evaluate(`(()=>{const e=document.querySelector('.editor-overflow-menu button'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.right-3,r.top+r.height/2))})()`),true,'Overflow must escape editor clipping');
  await key('Escape');assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'More editor actions');
  await evaluate(`document.querySelector('.run-button').focus()`);
  assert.notEqual(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`),'none');
  for(const theme of ['default','dark','light']){
    await click('.ide-view-menu>button');await textClick('.view-categories button','Appearance');await input('[aria-label="Theme"]',theme);await key('Escape');await evaluate(`document.querySelector('.run-button').focus()`);
    const focus=await evaluate(`(()=>{const button=document.querySelector('.run-button'),style=getComputedStyle(button),background=getComputedStyle(document.querySelector('.commandbar')).backgroundColor;return {outline:style.outlineColor,style:style.outlineStyle,background}})()`);
    const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
    const a=luminance(focus.outline),b=luminance(focus.background);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3,JSON.stringify({theme,focus}));
  }
  console.log('PASS narrow/high-DPI layout, native 150% scale, unclipped editor menu and focus contrast in all themes');
  assert.deepEqual(errors,[]);
}catch(error){console.error('Fixture diagnostics',JSON.stringify({errors,state:await evaluate(`({fixture:!!window.__uxFixture,monaco:!!window.monaco,body:document.body?.innerText.slice(0,800),viewport:innerWidth,editorWidth:document.querySelector('.editor-workspace')?.getBoundingClientRect().width,container:document.querySelector('.editor-workspace')&&getComputedStyle(document.querySelector('.editor-workspace')).containerName,overflow:document.querySelector('.editor-toolbar-overflow')&&getComputedStyle(document.querySelector('.editor-toolbar-overflow')).display})`).catch(()=>null)}));throw error;}finally{
  await call('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId}).catch(()=>{});
  let restoreId;
  if(storage)restoreId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:`for(const key of Object.keys(localStorage).filter(k=>k.startsWith('fbsdb.')))localStorage.removeItem(key);for(const [key,value]of Object.entries(${JSON.stringify(storage)}))localStorage.setItem(key,value)`})).identifier;
  await call('Page.reload').catch(()=>{});
  await until(`!!window.monaco?.editor.getEditors().length`).catch(()=>{});
  if(restoreId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:restoreId}).catch(()=>{});
  socket.close();
}
