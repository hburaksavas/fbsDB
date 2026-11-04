// Real ResultsGrid and production helpers in an isolated native WebView2 iframe.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { productionStyles } from './productionStyles.mjs';

const endpoint = process.argv[2] || 'http://127.0.0.1:9348';
const output = resolve(process.argv[3] || '.artifacts/desktop-load', 'report.json');
const startedAt = new Date().toISOString();
let socket, result, failure;
const pending = new Map();
let sequence = 0;
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 90000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
try {
  let target;
  for (let i = 0; i < 200; i++) {
    try { target = (await (await fetch(`${endpoint}/json/list`)).json()).find(t => t.type === 'page' && t.url.startsWith('https://fbsdb.local/')); } catch {}
    if (target) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(target, 'Native fbsDB WebView2 required');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data); const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id); message.error ? handler.reject(Error(message.error.message)) : handler.resolve(message.result);
  });
  let ready = false;
  for (let i = 0; i < 600; i++) {
    try { ready = await evaluate(`document.readyState==='complete' && Boolean(window.monaco?.editor.getEditors().find(editor=>document.contains(editor.getDomNode())))`); } catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, 'Native Monaco startup did not complete');
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ResultsGrid} from './src/ResultsGrid.jsx';
import {getVisibleResultRows} from './src/resultRows.js';
import {csvText} from './src/resultWorkbench.js';
const columns=[{name:'LOAD_ID',type:'NUMBER'},{name:'LOAD_NAME',type:'VARCHAR2'},{name:'LOAD_NOTE',type:'VARCHAR2'}];
let update;
const errors=[];window.addEventListener('error',e=>errors.push(e.message));
const longTasks=[];if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask'});
function Harness(){const[state,setState]=useState({rows:[],sort:-1});update=setState;
return <main className="desktop-shell" data-theme="default" style={{height:'100vh',width:'100vw'}}><section className="result-panel" style={{height:'100%',display:'flex',flexDirection:'column',minHeight:0}}><ResultsGrid rows={state.rows} allRows={state.rows} columns={state.columns||columns} sortColumn={state.sort} sortDirection="asc" onSort={()=>{}} onInspect={()=>{}} options={{sortLocale:'tr-TR'}}/></section></main>}
flushSync(()=>createRoot(document.getElementById('root')).render(<Harness/>));
const paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const require=(value,message)=>{if(!value)throw Error(message)};
const p95=values=>values.sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
window.loadDone=(async()=>{
const checks=[];
for(const count of [50000,200000]){
const data=Array.from({length:count},(_,i)=>[String(count-i),i%10===0?'İSTANBUL':'Ankara','a,"b"\\nç']);
const samples={mount:[],sort:[],filter:[],scroll:[],csv:[]};
const measure=async(name,action)=>{const start=performance.now();await action();samples[name].push(performance.now()-start)};
for(let repeat=0;repeat<5;repeat++){
await measure('mount',async()=>{flushSync(()=>update({rows:getVisibleResultRows(data,columns),sort:-1}));await paint()});
require(!!document.querySelector('[role="grid"]'),'Grid missing: '+errors.join(' | ')+' DOM: '+document.body.innerHTML.slice(0,1000));
require(document.querySelector('[role="grid"]').getAttribute('aria-rowcount')===String(count+1),'Incorrect loaded row count');
require(document.querySelectorAll('[data-cell]').length>0&&document.querySelectorAll('[data-cell]').length<5000,'Grid virtualization failed');
await measure('sort',async()=>{const rows=getVisibleResultRows(data,columns,'',0,'asc');require(rows[0].row[0]==='1'&&rows.at(-1).row[0]===String(count),'Wrong numeric order');flushSync(()=>update({rows,sort:0}));await paint()});
await measure('scroll',async()=>{const grid=document.querySelector('.grid-wrap');grid.scrollTop=grid.scrollHeight;grid.dispatchEvent(new Event('scroll'));await paint();await paint();require(!!document.querySelector('[data-cell="'+(count-1)+':0"]'),'Last row not rendered after scroll')});
await measure('filter',async()=>{const rows=getVisibleResultRows(data,columns,'istanbul',0,'asc',[],{sortLocale:'tr-TR'});require(rows.length===count/10,'Incorrect Turkish filter count');flushSync(()=>update({rows,sort:0}));await paint()});
await measure('csv',async()=>{const text=csvText(data,columns);require(text.split('\\r\\n').length===count+1,'CSV row loss');require(text.includes('"a,""b""\\nç"'),'CSV escaping failed')});
}
checks.push({count,iterations:5,status:'passed',measurements:Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{p95Ms:p95(values),maxMs:Math.max(...values)}]))});
}
// Wide result: many columns make every row heavier; vertical and horizontal scrolling and a selection must stay responsive.
{
const wideColumns=Array.from({length:120},(_,c)=>({name:'COL_'+c,type:c%3===0?'NUMBER':'VARCHAR2'}));
const wideCount=20000,wide=Array.from({length:wideCount},(_,i)=>wideColumns.map((_,c)=>c%3===0?String(i*c):'v'+i+'_'+c));
const samples={mount:[],scrollY:[],scrollX:[],select:[]};
const measure=async(name,action)=>{const start=performance.now();await action();samples[name].push(performance.now()-start)};
for(let repeat=0;repeat<5;repeat++){
await measure('mount',async()=>{flushSync(()=>update({rows:getVisibleResultRows(wide,wideColumns),sort:-1,columns:wideColumns}));await paint()});
require(document.querySelectorAll('[data-cell]').length>0&&document.querySelectorAll('[data-cell]').length<8000,'Wide grid virtualization failed: '+document.querySelectorAll('[data-cell]').length);
await measure('scrollY',async()=>{const grid=document.querySelector('.grid-wrap');grid.scrollTop=grid.scrollHeight;grid.dispatchEvent(new Event('scroll'));await paint();await paint();require(!!document.querySelector('[data-cell="'+(wideCount-1)+':0"]'),'Last wide row not rendered')});
await measure('scrollX',async()=>{const grid=document.querySelector('.grid-wrap');grid.scrollLeft=grid.scrollWidth;grid.dispatchEvent(new Event('scroll'));await paint();await paint();require(!!document.querySelector('[data-cell="'+(wideCount-1)+':119"]'),'Last wide column not rendered')});
await measure('select',async()=>{const cell=document.querySelector('[data-cell="'+(wideCount-1)+':119"]');cell.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));window.dispatchEvent(new PointerEvent('pointerup'));await paint();require(!!document.querySelector('.selected-cell'),'Selection not shown')});
}
const stats=Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{p95Ms:p95(values),maxMs:Math.max(...values)}]));
const budgets={mount:4000,scrollY:1500,scrollX:1500,select:500};
for(const [name,limit] of Object.entries(budgets))require(stats[name].p95Ms<limit,'Wide result '+name+' p95 '+Math.round(stats[name].p95Ms)+' ms exceeds the '+limit+' ms budget');
checks.push({count:wideCount,columns:120,iterations:5,status:'passed',budgetsMs:budgets,measurements:stats});
}

require(errors.length===0,errors.join('\\n'));
return {checks,longTasks:{count:longTasks.length,maxMs:longTasks.length?Math.max(...longTasks):0,totalMs:longTasks.reduce((a,b)=>a+b,0)},userAgent:navigator.userAgent};
})();
` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
  const html = `<html><head><style>${productionStyles()}</style></head><body style="margin:0"><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`;
  await evaluate(`(()=>{const frame=document.createElement('iframe');frame.id='desktop-load-fixture';frame.style.cssText='position:fixed;inset:0;width:1200px;height:800px;border:0;z-index:999999';frame.srcdoc=${JSON.stringify(html)};document.body.appendChild(frame)})()`);
  for (let i = 0; i < 200; i++) {
    if (await evaluate(`Boolean(document.getElementById('desktop-load-fixture').contentWindow.loadDone)`)) break;
    await new Promise(r => setTimeout(r, 100));
  }
  result = await evaluate(`document.getElementById('desktop-load-fixture').contentWindow.loadDone`);
  assert.equal(result?.checks.length, 3, 'Fixture did not produce all datasets');
  for (const check of result.checks) console.log(`PASS WebView2 ${check.count} rows${check.columns ? ` x ${check.columns} columns` : ''}: ${JSON.stringify(check.measurements)}`);
} catch (error) { failure = error; console.error(error); }
finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await evaluate(`document.getElementById('desktop-load-fixture')?.remove()`).catch(() => {});
    socket.close();
  }
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, JSON.stringify({ startedAt, completedAt: new Date().toISOString(), status: failure ? 'failed' : 'passed',
    scope: 'Native WebView2 ResultsGrid fixture; no database calls or clipboard writes; no Monaco or full workbench interaction timing',
    result, error: failure?.stack }, null, 2));
  console.log(`Report: ${output}`);
}
if (failure) process.exitCode = 1;
