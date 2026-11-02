// UI boundary test: real native renderer/Monaco, simulated script and metadata replies.
// No database or file commands reach the host.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connectNativePage} from './nativeCdp.mjs';
import {nativeUxFixture} from './nativeUxFixture.mjs';
const [endpoint,directory]=process.argv.slice(2),cdp=await connectNativePage(endpoint),quote=JSON.stringify;
const editor=`window.monaco?.editor.getEditors().find(editor=>document.contains(editor.getDomNode()))`;
let installed,failure;
try {
 const fixture=nativeUxFixture+`;(()=>{const post=chrome.webview.postMessage.bind(chrome.webview);chrome.webview.postMessage=value=>{post(value);const m=JSON.parse(value);if(m.command==='source.review')setTimeout(()=>__uxFixture.emit({type:'source.review',tabId:m.tabId,requestId:m.id,review:{reviewId:'token-'+m.id,sql:m.payload.sql,reviewedAt:new Date().toISOString(),snapshot:{owner:'APP',name:'QA_ROUTINE',type:'PROCEDURE',exists:true,source:'PROCEDURE qa_routine AS BEGIN server_call; END;',version:m.id,context:'DEV/ORA$BASE',profileId:'UX_DEV'}}}),10)}})();`;
 installed=await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:fixture});await cdp.call('Page.reload');
 await cdp.until(`window.__uxFixture&&${editor}&&document.querySelector('.app-status')?.textContent.includes('UX fixture')`,'Fixture start',60000);
 await cdp.evaluate(`__uxFixture.emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV',name:'UX Development',env:'DEV'},serverVersion:'23'})`);
 const source='CREATE OR REPLACE PROCEDURE one AS BEGIN NULL; END;\n/\nCREATE OR REPLACE PROCEDURE two AS BEGIN NULL; END;\n/';
 await cdp.evaluate(`${editor}.setValue(${quote(source)})`);
 await cdp.textClick('.ide-file-menu>button','Run');await cdp.textClick('[role="menu"][aria-label="Run"] button','Preview / run script');
 await cdp.until(`document.querySelector('.sql-script-dialog')`,'Script preview');
 await cdp.textClick('.sql-script-dialog footer button','Run script');await cdp.until(`document.querySelector('[role="alertdialog"]')`);await cdp.textClick('[role="alertdialog"] button','Run script');
 await cdp.until(`__uxFixture.commands.some(m=>m.command==='script.execute')`,'Explicit script start');
 const run=await cdp.evaluate(`__uxFixture.commands.find(m=>m.command==='script.execute')`);
 assert.equal(run.payload.statements.length,2);
 for(let index=0;index<2;index++){
  if(index===0)await cdp.evaluate(`__uxFixture.emit({type:'script.started',tabId:'tab-1',requestId:${quote(run.id)},count:2})`);
  await cdp.evaluate(`__uxFixture.emit({type:'script.sourceReviewRequired',tabId:'tab-1',requestId:${quote(run.id)},index:${index},sql:${quote(run.payload.statements[index].sql)},offset:${run.payload.statements[index].start},reviewNonce:'nonce-${index}',transactionPending:false})`);
  await cdp.until(`document.querySelector('.source-compile-dialog .monaco-diff-editor')`,'Per-object Monaco review',45000);
  const button=`[...document.querySelectorAll('.source-compile-dialog button')].find(button=>button.textContent==='Compile this script source')`;
  await cdp.until(`document.querySelector('.source-compile-dialog input[type="checkbox"]')`);
  assert.equal(await cdp.evaluate(`${button}.disabled`),true);
  assert.match(await cdp.evaluate(`document.querySelector('.source-compile-dialog').textContent`),new RegExp('statement '+(index+1)));
  assert.equal(await cdp.evaluate(`__uxFixture.commands.filter(m=>m.command==='script.sourceReviewed').length`),index);
  await cdp.click('.source-compile-dialog input[type="checkbox"]');
  if(index===0){
   await cdp.evaluate(`${editor}.setValue(${quote(source+'\n-- changed during review')})`);await cdp.frame();
   assert.equal(await cdp.evaluate(`${button}.disabled`),true);
   assert.equal(await cdp.evaluate(`__uxFixture.commands.some(m=>m.command==='script.sourceReviewed')`),false);
   await cdp.evaluate(`${editor}.setValue(${quote(source)})`);await cdp.frame();
  }
  await cdp.evaluate(`${button}.click()`);
  await cdp.until(`__uxFixture.commands.filter(m=>m.command==='script.sourceReviewed').length===${index+1}`,'Bound acknowledgement');
  const approval=await cdp.evaluate(`__uxFixture.commands.filter(m=>m.command==='script.sourceReviewed').at(-1)`);
  assert.equal(approval.payload.scriptRequestId,run.id);assert.equal(approval.payload.index,index);assert.equal(approval.payload.reviewNonce,'nonce-'+index);
  await cdp.evaluate(`__uxFixture.emit({type:'script.reviewAccepted',requestId:${quote(approval.id)},tabId:'tab-1',accepted:true})`);
 }
 await cdp.evaluate(`__uxFixture.emit({type:'script.completed',tabId:'tab-1',requestId:${quote(run.id)},completed:2,failed:0,cancelled:false,transactionPending:false})`);
 await cdp.until(`document.querySelector('.sql-script-dialog footer').textContent.includes('2 completed')`,'Completion');
 await cdp.textClick('.sql-script-dialog footer button','Run script');await cdp.until(`document.querySelector('[role="alertdialog"]')`);await cdp.textClick('[role="alertdialog"] button','Run script');
 await cdp.until(`__uxFixture.commands.filter(m=>m.command==='script.execute').length===2`);
 const second=await cdp.evaluate(`__uxFixture.commands.filter(m=>m.command==='script.execute').at(-1)`);
 await cdp.evaluate(`__uxFixture.emit({type:'script.started',tabId:'tab-1',requestId:${quote(second.id)},count:2});__uxFixture.emit({type:'script.sourceReviewRequired',tabId:'tab-1',requestId:${quote(second.id)},index:0,sql:${quote(run.payload.statements[0].sql)},offset:0,reviewNonce:'cancel-nonce',transactionPending:false})`);
 await cdp.until(`document.querySelector('.source-compile-dialog')`);
 await cdp.textClick('.source-compile-dialog footer button','Cancel');
 await cdp.until(`__uxFixture.commands.some(m=>m.command==='sql.cancel'&&m.tabId==='tab-1')`,'Cancel remaining script');
 assert.equal(await cdp.evaluate(`__uxFixture.commands.filter(m=>m.command==='script.sourceReviewed').length`),2);
 await cdp.evaluate(`__uxFixture.emit({type:'script.completed',tabId:'tab-1',requestId:${quote(second.id)},completed:0,failed:0,cancelled:true,transactionPending:false})`);
 console.log('PASS multi-source script UI: two independent Monaco comparisons, unchecked approval gates and run/step/nonce-bound acknowledgements, changed-text blocking and cancellation');
}catch(error){failure=error;console.error(error.stack)}finally{
 await writeFile(path.join(directory,'script-source-report.json'),JSON.stringify({status:failure?'failed':'passed',boundary:'real native renderer; simulated script/metadata; no Oracle execution',error:failure?.message},null,2));
 if(installed)await cdp.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:installed.identifier}).catch(()=>{});cdp.close();
}
if(failure)process.exitCode=1;
