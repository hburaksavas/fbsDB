// Real WinUI/WebView2 rendering and keyboard test with an isolated bridge fixture.
// Database/file commands are blocked; only UI scaling is forwarded. No Oracle calls or screenshots.
// Run against a disposable WEBVIEW2_USER_DATA_FOLDER; this test changes its preferences and drafts.
import assert from 'node:assert/strict';
import {nativeUxFixture} from './nativeUxFixture.mjs';

const endpoint=process.argv[2]||'http://127.0.0.1:9345';
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
async function key(key,modifiers=0){await call('Input.dispatchKeyEvent',{type:'keyDown',key,text:key==='Enter'?'\r':undefined,code:key===' '?'Space':key,windowsVirtualKeyCode:{' ':32,Enter:13,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38}[key]||(/^F\d+$/.test(key)?111+Number(key.slice(1)):key.toUpperCase().charCodeAt(0)),modifiers});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
const editor=`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode()))`;
let scriptId;
async function run(){
 const before=await evaluate(`__uxFixture.commands.filter(c=>c.command==='sql.execute').length`);
 await evaluate(`${editor}.setValue('SELECT * FROM missing_object;');${editor}.focus()`);await key('Enter',2);
 await until(`__uxFixture.commands.filter(c=>c.command==='sql.execute').length>${before}`);
 await until(`document.querySelector('.result-running')`);
 return evaluate(`__uxFixture.commands.filter(c=>c.command==='sql.execute').at(-1)`);
}
async function emit(value){await evaluate(`__uxFixture.emit(${JSON.stringify(value)})`)}
try{
 await call('Page.enable');await call('Runtime.enable');
 scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture+`;const basePost=chrome.webview.postMessage;chrome.webview.postMessage=value=>{const m=JSON.parse(value);if(m.command==='sql.fetchNext'){__uxFixture.commands.push(m);return}basePost(value)};`})).identifier;
 await call('Page.reload');await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length&&document.querySelector('.app-status')?.textContent.includes('UX fixture')`);await evaluate('new Promise(r=>setTimeout(r,150))');
 assert.equal(await evaluate(`document.body.textContent.includes('Connect this SQL tab before running SQL.')`),false);
 await until(`document.querySelector('.result-idle')`);
 for(let i=0;i<3;i++){
  await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);await key('Escape');
  const idle=await evaluate(`(()=>{const e=document.querySelector('.result-idle'),mark=e.querySelector('.result-idle-mark'),r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {text:e.textContent,width:r.width,height:r.height,center:Math.abs((r.left+r.width/2)-(p.left+p.width/2)),icon:getComputedStyle(mark).color,surface:getComputedStyle(mark).backgroundColor,buttons:e.querySelectorAll('button').length}})()`);
  assert.match(idle.text,/^No results yet.*(Connect to a database|Press .+ to run|Write a statement)/);assert.ok(idle.height<65);assert.ok(idle.center<2);assert.equal(idle.buttons,1,'One next-step button is offered');assert.notEqual(idle.icon,idle.surface);
 }
 console.log('PASS compact centered idle state in all three themes');
 await emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV'},serverVersion:'23'});
 for(let i=0;i<3;i++){
  await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);await key('Escape');
  let req=await run();await emit({type:'host.error',requestId:req.id,tabId:req.tabId,message:'ORA-00942: table or view does not exist'});
  await until(`document.querySelector('.result-notice[data-kind=error]')`);
  assert.match(await evaluate(`document.querySelector('.result-notice pre').textContent`),/ORA-00942/);assert.equal(await evaluate(`document.querySelector('.feedback-stack').textContent.includes('ORA-00942')`),false);
  const colors=await evaluate(`(()=>{const e=document.querySelector('.result-notice');const c=getComputedStyle(e);return [c.backgroundColor,c.color,c.borderColor]})()`);
  assert.notEqual(colors[0],'rgba(0, 0, 0, 0)');assert.notEqual(colors[0],colors[1]);
  await textClick('.result-notice-actions button','Return to SQL');assert.equal(await evaluate(`${editor}.hasTextFocus()`),true);
  req=await run();await evaluate(`__uxFixture.result(${JSON.stringify(req)},[],false)`);await until(`document.querySelector('.result-notice[data-kind=empty]')`);
  assert.match(await evaluate(`document.querySelector('.result-notice').textContent`),/No rows returned.*0 rows/);
  req=await run();await emit({type:'sql.timeout',requestId:req.id,tabId:req.tabId,message:'Query exceeded 30 seconds.',transactionPending:false});await until(`document.querySelector('.result-notice[data-kind=timeout]')`);
  assert.equal(await evaluate(`document.querySelector('.feedback-stack').textContent.includes('Query exceeded 30 seconds.')`),false);console.log('PASS error/timeout remain only in Results, empty state and focus; theme',i);
 }
 let req=await run();await until(`document.querySelector('.result-cancel')&&!document.querySelector('.result-cancel').disabled`);
 assert.match(await evaluate(`document.querySelector('.result-running time').textContent`),/\d+s/);
 await click('.result-cancel');await until(`document.querySelector('.result-cancel').disabled`);
 let cancel=await evaluate(`__uxFixture.commands.filter(c=>c.command==='sql.cancel').at(-1)`);assert.equal(cancel.tabId,req.tabId);
 await emit({type:'sql.cancelled',requestId:cancel.id,tabId:req.tabId,complete:false});await emit({type:'sql.cancelled',requestId:req.id,tabId:req.tabId,complete:true,transactionPending:false});await until(`document.querySelector('.result-notice[data-kind=cancelled]')`);
 const old=req;req=await run();await emit({type:'host.error',requestId:old.id,tabId:old.tabId,message:'Stale error'});assert.ok(await evaluate(`Boolean(document.querySelector('.result-running'))`));
 await evaluate(`__uxFixture.result(${JSON.stringify(req)},[['1','retained']],true)`);await until(`document.querySelector('[aria-label="Next result page"]')`);await click('[aria-label="Next result page"]');await until(`document.querySelector('.result-running.compact .result-cancel')`);
 await click('.result-running.compact .result-cancel');cancel=await evaluate(`__uxFixture.commands.filter(c=>c.command==='sql.cancel').at(-1)`);
 const fetchRequest=await evaluate(`__uxFixture.commands.filter(c=>c.command==='sql.fetchNext').at(-1)`);
 await emit({type:'sql.pageError',requestId:fetchRequest.id,tabId:fetchRequest.tabId,message:'Row loading cancelled.'});
 await until(`!document.querySelector('.result-running')`);assert.ok(await evaluate(`document.querySelector('.result-view-content').textContent.includes('retained')`));
 req=await run();
 await click('[aria-label="New SQL file"]');await until(`document.querySelectorAll('[data-editor-tab]').length===2`);
 const second=await evaluate(`document.querySelector('[data-editor-tab]:not([data-editor-tab="tab-1"])').dataset.editorTab`);
 await emit({type:'connection.connected',tabId:second,profile:{id:'UX_DEV'},serverVersion:'23'});
 const other=await run();assert.equal(other.tabId,second);
 await emit({type:'host.error',requestId:req.id,tabId:req.tabId,message:'ORA-01031: insufficient privileges'});
 assert.ok(await evaluate(`Boolean(document.querySelector('.result-running'))`),'Inactive tab error must not stop active query');assert.ok(await evaluate(`Boolean(document.querySelector('[data-editor-tab="tab-1"] .file-tab-error'))`));assert.equal(await evaluate(`document.querySelector('.feedback-stack').textContent.includes('ORA-01031')`),false);
 await click('[data-editor-tab="tab-1"] [role="tab"]');await until(`document.querySelector('.result-notice[data-kind=error]')`);
 assert.match(await evaluate(`document.querySelector('.result-notice').textContent`),/Insufficient privileges/);
 req=await run();assert.equal(await evaluate(`Boolean(document.querySelector('[data-editor-tab="tab-1"] .file-tab-error'))`),false);await until(`document.querySelector('.result-cancel')`);await click('.result-cancel');
 cancel=await evaluate(`__uxFixture.commands.filter(c=>c.command==='sql.cancel').at(-1)`);assert.equal(cancel.tabId,'tab-1');
 await click(`[data-editor-tab="${second}"] [role="tab"]`);
 await emit({type:'sql.cancelled',requestId:req.id,tabId:'tab-1',complete:true,transactionPending:false});
 assert.ok(await evaluate(`Boolean(document.querySelector('.result-running'))`),'Inactive tab cancellation must not stop active query');
 await evaluate(`__uxFixture.result(${JSON.stringify(other)},[],false)`);await until(`document.querySelector('.result-notice[data-kind=empty]')`);
 await click('[data-editor-tab="tab-1"] [role="tab"]');await until(`document.querySelector('.result-notice[data-kind=cancelled]')`);
 console.log('PASS concurrent query errors and Cancel remain scoped to their originating SQL tabs');
 assert.deepEqual(errors,[]);console.log('PASS elapsed timer, cancel ownership, cancellation, stale error protection, fetch cancel retaining rows');
}finally{if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});socket.close()}



