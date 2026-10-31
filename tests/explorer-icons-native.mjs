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
async function key(key,modifiers=0){await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:{Enter:13,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38}[key]||key.toUpperCase().charCodeAt(0),modifiers});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
const editor=`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode()))`;
const fixture=nativeUxFixture;






const iconAudit=`(()=>{
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=canvas.height=1;
 const rgb=s=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=s;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v)};
 const over=(a,b)=>{const alpha=a[3]+b[3]*(1-a[3]);return [0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/alpha).concat(alpha)};
 const bg=e=>e?over(rgb(getComputedStyle(e).backgroundColor),bg(e.parentElement)):rgb(getComputedStyle(document.documentElement).getPropertyValue('--bg'));
 const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 return [...document.querySelectorAll('.oracle-object-icon,.oracle-schema-icon,.connection-tree-entry>svg,.connection-tree-folder>summary>svg,.connection-tree-action>svg,.connection-context-menu button>svg')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&!e.closest('button:disabled')).map(e=>{const a=lum(rgb(getComputedStyle(e).color)),b=lum(bg(e));return {icon:e.classList.value,color:getComputedStyle(e).color,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});
})()`;
let scriptId;
try{
 await call('Page.enable');await call('Runtime.enable');scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture})).identifier;
 await call('Page.reload');await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length&&document.querySelector('.app-status')?.textContent.includes('UX fixture')`);
 await evaluate('new Promise(r=>setTimeout(r,150))');
 const profiles=[{id:'UX_DEV',name:'Icon theme QA',env:'DEV'}],organization={version:1,folders:[{id:'folder',name:'QA folder',parentId:null}],groups:[],assignments:{UX_DEV:{folderId:'folder',groupIds:[]}}};
 await evaluate(`__uxFixture.emit({type:'connection.profiles',profiles:${JSON.stringify(profiles)},organization:${JSON.stringify(organization)},aliases:[]})`);
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await evaluate(`__uxFixture.emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV'},serverVersion:'23'})`);
 const types=['TABLE','VIEW','MATERIALIZED VIEW','SYNONYM','PACKAGE','PROCEDURE','FUNCTION','TRIGGER','SEQUENCE','INDEX','CONSTRAINT','TYPE','DATABASE LINK'];
 await evaluate(`__uxFixture.emit({type:'schema.loaded',tabId:'tab-1',schema:'APP',objects:${JSON.stringify(types.map(type=>({owner:'APP',name:'QA_'+type.replaceAll(' ','_'),type,columns:[]})))}})`);
 await until(`document.querySelector('.oracle-schema-node>summary')`);await click('.oracle-schema-node>summary');await until(`document.querySelectorAll('.oracle-object-icon').length>=13`);
 for(let i=0;i<3;i++){
  await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);await key('Escape');
  await evaluate(`document.querySelectorAll('.oracle-object-tree details').forEach(e=>e.open=true)`);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  for(const state of ['normal','selected']){
   await evaluate(`document.querySelectorAll('.oracle-object-row').forEach(e=>e.classList.toggle('active',${state==='selected'}));document.querySelectorAll('.connection-tree-entry').forEach(e=>e.setAttribute('data-context-selected',${JSON.stringify(state==='selected'?'true':'false')}))`);
   const icons=await evaluate(iconAudit);assert.ok(icons.length>=20);
   assert.deepEqual(icons.filter(e=>e.ratio<2.98),[],JSON.stringify({theme:i,state,icons}));
   console.log('PASS explorer and connections icon contrast, theme',i,state,'icons',icons.length);
  }
  await evaluate(`(()=>{const e=document.querySelector('.connection-tree-entry');e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:130}))})()`);
  await until(`document.querySelector('.connection-context-menu')`);
  const icons=await evaluate(iconAudit);assert.deepEqual(icons.filter(e=>e.ratio<2.98),[],JSON.stringify({theme:i,icons}));
  await key('Escape');
 }
 assert.deepEqual(errors,[]);console.log('PASS all object types, connection folders/actions and themed context menus without Oracle operations');
}finally{if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});socket.close()}
