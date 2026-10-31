// Isolated ResultsGrid fixture in the native WebView2 renderer. No screenshots,
// database calls, user document changes or writes to the system clipboard.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {productionStyles} from './productionStyles.mjs';

const endpoint=process.argv[2]||'http://127.0.0.1:9338';
let targets;
for(let i=0;i<50;i++){try{targets=await(await fetch(`${endpoint}/json/list`)).json();if(targets.some(t=>t.type==='page'&&t.url.startsWith('https://fbsdb.local/')))break}catch{}await new Promise(r=>setTimeout(r,100))}
const target=targets?.find(t=>t.type==='page'&&t.url.startsWith('https://fbsdb.local/'));assert.ok(target,'A native fbsDB WebView2 is required');
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(!m.id)return;const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result)});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
const frame=`document.getElementById('column-menu-qa')`;
const inner=expression=>evaluate(`${frame}.contentWindow.eval(${JSON.stringify(expression)})`);
async function until(expression){for(let i=0;i<100;i++){if(await inner(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,30))}throw Error(`Timed out: ${expression}`)}
async function click(selector){assert.ok(await inner(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.focus();e.click();return true})()`),selector);await inner(`new Promise(r=>requestAnimationFrame(r))`)}
async function textClick(text){assert.ok(await inner(`(()=>{const e=[...document.querySelectorAll('.column-actions-menu button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e||e.disabled)return false;e.focus();e.click();return true})()`),text);await inner(`new Promise(r=>requestAnimationFrame(r))`)}
async function input(selector,value){await inner(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);await inner(`new Promise(r=>requestAnimationFrame(r))`)}
async function open(column='QA_ID',keyboard=false){await inner(`(()=>{const e=document.querySelector('[aria-label="Sort by ${column}"]'),r=e.getBoundingClientRect();e.focus();e.dispatchEvent(${keyboard?`new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true})`:`new MouseEvent('contextmenu',{clientX:r.left+15,clientY:r.bottom,bubbles:true,cancelable:true})`})})()`);await until(`document.querySelector('.column-actions-menu')`)}
async function escape(){await inner(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await inner(`new Promise(r=>requestAnimationFrame(r))`)}

const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React,{useState,useMemo,useCallback,useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {ResultsGrid} from './src/ResultsGrid.jsx';import {nextColumnSort} from './src/resultColumnActions.js';import {getVisibleResultRows} from './src/resultRows.js';import {applyResultFeatures} from './src/resultFeatures.js';
const columns=[{name:'QA_ID',type:'NUMBER',precision:38,scale:0,sourceSchema:'APP',sourceTable:'TEST_ITEMS',sourceColumn:'ITEM_ID',nullable:false},{name:'QA_NAME',type:'VARCHAR2',size:100,nullable:true},{name:'QA_DATE',type:'DATE',nullable:true}];
const data=Array.from({length:12},(_,i)=>[i===0?'12345678901234567890123456789012345678':String(i+1),i===3?null:i%2?'Beta':'Alpha',i===2?null:'2026-10-30T12:00:00']);const original=JSON.stringify(data);
window.columnQa={sql:[]};window.copied=[];window.errors=[];window.addEventListener('error',e=>window.errors.push(e.message));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied.push(text)}}});
const initial=()=>({sortColumn:-1,sortDirection:'asc',options:{}});
function Harness(){const[state,setState]=useState(initial),[theme,setTheme]=useState('default'),[definition,setDefinition]=useState(null);
const display=useMemo(()=>applyResultFeatures(getVisibleResultRows(data,columns,'',state.sortColumn,state.sortDirection,[],state.options),columns,state.options),[state]);const page=useMemo(()=>display.slice(0,4),[display]);
const onSort=useCallback((column,request)=>setState(prev=>{const next=nextColumnSort({...prev,sorts:prev.options.sorts||[]},column,request);return {...prev,sortColumn:next.sortColumn,sortDirection:next.sortDirection,options:{...prev.options,sorts:next.sorts}}}),[]);
const onOptions=useCallback(options=>setState(prev=>({...prev,options})),[]),onLayout=useCallback(layout=>{window.columnQa.layout=layout},[]),onSql=useCallback(sql=>window.columnQa.sql.push(sql),[]),onSource=useCallback(column=>{window.columnQa.source=column;setDefinition({name:column.sourceColumn,table:column.sourceTable,schema:column.sourceSchema,type:column.type,constraints:[]})},[]);
useEffect(()=>{window.columnQa={...(window.columnQa||{}),state,theme:setTheme,patchOptions:patch=>setState(prev=>({...prev,options:{...prev.options,...patch}})),reset:()=>{setState(initial());setDefinition(null)},sql:window.columnQa?.sql||[],original:()=>JSON.stringify(data)===original,displayCount:display.length}},[state,display]);
return <main className="desktop-shell" data-theme={theme} style={{height:'100%',width:'100%',minWidth:0}}><section className="result-panel" style={{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}}><ResultsGrid rows={page} allRows={display} columns={columns} sortColumn={state.sortColumn} sortDirection={state.sortDirection} onSort={onSort} options={state.options} onOptionsChange={onOptions} onLayoutChange={onLayout} onSql={onSql} onSourceDefinition={onSource} sourceDefinition={definition} onInspect={()=>{}}/></section></main>}
createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',logLevel:'silent',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
const css=productionStyles()+'\nhtml,body,#root{width:100%;height:100%;margin:0;min-width:0!important}.result-grid-body{flex:1;min-height:0}.column-actions-menu{pointer-events:auto}';
const html=`<!doctype html><style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`;
let savedLayouts;
try{
  savedLayouts=await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('fbsdb.result-layout.auto.QA_ID:')).map(k=>[k,localStorage.getItem(k)]))`);
  await evaluate(`(()=>{for(const k of Object.keys(localStorage).filter(k=>k.startsWith('fbsdb.result-layout.auto.QA_ID:')))localStorage.removeItem(k);const f=document.createElement('iframe');f.id='column-menu-qa';f.style.cssText='position:fixed;left:-10000px;top:0;width:950px;height:720px;border:0';f.srcdoc=${JSON.stringify(html)};document.body.appendChild(f)})()`);
  await until(`window.columnQa&&document.querySelectorAll('thead [data-column-index]').length===3`);
  assert.equal(await inner(`document.querySelectorAll('thead small,.column-sort-trigger,.column-format-trigger').length`),0);
  await click('[aria-label="Sort by QA_ID"]');assert.equal(await inner(`document.querySelector('th[data-column-index="0"]').getAttribute('aria-sort')`),'ascending');
  assert.equal(await inner(`document.querySelectorAll('[aria-selected="true"]').length`),0);
  await click('[aria-label="Sort by QA_ID"]');assert.equal(await inner(`window.columnQa.state.sortDirection`),'desc');
  await inner(`document.querySelector('[aria-label="Sort by QA_NAME"]').dispatchEvent(new MouseEvent('click',{shiftKey:true,bubbles:true}))`);
  await until(`window.columnQa.state.options.sorts?.length===2`);
  console.log('PASS title click sorts, Shift adds multi-sort, and header icons/type subtitles are removed');

  await open('QA_ID',true);await textClick('Select All');
  assert.match(await inner(`document.querySelector('.result-selection-stats').textContent`),/12 cells.*12 rows.*loaded rows/);
  await open();await textClick('Copy');await textClick('Values with header');
  assert.equal(await inner(`window.copied.at(-1).split('\\r\\n').length`),13);
  assert.ok(await inner(`window.copied.at(-1).includes('12345678901234567890123456789012345678')`));
  await open();await textClick('Statistics…');assert.match(await inner(`document.querySelector('.column-action-details').textContent`),/12345678901234567890123456789012345678/);await escape();
  assert.equal(await inner(`document.activeElement.getAttribute('aria-label')`),'Sort by QA_ID');
  await inner(`window.columnQa.patchOptions({frozenRows:[0]})`);await open();await textClick('Select All');assert.equal(await inner(`document.querySelectorAll('.result-frozen-rows .selected-cell').length`),1);await inner(`window.columnQa.patchOptions({frozenRows:[]})`);
  await inner(`const grid=document.querySelector('.grid-wrap');grid.focus();grid.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);await until(`!document.querySelector('.result-selection-stats')`);
  console.log('PASS loaded-column selection/copy across pages, Escape clear and exact NUMBER statistics');

  await open();await textClick('Format…');await until(`document.querySelector('.column-format-popover')`);
  await input('[aria-label="QA_ID alignment"]','right');await input('[aria-label="QA_ID decimal places"]','2');
  assert.equal(await inner(`window.columnQa.state.options.columnFormats[0].decimals`),2);
  assert.equal(await inner(`document.activeElement.getAttribute('aria-label')`),'QA_ID decimal places');
  await escape();assert.equal(await inner(`document.activeElement.getAttribute('aria-label')`),'Sort by QA_ID');
  await open();await textClick('Column Width');await input('[aria-label="QA_ID width"]','210');
  await inner(`document.querySelector('.column-action-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await until(`window.columnQa.layout.sizes[0]===210`);
  await open();await textClick('Pin Column');await textClick('Pin right');await until(`window.columnQa.state.options.pinnedRight.includes(0)`);
  await open();await textClick('Pin Column');await textClick('Unpin');await until(`!window.columnQa.state.options.pinnedRight.includes(0)`);
  await open();await textClick('Move Column');await textClick('Move last');await until(`document.querySelector('thead th[data-column-index]:last-child').dataset.columnIndex==='0'`);
  await open('QA_NAME');await textClick('Hide Column');await until(`!document.querySelector('thead [data-column-index="1"]')`);
  await open();await textClick('Show Hidden Columns…');await textClick('Show QA_NAME');await until(`document.querySelector('thead [data-column-index="1"]')`);
  console.log('PASS column formatting, custom width, pin/unpin, movement and hide/show use stable column indices');

  await open('QA_NAME');await textClick('Filter…');await input('[aria-label="QA_NAME filter value"]','Alpha');
  await inner(`document.querySelector('.column-action-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await until(`window.columnQa.displayCount===6`);
  await open('QA_NAME');await textClick('Filter…');await textClick('Clear this column filters');await until(`window.columnQa.displayCount===12`);
  await open('QA_NAME');await textClick('Highlight…');await input('[aria-label="QA_NAME highlight value"]','Beta');
  await inner(`document.querySelector('.column-action-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await until(`window.columnQa.state.options.rules?.length===1`);
  await open();await textClick('Column Details');assert.match(await inner(`document.querySelector('.column-action-details').textContent`),/NUMBER.*38.*APP.*TEST_ITEMS/s);await textClick('Load source definition / keys…');
  await until(`window.columnQa.source?.sourceColumn==='ITEM_ID'`);
  await open();await textClick('Generate SQL');await textClick('Insert WHERE draft');assert.equal(await inner(`window.columnQa.sql.at(-1)`),'WHERE "ITEM_ID" = :value');
  assert.equal(await inner(`window.columnQa.original()`),true);
  await inner(`(()=>{const e=document.querySelector('[data-cell]'),r=e.getBoundingClientRect();const event=new MouseEvent('contextmenu',{clientX:r.left+5,clientY:r.top+5,bubbles:true,cancelable:true});e.dispatchEvent(event);window.cellContextPrevented=event.defaultPrevented})()`);await until(`document.querySelector('.result-context-menu')`);assert.equal(await inner(`window.cellContextPrevented`),true);assert.match(await inner(`document.querySelector('.result-context-menu').textContent`),/Inspect value/);await escape();
  console.log('PASS validated local filters/highlights, source details, SQL drafts, unchanged raw rows and the existing cell menu');

  for(const theme of ['default','dark','light']){
    await inner(`window.columnQa.theme(${JSON.stringify(theme)})`);await until(`document.querySelector('main').dataset.theme===${JSON.stringify(theme)}`);
    await open();
    const colors=await inner(`(()=>{const m=document.querySelector('.column-actions-menu'),s=getComputedStyle(m);return {background:s.backgroundColor,foreground:s.color}})()`);
    const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
    const a=luminance(colors.background),b=luminance(colors.foreground);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,JSON.stringify({theme,colors}));
    assert.notEqual(await inner(`getComputedStyle(document.activeElement).outlineStyle`),'none');await escape();
    await open();await textClick('Format…');assert.equal(await inner(`getComputedStyle(document.querySelector('.column-format-popover')).backgroundColor`),colors.background);await escape();
  }
  await evaluate(`${frame}.style.width='360px';${frame}.style.height='440px'`);await until(`innerWidth===360`);
  await open('QA_NAME');const geometry=await inner(`(()=>{const r=document.querySelector('.column-actions-menu').getBoundingClientRect();return {inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}})()`);assert.equal(geometry.inside,true);await escape();
  assert.deepEqual(await inner(`window.errors`),[]);
  console.log('PASS all three themes, focus/contrast, keyboard menu access and narrow viewport bounds');
}catch(error){console.error('Column fixture diagnostics',JSON.stringify(await inner(`({errors:window.errors,body:document.body.innerText.slice(0,500)})`).catch(()=>null)));throw error;}finally{
  await evaluate(`${frame}?.remove()`);
  if(savedLayouts)await evaluate(`for(const k of Object.keys(localStorage).filter(k=>k.startsWith('fbsdb.result-layout.auto.QA_ID:')))localStorage.removeItem(k);for(const[k,v]of Object.entries(${JSON.stringify(savedLayouts)}))localStorage.setItem(k,v)`);
  socket.close();
}
