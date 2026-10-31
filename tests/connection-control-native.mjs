// Native WebView2: orbital Connect control states, production CSS, focus/contrast,
// compact widths, reduced motion and a real pointer click. No screenshots or Oracle operations.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';
import {productionStyles} from './productionStyles.mjs';
import palettes from '../src/themePalettes.json' with {type:'json'};
const endpoint=process.argv[2]||'http://127.0.0.1:9343';
let target;for(let i=0;i<100;i++){try{target=(await(await fetch(endpoint+'/json/list')).json()).find(t=>t.type==='page'&&t.url.startsWith('https://fbsdb.local/'));if(target)break}catch{}await new Promise(r=>setTimeout(r,100))}
assert.ok(target,'Native fbsDB WebView2 required');
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const inner=code=>evaluate(`document.getElementById('theme-qa').contentWindow.eval(${JSON.stringify(code)})`);
const settle=()=>inner('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))).then(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))))');
async function forceControls(){
 const {root}=await call('DOM.getDocument',{depth:-1,pierce:true});
 const find=n=>n.nodeName==='IFRAME'&&n.attributes?.includes('theme-qa')?n:(n.children||[]).map(find).find(Boolean);
 const doc=find(root)?.contentDocument;assert.ok(doc,'Fixture document');
 const {nodeIds}=await call('DOM.querySelectorAll',{nodeId:doc.nodeId,selector:'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a,[tabindex="0"]'});
 await Promise.all(nodeIds.map(nodeId=>call('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover','focus-visible']})));
}
async function wait(code){for(let i=0;i<100;i++){if(await inner(`Boolean(${code})`))return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out '+code)}
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ConnectionControl}from'./src/ConnectionControl.jsx';
 const variants={disconnected:{connected:false},connecting:{connecting:true,connectingProfile:'Connecting reporting service'},connected:{connected:true},pending:{connected:true,transactionPending:true},busyPending:{connected:true,executing:true,transactionPending:true,stage:'Waiting for first rows'},inactive:{connected:true,inactive:true},prod:{connected:true},disabled:{disabled:true},open:{connected:true,open:true},analysis:{connected:true,readOnlyAnalysis:true,transactionPending:true}};
 function Preview(){const[config,setConfig]=useState({theme:'default',variant:'disconnected',width:360,motion:false});window.controlPreview={show:setConfig,clicks:window.controlPreview?.clicks||[]};const options=variants[config.variant];return <main className="desktop-shell theme-scope" data-theme={config.theme} data-reduce-motion={String(config.motion)} style={{width:config.width,height:80,minWidth:0,display:'block'}}><section className="editor-workspace" style={{width:config.width,minWidth:0}}><div className="commandbar"><div className="command-right"><ConnectionControl key={JSON.stringify(config)} {...options} profile={{id:'QA',name:'Reporting and reconciliation — long profile name',groups:['Reporting'],env:config.variant==='prod'||config.variant==='busyPending'?'PROD':'DEV'}} context={{schema:'REPORTING',container:'FINANCE_PDB'}} onOpen={()=>window.controlPreview.clicks.push(config.variant)}/></div></div></section></main>}
 createRoot(document.getElementById('root')).render(<Preview/>);
 `},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
const html=`<!doctype html><style>${productionStyles()}\nhtml,body,#root{margin:0;min-width:0!important;width:100%;height:100%}</style><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`;
const {themeContrastAudit:audit}=await import('./themeContrastAudit.mjs');
const variants=['disconnected','connecting','connected','pending','busyPending','inactive','prod','disabled','open','analysis'];
const report=[];
try{
 await call('DOM.enable');await call('CSS.enable');
 await evaluate(`(()=>{const frame=document.createElement('iframe');frame.id='theme-qa';frame.style.cssText='position:fixed;left:-10000px;top:0;width:800px;height:300px;border:0';frame.srcdoc=${JSON.stringify(html)};document.body.appendChild(frame)})()`);await wait('window.controlPreview');
 for(const theme of ['default','dark','light'])for(const variant of variants)for(const width of [220,360,700]){
  await inner(`controlPreview.show(${JSON.stringify({theme,variant,width,motion:false})})`);await settle();
  const geometry=await inner(`(()=>{const button=document.querySelector('.connection-control'),r=button.getBoundingClientRect(),mark=document.querySelector('.connection-control-mark'),summary=document.querySelector('.connection-control-summary'),s=getComputedStyle(button);return {height:r.height,width:r.width,left:r.left,right:r.right,parent:button.parentElement.getBoundingClientRect().toJSON(),inside:r.left>=0&&r.right<=${width}+1,radius:s.borderRadius,markDivider:getComputedStyle(mark).borderRightWidth,handleDivider:getComputedStyle(document.querySelector('.connection-control-chevron')).borderLeftWidth,summary:summary.getAttribute('aria-label'),description:button.getAttribute('aria-description'),pending:button.dataset.pending==='true',busy:button.getAttribute('aria-busy'),animation:getComputedStyle(document.querySelector('.connection-orbit-track')).animationName,summaryHidden:summary.classList.contains('sr-only'),environment:document.querySelector('.connection-control-environment')?.textContent}})()`);
  assert.equal(geometry.height,30);assert.ok(geometry.width<=310&&geometry.inside,JSON.stringify({theme,variant,width,geometry}));assert.equal(geometry.radius,'999px');assert.equal(geometry.markDivider,'0px');assert.equal(geometry.handleDivider,'0px');assert.equal(geometry.description,geometry.summary);
  assert.equal(geometry.summaryHidden,true);
  if(variant==='connecting')assert.equal(geometry.busy,'true');
  if(['pending','busyPending'].includes(variant)){assert.equal(geometry.pending,true);assert.ok(geometry.summary.includes('Transaction pending'))}
  if(variant==='prod')assert.equal(geometry.environment,'Reporting');
  if(variant==='analysis'){assert.equal(geometry.pending,false);assert.ok(geometry.summary.includes('Read-only analysis'))}
  if(['connecting','busyPending'].includes(variant))assert.equal(geometry.animation,'connection-orbit-spin');
  const normal=await inner(audit);assert.deepEqual(normal.failures,[],JSON.stringify({theme,variant,width,failures:normal.failures}));await forceControls();const focused=await inner(audit);assert.deepEqual(focused.failures,[],JSON.stringify({theme,variant,width,failures:focused.failures}));
  report.push({theme,variant,width,geometry});
 }
 for(const reduced of ['application','system']){
  if(reduced==='system')await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await inner(`controlPreview.show({theme:'default',variant:'connecting',width:360,motion:${reduced==='application'}})`);await settle();assert.equal(await inner(`getComputedStyle(document.querySelector('.connection-orbit-track')).animationName`),'none');
 }
 await call('Emulation.setEmulatedMedia',{features:[]});
 await evaluate(`document.getElementById('theme-qa').remove()`);
 for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('.connection-control')`))break;await new Promise(resolve=>setTimeout(resolve,50))}
 const point=await evaluate(`(()=>{const r=document.querySelector('.connection-control').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 assert.ok(await evaluate(`!!document.querySelector('[role="dialog"][aria-label="Change connection"]')`));assert.equal(await evaluate(`document.querySelector('.connection-control').getAttribute('aria-expanded')`),'true');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 assert.equal(await evaluate(`document.querySelector('.connection-control').getAttribute('aria-expanded')`),'false');
 writeFileSync('.artifacts/connection-control-native-report.json',JSON.stringify({success:true,cases:report},null,2));
 console.log('PASS orbital connection capsule: 3 themes × 10 states × 3 widths, contrast/focus, pending/PROD semantics, reduced motion and real desktop picker click');
}finally{await call('Emulation.setEmulatedMedia',{features:[]}).catch(()=>{});await evaluate(`document.getElementById('theme-qa')?.remove()`).catch(()=>{});socket.close()}
