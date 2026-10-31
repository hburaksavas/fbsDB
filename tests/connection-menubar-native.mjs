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





let scriptId;
const checkGeometry=async()=>{
 const g=await evaluate(`(()=>{const b=document.querySelector('.connection-control'),r=b.getBoundingClientRect(),m=document.querySelector('.ide-menubar').getBoundingClientRect(),view=document.querySelector('.ide-view-menu')?.getBoundingClientRect();return {center:r.x+r.width/2,target:innerWidth/2,height:r.height,left:r.left,right:r.right,menuTop:m.top,menuBottom:m.bottom,top:r.top,bottom:r.bottom,width:innerWidth,viewRight:view?.right||100,count:document.querySelectorAll('.connection-control').length,inMenu:!!b.closest('.ide-menubar'),inEditor:!!b.closest('.commandbar')}})()`);
 assert.ok(Math.abs(g.center-g.target)<1,JSON.stringify(g));assert.equal(g.height,26);assert.equal(g.count,1);assert.equal(g.inMenu,true);assert.equal(g.inEditor,false);
 assert.ok(g.top>=g.menuTop&&g.bottom<=g.menuBottom);assert.ok(g.left>=g.viewRight&&g.right<=g.width,JSON.stringify(g));
};
try{
 await call('Page.enable');await call('Runtime.enable');scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture})).identifier;
 await call('Page.reload');await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length`);
 await until(`document.querySelector('.app-status')?.textContent.includes('UX fixture')`);await evaluate('new Promise(r=>setTimeout(r,150))');
 const organization={version:1,folders:[],groups:[{id:'finance',name:'Finance'}],assignments:{UX_DEV:{folderId:null,groupIds:['finance']},UX_PROD:{folderId:null,groupIds:[]}}};
 const profiles=[{id:'UX_DEV',name:'My database',env:'DEV'},{id:'UX_PROD',name:'Production',env:'PROD'}];
 await evaluate(`__uxFixture.emit({type:'connection.profiles',profiles:${JSON.stringify(profiles)},organization:${JSON.stringify(organization)},aliases:[]})`);
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await evaluate(`__uxFixture.emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV'},serverVersion:'23'})`);
 await until(`document.querySelector('.connection-control-name').textContent==='My database'`);
 assert.equal(await evaluate(`document.querySelector('.connection-control-group').textContent`),'Finance');
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.connection-control-summary')).position`),'absolute');
 await until(`document.querySelector('.connection-control').dataset.appTooltip?.includes('DEV_PDB')`);
 assert.match(await evaluate(`document.querySelector('.connection-control').dataset.appTooltip`),/APP.*DEV_PDB/);
 for(let i=0;i<3;i++){
  await call('Emulation.clearDeviceMetricsOverride');
  await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);await key('Escape');
  for(const width of [320,480,900,1440]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await checkGeometry();
  }
  console.log('PASS viewport-centered compact connection capsule, theme',i);
 }
 await call('Emulation.clearDeviceMetricsOverride');
 await click('[aria-label="Editor focus mode"]');await checkGeometry();await click('[aria-label="Editor focus mode"]');await checkGeometry();
 const nextOrg={...organization,groups:[{id:'finance',name:'Finance renamed'}]};
 await evaluate(`__uxFixture.emit({type:'connection.profiles',profiles:${JSON.stringify(profiles)},organization:${JSON.stringify(nextOrg)},aliases:[]})`);
 await until(`document.querySelector('.connection-control-group').textContent==='Finance renamed'`);
 await click('.connection-control');await until(`document.querySelector('[role="dialog"][aria-label="Change connection"]')`);await key('Escape');
 assert.equal(await evaluate(`document.querySelector('.connection-control').getAttribute('aria-expanded')`),'false');
 assert.deepEqual(errors,[]);
 console.log('PASS focus layout, current group rename and connection picker keyboard behavior');
}finally{
 await call('Emulation.clearDeviceMetricsOverride');if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});socket.close();
}
