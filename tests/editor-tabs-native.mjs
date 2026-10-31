// Isolated tab-strip harness inside the actual WebView2 renderer. It never
// opens SQL tabs or touches the running app's documents, sessions or settings.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import {productionStyles} from './productionStyles.mjs';

const targets=await(await fetch(`${process.argv[2]||'http://127.0.0.1:9337'}/json/list`)).json();
const target=targets.find(item=>item.type==='page'&&item.url.startsWith('https://fbsdb.local/'));
assert.ok(target,'A running native fbsDB page is required');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
let sequence=0;const pending=new Map();
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const action=pending.get(message.id);pending.delete(message.id);message.error?action?.reject(message.error):action?.resolve(message.result)}});
function evaluate(expression){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))}).then(result=>{if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value})}
const bundled=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {EditorTabs} from './src/EditorTabs.jsx';
const files=Array.from({length:40},(_,i)=>({id:'tab-'+i,name:i%3===0?'a_very_long_reporting_query_'+i+'.sql':'query_'+i+'.sql',path:'D:/SQL/queries/query_'+i+'.sql',dirty:i%7===0}));
function Harness(){const[tabs,setTabs]=useState(files),[active,setActive]=useState('tab-0'),[theme,setTheme]=useState('default');
useEffect(()=>{window.tabHarness={theme:setTheme,select:setActive,one:()=>{setTabs([files[0]]);setActive(files[0].id)}}},[]);
return <main className="desktop-shell" data-theme={theme}><section className="editor-workspace"><EditorTabs tabs={tabs} activeId={active} onActivate={setActive} onClose={id=>{setTabs(current=>current.filter(tab=>tab.id!==id));if(id===active)setActive(tabs.find(tab=>tab.id!==id)?.id)}} onNew={()=>{const id='new-'+tabs.length;setTabs(current=>[...current,{id,name:'New.sql',dirty:false}]);setActive(id)}} onSave={()=>{window.saved=true}}/><div data-editor-surface style={{flex:1,minHeight:0}}>Editor</div></section></main>}
createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
const css=productionStyles()+'\nhtml,body,#root{min-width:0!important;width:100%;height:100%;margin:0}#root .desktop-shell{min-width:0;width:100%;height:100%}#root .editor-workspace{min-width:0;width:100%;height:100%}';
const html=`<!doctype html><style>${css}</style><div id="root"></div><script>${bundled.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`;
const frame='document.getElementById("editor-tabs-qa-frame")';
const inner=expression=>evaluate(`(()=>{const frame=${frame};return frame.contentWindow.eval(${JSON.stringify(expression)})})()`);
async function waitFor(expression){for(let i=0;i<80;i++){if(await inner(expression))return;await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Harness did not settle: '+expression)}
const click=selector=>inner(`document.querySelector(${JSON.stringify(selector)}).click()`);
const snapshot=()=>inner(`(()=>{const strip=document.querySelector('.compact-editor-tabs'),track=document.querySelector('.editor-tabs-track'),actions=document.querySelector('.editor-tabs-actions'),active=document.querySelector('.file-tab.active'),visible=track.getBoundingClientRect(),tab=active?.getBoundingClientRect();return {height:strip.getBoundingClientRect().height,width:strip.getBoundingClientRect().width,pageWidth:innerWidth,tabCount:document.querySelectorAll('.file-tab').length,activeId:active?.dataset.editorTab,activeVisible:!!tab&&tab.left>=visible.left-1&&tab.right<=visible.right+1,scrollbar:getComputedStyle(track).scrollbarWidth,scrollHeight:track.scrollHeight,clientHeight:track.clientHeight,actionsX:actions.getBoundingClientRect().x,actionsRight:actions.getBoundingClientRect().right,scrollLeft:track.scrollLeft,maxTabWidth:Math.max(...[...document.querySelectorAll('.file-tab')].map(e=>e.getBoundingClientRect().width))}})()`);
try{
  await evaluate(`(()=>{document.getElementById('editor-tabs-qa-frame')?.remove();const frame=document.createElement('iframe');frame.id='editor-tabs-qa-frame';frame.style.cssText='position:fixed;left:-10000px;top:0;width:900px;height:260px;border:0;pointer-events:none';frame.srcdoc=${JSON.stringify(html)};document.body.appendChild(frame)})()`);
  await waitFor(`!!window.tabHarness&&document.querySelectorAll('.file-tab').length===40&&!!document.querySelector('[aria-label="Scroll tabs right"]')`);
  let state=await snapshot();assert.equal(state.height,28);assert.equal(state.width,state.pageWidth);assert.equal(state.activeVisible,true);assert.equal(state.scrollbar,'none');assert.ok(state.scrollHeight<=state.clientHeight);assert.ok(state.maxTabWidth<=176);
  const fixedX=state.actionsX;
  await click('[aria-label="Open editors (40)"]');
  assert.equal(await inner(`document.querySelectorAll('.editor-tabs-menu [role="menuitem"]').length`),40);
  assert.equal(await inner(`document.querySelector('.editor-tabs-menu').getBoundingClientRect().bottom<=document.querySelector('.editor-workspace').getBoundingClientRect().bottom`),true);
  await inner(`document.querySelectorAll('.editor-tabs-menu [role="menuitem"]')[39].click()`);
  await waitFor(`document.querySelector('.file-tab.active').dataset.editorTab==='tab-39'`);state=await snapshot();assert.equal(state.activeVisible,true);assert.equal(state.actionsX,fixedX);
  console.log('PASS 40 compact tabs, hidden scrollbar, fixed controls and overflow-list navigation');
  await click('[aria-label="New SQL file"]');await waitFor(`document.querySelectorAll('.file-tab').length===41`);state=await snapshot();assert.equal(state.activeVisible,true);assert.equal(state.activeId,'new-40');
  console.log('PASS newly opened tab remains visible');
  await evaluate(`${frame}.style.width='360px'`);await waitFor(`innerWidth===360&&document.querySelector('.file-tab.active').getBoundingClientRect().right<=document.querySelector('.editor-tabs-track').getBoundingClientRect().right+1`);state=await snapshot();assert.equal(state.width,360);assert.equal(state.height,28);assert.ok(state.actionsRight<=360);
  for(const theme of ['default','dark','light']){await inner(`window.tabHarness.theme(${JSON.stringify(theme)})`);await waitFor(`document.querySelector('main').dataset.theme===${JSON.stringify(theme)}`);state=await snapshot();assert.equal(state.height,28);assert.equal(state.activeVisible,true)}
  console.log('PASS narrow editor and all themes retain the same compact geometry');
  await click('[aria-label="Close New.sql"]');await waitFor(`document.querySelectorAll('.file-tab').length===40`);state=await snapshot();assert.equal(state.activeVisible,true);
  await inner(`window.tabHarness.one()`);await waitFor(`document.querySelectorAll('.file-tab').length===1&&!document.querySelector('[aria-label="Scroll tabs right"]')`);state=await snapshot();assert.equal(state.height,28);assert.equal(state.activeVisible,true);
  console.log('PASS closing tabs and returning to a single tab preserves layout');
}finally{await evaluate(`${frame}?.remove()`);socket.close()}
