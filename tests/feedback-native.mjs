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
const extra=`(()=>{
 const base=chrome.webview.postMessage;window.__feedbackFixture={hold:false};
 chrome.webview.postMessage=value=>{base(value);const m=JSON.parse(value),p=m.payload||{};
  const reply=data=>setTimeout(()=>__uxFixture.emit({...data,requestId:m.id,tabId:m.tabId}),10);
  if(m.command==='workspace.worksets')reply({type:'workspace.worksets',root:p.root,worksets:[{id:'set-a',name:'Reports',files:[]}]});
  if(m.command==='workspace.worksetSave'||m.command==='workspace.worksetDelete')reply({type:'workspace.worksets',root:p.root,worksets:[{id:'set-a',name:p.name||'Reports',files:[]}]});
  if(m.command==='connection.organization')reply({type:'connection.organization',success:false,message:'Could not save the folder: fixture permission denied.'});
 }
})()`;
let scriptId;
async function emit(value){await evaluate(`__uxFixture.emit(${JSON.stringify(value)})`)}
async function command(label){await key('p',10);await until(`document.querySelector('[aria-label="Search workbench"][role=combobox]')`);await input('[aria-label="Search workbench"][role=combobox]',label);await until(`document.querySelector('#ide-command-results button')`);await click('#ide-command-results button')}
async function dismissAll(){await evaluate(`document.querySelectorAll('.feedback-dismiss[aria-label="Dismiss notification"]').forEach(e=>e.click())`)}
try{
 await call('Page.enable');await call('Runtime.enable');scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture+';\n'+extra})).identifier;
 await call('Page.reload');await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length&&document.querySelector('.app-status')?.textContent.includes('UX fixture')`);await evaluate('new Promise(r=>setTimeout(r,150))');
 await emit({type:'host.error',tabId:'tab-1',requestId:'fixture-save',message:'The SQL file could not be saved: Access denied.'});
 await until(`document.querySelector('.feedback-notification[data-kind=error]')?.textContent.includes('Access denied')`);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'F8',code:'F8',windowsVirtualKeyCode:119});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'F8',code:'F8',windowsVirtualKeyCode:119});
 assert.ok(await evaluate(`Boolean(document.activeElement?.closest('.feedback-notification'))`));
 for(let i=0;i<3;i++){
  await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);
  assert.equal(await evaluate(`document.querySelector('.feedback-stack').dataset.theme`),['default','dark','light'][i]);await key('Escape');
  await click('[aria-label="Manage connections"]');await textClick('.connection-library-toolbar button','New folder');await until(`document.querySelector('.feedback-dialog input[aria-label="Folder name"]')`);
  assert.equal(await evaluate(`document.querySelector('.feedback-dialog-scope').dataset.theme`),['default','dark','light'][i]);
  await input('[aria-label="Folder name"]','Test folder');
  const before=await evaluate(`__uxFixture.commands.filter(c=>c.command==='connection.organization').length`);
  await key('Tab');assert.ok(await evaluate(`Boolean(document.activeElement?.closest('.feedback-dialog'))`));
  await key('Escape');await until(`!document.querySelector('.feedback-dialog')`);assert.ok(await evaluate(`Boolean(document.querySelector('.connection-library'))`));
  assert.equal(await evaluate(`__uxFixture.commands.filter(c=>c.command==='connection.organization').length`),before);
  await textClick('.connection-library-toolbar button','New folder');await input('[aria-label="Folder name"]','Protected');await textClick('.feedback-dialog button','Save folder');
  await until(`document.querySelector('.feedback-stack').textContent.includes('fixture permission denied')`);
  assert.ok(await evaluate(`Boolean(document.querySelector('.feedback-dialog input'))`),'Failed save keeps prompt input');
  assert.equal(await evaluate(`document.querySelector('.feedback-dialog input').value`),'Protected');
  await key('Escape');await click('[aria-label="Close connection manager"]');
  console.log('PASS prompt focus, Escape, failed save retention and live notification/dialog theme',i);
 }
 await until(`document.querySelector('.feedback-stack').textContent.includes('Access denied')`);console.log('PASS errors persist across closing their originating UI');
 await dismissAll();await emit({type:'transaction.state',tabId:'tab-1',pending:false,state:'committed'});assert.equal(await evaluate(`document.querySelector('.feedback-stack').textContent.includes('Transaction committed')`),false);await emit({type:'file.connectionBound',tabId:'tab-1',profileId:'UX_DEV'});await until(`document.querySelector('.feedback-notification[data-kind=info]')`);
 await evaluate('new Promise(r=>setTimeout(r,7400))');assert.equal(await evaluate(`Boolean(document.querySelector('.feedback-notification[data-kind=info]'))`),false);console.log('PASS short information notification auto dismisses');
 await click('[aria-label="Manage connections"]');await textClick('.connection-library-toolbar button','New connection');await input('.profile-fields input','Unsaved definition');await click('[aria-label="Close connection manager"]');await until(`document.querySelector('.feedback-dialog[role=alertdialog]')`);
 await key('Escape');assert.ok(await evaluate(`Boolean(document.querySelector('.connection-library'))`));assert.equal(await evaluate(`document.querySelector('.profile-fields input').value`),'Unsaved definition');
 await click('[aria-label="Close connection manager"]');await textClick('.feedback-dialog button','Discard changes');await until(`!document.querySelector('.connection-library')`);console.log('PASS explicit discard guard preserves unsaved form until confirmation');
 await click('[aria-label="Manage connections"]');await click('.connection-definition-row');await textClick('.connection-definition-actions button','Delete');await until(`document.querySelector('.feedback-dialog[role=alertdialog]')`);
 assert.equal(await evaluate(`__uxFixture.commands.filter(c=>c.command==='connection.delete').length`),0);await key('Escape');assert.equal(await evaluate(`__uxFixture.commands.filter(c=>c.command==='connection.delete').length`),0);await click('[aria-label="Close connection manager"]');
 await command('Manage workspace worksets');await until(`document.querySelector('.workset-open')`);await click('[aria-label="Rename workset Reports"]');await until(`document.querySelector('.feedback-dialog input[aria-label="Rename workset"]')`);await input('[aria-label="Rename workset"]','Renamed');await textClick('.feedback-dialog button','Save name');await until(`!document.querySelector('.feedback-dialog')`);assert.ok(await evaluate(`document.querySelector('.workset-list').textContent.includes('Renamed')`));
 await click('[aria-label="Update workset Renamed"]');await until(`document.querySelector('.feedback-dialog[role=alertdialog]')`);await key('Escape');await click('[aria-label="Close worksets"]');
 console.log('PASS workset naming and destructive/update confirmations are dialogs');
 await emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV'},serverVersion:'23'});await evaluate(`${editor}.setValue('CREATE TABLE test_feedback (id NUMBER);');${editor}.focus()`);
 await command('Preview / run SQL script');await until(`document.querySelector('.sql-script-dialog')`);await textClick('.sql-script-dialog button','Run script');await until(`document.querySelector('.feedback-dialog[role=alertdialog]')`);
 assert.equal(await evaluate(`__uxFixture.commands.filter(c=>c.command==='script.execute').length`),0);assert.match(await evaluate(`document.querySelector('.feedback-dialog').textContent`),/commits/);
 await key('Escape');assert.ok(await evaluate(`Boolean(document.querySelector('.sql-script-dialog'))`));assert.equal(await evaluate(`__uxFixture.commands.filter(c=>c.command==='script.execute').length`),0);
 await textClick('.sql-script-dialog button','Run script');await textClick('.feedback-dialog button','Run script');await until(`__uxFixture.commands.some(c=>c.command==='script.execute')`);
 const script=await evaluate(`__uxFixture.commands.find(c=>c.command==='script.execute')`);await emit({type:'script.completed',requestId:script.id,tabId:script.tabId,completed:0,failed:1});await until(`document.querySelector('.feedback-stack').textContent.includes('Script completed')`);
 await key('Escape');console.log('PASS DDL needs explicit confirmation before any execution and script errors remain visible');
 await emit({type:'result.exportProgress',requestId:'export-fixture',tabId:'tab-1',rowsWritten:100});await until(`document.querySelector('.feedback-stack').textContent.includes('Cancel export')`);assert.equal(await evaluate(`document.querySelectorAll('.feedback-notification[data-kind=progress]').length`),1);
 await click('[aria-label="New SQL file"]');const second=await evaluate(`document.querySelector('[data-editor-tab]:not([data-editor-tab="tab-1"])').dataset.editorTab`);
 await textClick('.feedback-notification button','Cancel export');const cancel=await evaluate(`__uxFixture.commands.filter(c=>c.command==='result.cancelExport').at(-1)`);assert.equal(cancel.tabId,'tab-1');assert.notEqual(cancel.tabId,second);
 await emit({type:'result.exportComplete',requestId:'export-fixture',tabId:'tab-1',rowsWritten:100});await until(`!document.querySelector('.feedback-notification[data-kind=progress]')`);await until(`document.querySelector('.feedback-stack').textContent.includes('Export completed')`);
 console.log('PASS export Cancel keeps origin ownership after switching SQL tabs');
 await emit({type:'result.exportComplete',requestId:'failed-export',tabId:second,success:false,message:'Export failed: access denied'});await until(`document.querySelector('.feedback-stack').textContent.includes('Export failed: access denied')`);
 assert.ok(await evaluate(`Array.from(document.querySelectorAll('.feedback-notification[data-kind=error]')).some(e=>e.textContent.includes('Export failed: access denied'))`));
 await dismissAll();await evaluate(`${editor}.setValue('SELECT 777 FROM dual;')`);
 await emit({type:'file.conflict',tabId:second,snapshot:{content:'SELECT 888 FROM dual;',version:'new-disk-version',missing:false}});
 await until(`document.querySelector('.feedback-stack').textContent.includes('File changed outside')`);await textClick('.feedback-notification button','Reload');await until(`document.querySelector('.feedback-dialog[role=alertdialog]')`);
 assert.equal(await evaluate(`${editor}.getValue()`),'SELECT 777 FROM dual;');await key('Escape');assert.equal(await evaluate(`${editor}.getValue()`),'SELECT 777 FROM dual;');
 await textClick('.feedback-notification button','Reload');await textClick('.feedback-dialog button','Reload from disk');await until(`${editor}.getValue()==='SELECT 888 FROM dual;'`);await until(`!document.querySelector('.feedback-notification .feedback-actions')`);
 console.log('PASS failed export severity and external file reload only after explicit discard confirmation');
 assert.deepEqual(errors,[]);
}finally{if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});socket.close()}

