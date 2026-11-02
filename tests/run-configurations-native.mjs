// Real native configuration storage, with execution captured at the UI boundary.
// Typed Oracle execution is exercised by OracleLiveRegression.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {connectNativePage} from './nativeCdp.mjs';

const [endpoint,directory]=process.argv.slice(2),root=path.join(path.resolve(directory),'files'),cdp=await connectNativePage(endpoint);
let failure;
async function fill(selector,value){await cdp.evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Missing call input');const prototype=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await cdp.frame()}
try{
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {RunConfigurationsDialog} from './src/RunConfigurationsDialog.jsx';
    import {sourceRunConfigurations} from './src/runConfigurations.js';
    const container=document.createElement('div');container.id='run-configurations-qa';container.className='desktop-shell';container.dataset.theme='default';document.body.append(container);const root=createRoot(container);
    const signature=sourceRunConfigurations({name:'billing.pks',content:'CREATE PACKAGE billing AS PROCEDURE pay(p_secret VARCHAR2, p_result OUT NUMBER); END;'},undefined,'APP').configurations;
    const qa=window.__runConfigurationsQA={runs:[],visible:true,signatures:signature,profile:'DEV',connected:true};
    qa.render=()=>root.render(qa.visible?<RunConfigurationsDialog root={${JSON.stringify(root)}} tabId="qa-runs" signatures={qa.signatures} signatureErrors={[]} profileId={qa.profile} autoCommit={false} connected={qa.connected} busy={false} status="Ready" output="" onRun={(sql,parameters)=>qa.runs.push({sql,parameters})} onClose={()=>{qa.visible=false;qa.render()}}/>:null);
    qa.cleanup=()=>{root.unmount();container.remove()};qa.render();
  `},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic'});
  await cdp.evaluate(bundle.outputFiles[0].text);await cdp.until(`document.querySelector('#run-configurations-qa [aria-label="Value P_SECRET"]')`,'Generated call form');
  assert.equal(await cdp.evaluate(`document.querySelector('#run-configurations-qa [aria-label="Value P_SECRET"]').type`),'password');
  await fill('#run-configurations-qa [aria-label="Value P_SECRET"]','runtime-only-private');
  await cdp.textClick('#run-configurations-qa button','Save call definition');
  await cdp.until(`document.querySelector('#run-configurations-qa').textContent.includes('definitions saved without values')`,'Saved definition');
  const folder=path.join(root,'.fbsdb','runs'),files=await readdir(folder);
  assert.equal(files.filter(file=>file.endsWith('.json')).length,1);
  const text=await readFile(path.join(folder,files.find(file=>file.endsWith('.json'))),'utf8');
  assert.ok(!text.includes('runtime-only-private'));assert.equal(await cdp.evaluate('window.__runConfigurationsQA.runs.length'),0);
  await cdp.textClick('#run-configurations-qa button','Run call');
  const runs=await cdp.evaluate('window.__runConfigurationsQA.runs');assert.equal(runs.length,1);assert.equal(runs[0].parameters[0].value,'runtime-only-private');assert.equal(runs[0].parameters[1].direction,'OUT');
  await cdp.textClick('#run-configurations-qa button','Close');
  await cdp.evaluate('window.__runConfigurationsQA.signatures=[];window.__runConfigurationsQA.visible=true;window.__runConfigurationsQA.render()');
  await cdp.until(`document.querySelectorAll('#run-configurations-qa [aria-label="Saved calls"] option').length===2`,'Reloaded saved calls');
  const id=JSON.parse(text).id;await fill('#run-configurations-qa [aria-label="Saved calls"]',id);
  assert.equal(await cdp.evaluate(`document.querySelector('#run-configurations-qa [aria-label="Value P_SECRET"]').value`),'');
  assert.equal(await cdp.evaluate('window.__runConfigurationsQA.runs.length'),1);
  await cdp.evaluate('window.__runConfigurationsQA.connected=false;window.__runConfigurationsQA.render()');await cdp.frame();
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('#run-configurations-qa button')].find(button=>button.textContent==='Run call').disabled`),true);
  console.log('PASS native run configurations: generated form, real definition-only save/reload, explicit Run, OUT mode and disconnected guard');
}catch(error){failure=error;console.error(error.stack)}finally{
  await cdp.evaluate('window.__runConfigurationsQA?.cleanup()').catch(()=>{});cdp.close();
  await writeFile(path.join(directory,'run-configurations-report.json'),JSON.stringify({status:failure?'failed':'passed',execution:'captured UI callback; no SQL sent',storage:'real native handlers',error:failure?.message},null,2));
}
if(failure)process.exitCode=1;
