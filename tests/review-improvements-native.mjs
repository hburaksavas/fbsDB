// Isolated native UI fixture: no Oracle or workspace file commands are forwarded.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connectNativePage} from './nativeCdp.mjs';
import {nativeUxFixture} from './nativeUxFixture.mjs';
const [endpoint,root]=process.argv.slice(2),cdp=await connectNativePage(endpoint),checks=[];
const editor=`window.monaco?.editor.getEditors().find(e=>document.contains(e.getDomNode()))`;
let installed,failure;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name)}
try {
 const source=nativeUxFixture+`;(()=>{
 localStorage.setItem('fbsdb.settings.v2',JSON.stringify({version:2,migrations:{legacyPreferences:1,dockLayout:2},workspaces:{},user:{'privacy.historyLimit':10,'privacy.historyDays':1,'privacy.excludedProfiles':'UX_PROD'}}));
 localStorage.setItem('fbsdb.queryHistory',JSON.stringify([{id:'current',sql:'SELECT current_row FROM dual',profile:'UX_DEV',status:'Succeeded',startedAt:Date.now(),detail:'Current'},{id:'old',sql:'SELECT expired_row FROM dual',profile:'UX_DEV',status:'Succeeded',startedAt:1,detail:'Old'},{id:'excluded',sql:'SELECT private_row FROM dual',profile:'UX_PROD',status:'Succeeded',startedAt:Date.now(),detail:'Excluded'}]));
 const post=chrome.webview.postMessage.bind(chrome.webview);
 chrome.webview.postMessage=value=>{post(value);const m=JSON.parse(value);
 if(m.command==='workspace.tools.list')setTimeout(()=>window.__uxFixture.emit({type:'workspace.tools.list',root:m.payload.root,tabId:m.tabId,requestId:m.id,catalog:{tools:[{version:1,id:'a'.repeat(32),name:'Shared lookup',sql:'SELECT :ID FROM dual',fields:[],columns:[],description:'Lookup description',usage:'Supply :ID',changeNotes:'Initial definition',revision:3}],errors:[]}}),10);
 };
 window.__reviewErrors=[];window.addEventListener('error',e=>window.__reviewErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__reviewErrors.push(String(e.reason)));
 })();`;
 installed=await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source});await cdp.call('Page.reload');
 await cdp.until(`window.__uxFixture && ${editor} && document.querySelector('.app-status')?.textContent.includes('UX fixture')`,'Fixture ready',60000);
 await check('history UI reflects configured count and removes expired/excluded SQL',async()=>{
  await cdp.click('[aria-label="History"]');await cdp.until(`document.getElementById('query-history-title')`);
  const text=await cdp.evaluate(`document.querySelector('.query-history-modal').textContent`);
  assert.match(text,/Up to 10/);assert.match(text,/current_row/);assert.doesNotMatch(text,/expired_row|private_row|of 50/);
  await cdp.key('Escape');
 });
 await cdp.evaluate(`window.__uxFixture.emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV',name:'UX Development'},serverVersion:'23'})`);
 await cdp.until(`document.querySelector('.connection-control-summary')?.textContent.includes('DEV_PDB')`);
 await check('single DDL confirmation shows exact SQL and Cancel sends no execution',async()=>{
  await cdp.evaluate(`${editor}.setValue('CREATE TABLE REVIEW_TEST (N NUMBER)');${editor}.focus()`);await cdp.key('Enter',2);
  await cdp.until(`document.querySelector('[role="alertdialog"]')?.textContent.includes('Run DDL statement?')`);
  assert.match(await cdp.evaluate(`document.querySelector('[role="alertdialog"]').textContent`),/CREATE TABLE REVIEW_TEST/);
  await cdp.textClick('[role="alertdialog"] button','Cancel');
  assert.equal(await cdp.evaluate(`window.__uxFixture.commands.filter(c=>c.command==='sql.execute').length`),0);
 });
 await check('confirmed DDL sends once and pending transaction blocks the next DDL',async()=>{
  await cdp.evaluate(`${editor}.focus()`);await cdp.key('Enter',2);await cdp.until(`document.querySelector('[role="alertdialog"]')`);
  await cdp.textClick('[role="alertdialog"] button','Run DDL');await cdp.until(`window.__uxFixture.commands.some(c=>c.command==='sql.execute')`);
  await cdp.evaluate(`(()=>{const request=window.__uxFixture.commands.filter(c=>c.command==='sql.execute').at(-1);window.__uxFixture.emit({type:'sql.result',tabId:request.tabId,requestId:request.id,columns:[],rows:[],rowsAffected:0,elapsedMs:1,transactionPending:true,output:[]})})()`);
  await cdp.until(`document.querySelector('[aria-label="Commit"]')?.disabled===false`);
  await cdp.evaluate(`${editor}.focus()`);await cdp.key('Enter',2);
  assert.equal(await cdp.evaluate(`window.__uxFixture.commands.filter(c=>c.command==='sql.execute').length`),1);
  assert.equal(await cdp.evaluate(`!!document.querySelector('[role="alertdialog"]')`),false);
 });
 await check('shared mini tool description, example and revision notes render',async()=>{
  await cdp.click('[aria-label="SQL mini tools"]');await cdp.until(`document.querySelector('.mini-tool-item')`);
  await cdp.textClick('.mini-tool-item','Shared lookup');
  const text=await cdp.evaluate(`document.querySelector('.mini-tool-content').textContent`);assert.match(text,/Revision 3/);
  const values=await cdp.evaluate(`[...document.querySelectorAll('.mini-tool-content textarea')].map(e=>e.value)`);
  assert.ok(values.includes('Lookup description'));assert.ok(values.includes('Supply :ID'));assert.ok(values.includes('Initial definition'));
  await cdp.key('Escape');
 });
 assert.deepEqual(await cdp.evaluate('window.__reviewErrors'),[]);
} catch(error){failure=error;console.error(error.stack)}
finally {
 await writeFile(path.join(root,'review-improvements.json'),JSON.stringify({status:failure?'failed':'passed',coverage:'real WebView2, simulated replies, database and file operations blocked',checks,error:failure?.message},null,2));
 if(installed)await cdp.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:installed.identifier}).catch(()=>{});cdp.close();
}
if(failure)process.exitCode=1;

