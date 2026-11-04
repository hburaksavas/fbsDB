// Native renderer verification with a deterministic metadata boundary. Live
// version checks and DDL are covered separately by OracleLiveRegression.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {connectNativePage} from './nativeCdp.mjs';

const [endpoint,directory]=process.argv.slice(2),cdp=await connectNativePage(endpoint);
let failure;
try{
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {SourceCompileDialog} from './src/SourceCompileDialog.jsx';
    import {prepareSourceCompilation} from './src/sourceCompilation.js';
    const container=document.createElement('div');container.id='source-compile-qa';container.className='desktop-shell';container.dataset.theme='default';document.body.append(container);
    const root=createRoot(container),qa=window.__sourceCompileQA={compiled:0,closed:0,baseline:0,valid:true};
    const source={name:'demo.prc',content:'CREATE OR REPLACE PROCEDURE demo AS BEGIN local_call; END;',sourceBaseline:{owner:'APP',name:'DEMO',type:'PROCEDURE',context:'TEST/EDITION',profileId:'DEV',version:'v1'}};
    const prepared=prepareSourceCompilation(source);
    qa.render=()=>root.render(<SourceCompileDialog document={source} prepared={prepared} tabId="qa" profileId="DEV" theme="vs-dark" valid={qa.valid} transactionPending={false} onClose={()=>qa.closed++} onBaseline={()=>qa.baseline++} onCompile={()=>qa.compiled++}/>);
    qa.cleanup=()=>{root.unmount();container.remove()};qa.render();
  `},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty','.ttf':'empty'},plugins:[{name:'review-fixture',setup(build){build.onResolve({filter:/[?]worker$/},()=>({path:'worker',namespace:'monaco-worker'}));build.onLoad({filter:/.*/,namespace:'monaco-worker'},()=>({contents:`export default class{constructor(){return new Worker(URL.createObjectURL(new Blob([''],{type:'text/javascript'})))}}`,loader:'js'}));build.onResolve({filter:/nativeBridge(?:\.js)?$/},()=>({path:'review-fixture',namespace:'qa'}));build.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`
    const listeners=new Set();export const isNativeHost=false;
    export const subscribeNativeMessages=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};
    export function sendNativeCommand(command,payload){if(command!=='source.review')throw Error('Unexpected command in source fixture');setTimeout(()=>{const reply={type:'source.review',requestId:'qa-review',review:{reviewId:'qa-token',sql:payload.sql,reviewedAt:new Date().toISOString(),snapshot:{owner:'APP',name:'DEMO',type:'PROCEDURE',source:'PROCEDURE demo AS BEGIN server_call; END;',exists:true,version:'v2',context:'TEST/EDITION',profileId:'DEV'}}};listeners.forEach(listener=>listener(reply))},20);return 'qa-review'}
    export const setNativeTabId=()=>{};export const getNativeTabId=()=> 'qa';export const announceUiReady=()=>{};
  `,loader:'js'}))}}]});
  await cdp.evaluate(bundle.outputFiles[0].text);
  await cdp.until(`window.__sourceCompileQA?.baseline===1&&document.querySelector('#source-compile-qa .monaco-diff-editor')`,'Native Monaco source comparison',45000);
  assert.equal(await cdp.evaluate(`document.querySelector('#source-compile-qa .source-compile-conflict')?.getAttribute('role')`),'alert');
  const button=`[...document.querySelectorAll('#source-compile-qa button')].find(button=>button.textContent==='Compile reviewed source')`;
  assert.equal(await cdp.evaluate(`${button}.disabled`),true);
  await cdp.click('#source-compile-qa input[type="checkbox"]');
  assert.equal(await cdp.evaluate(`${button}.disabled`),false);
  await cdp.evaluate('window.__sourceCompileQA.valid=false;window.__sourceCompileQA.render()');await cdp.frame();
  assert.equal(await cdp.evaluate(`${button}.disabled`),true);
  assert.equal(await cdp.evaluate('window.__sourceCompileQA.compiled'),0);
  await cdp.evaluate('window.__sourceCompileQA.valid=true;window.__sourceCompileQA.render()');await cdp.frame();
  await cdp.evaluate(`${button}.click()`);
  assert.equal(await cdp.evaluate('window.__sourceCompileQA.compiled'),1);
  console.log('PASS native source review: Monaco diff, server-change warning, explicit confirmation and stale-editor guard');
}catch(error){failure=error;console.error(error.stack)}finally{
  await cdp.evaluate('window.__sourceCompileQA?.cleanup()').catch(()=>{});cdp.close();
  await writeFile(path.join(directory,'source-compile-report.json'),JSON.stringify({status:failure?'failed':'passed',metadata:'deterministic fixture; no DDL sent',error:failure?.message},null,2));
}
if(failure)process.exitCode=1;
