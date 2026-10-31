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
try{
 await call('Page.enable');await call('Runtime.enable');
 scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture})).identifier;
 await call('Page.reload');await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length`);
 await click('[aria-label="Settings"]');
 const categories=await evaluate(`[...document.querySelectorAll('[aria-label="Settings categories"] button')].map(e=>e.textContent)`);
 assert.ok(categories.includes('Style')&&categories.includes('Formatter')&&categories.includes('Shortcuts'));
 assert.ok(!categories.includes('Editor / SQL'));
 for(let i=0;i<3;i++){
  await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);
  await textClick('[aria-label="Settings categories"] button','Style');
  assert.equal(await evaluate(`!!document.querySelector('.sql-formatter-settings')`),false);
  assert.equal(await evaluate(`!!document.querySelector('.editor-shortcuts-panel')`),false);
  await input('[aria-label="Cursor style"]','block');
  await input('[aria-label="Editor line height"]','28');
  assert.equal(await evaluate(`${editor}.getRawOptions().cursorStyle`),'block');
  assert.equal(await evaluate(`${editor}.getRawOptions().lineHeight`),28);
  await textClick('[aria-label="Settings categories"] button','Formatter');
  await textClick('.formatter-presets button','Leading commas');
  assert.match(await evaluate(`document.querySelector('[aria-label="SQL formatter preview"]').textContent`),/\n\s+, c.customer_name/);
  await textClick('[aria-label="Settings categories"] button','Shortcuts');
  assert.equal(await evaluate(`document.querySelectorAll('.editor-shortcut-row').length`),10);
  await click('[aria-label="Toggle comment shortcut"]');await key('D',2);
  assert.match(await evaluate(`document.querySelector('.editor-shortcuts-panel [role="alert"]').textContent`),/Already used/);
  await click('[aria-label="Toggle comment shortcut"]');await key('K',10);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Toggle comment shortcut"]').value`),'Ctrl+Shift+K');
  const style=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('[aria-label="Toggle comment shortcut"]'));return {fg:s.color,bg:s.backgroundColor,shadow:s.boxShadow}})()`);
  assert.notEqual(style.fg,style.bg);assert.equal(style.shadow,'none');
  console.log('PASS separate editor settings, live style, formatter preset, key capture and conflict detection, theme',i);
 }
 await key('Escape');
 await evaluate(`${editor}.setValue('select 1 from dual;');${editor}.setPosition({lineNumber:1,column:1});${editor}.focus()`);
 await key('K',10);await until(`${editor}.getValue().startsWith('--')`);
 await key('z',2);await until(`${editor}.getValue()==='select 1 from dual;'`);
 await key('F',10);await until(`${editor}.getValue().replaceAll('\\r','').startsWith('SELECT\\n')`);
 console.log('PASS customized comment command, Undo and fixed Ctrl+Shift+F');
 await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Formatter');
 await textClick('.settings-frame-search button','Reset user category');
 await textClick('[aria-label="Settings categories"] button','Style');
 assert.equal(await evaluate(`document.querySelector('[aria-label="Cursor style"]').value`),'block');
 await textClick('[aria-label="Settings categories"] button','Shortcuts');
 assert.equal(await evaluate(`document.querySelector('[aria-label="Toggle comment shortcut"]').value`),'Ctrl+Shift+K');
 await call('Page.reload');await until(`window.monaco?.editor.getEditors().length`);
 await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Shortcuts');
 assert.equal(await evaluate(`document.querySelector('[aria-label="Toggle comment shortcut"]').value`),'Ctrl+Shift+K');
 assert.equal(await evaluate(`window.__uxFixture.commands.some(c=>c.command==='sql.execute')`),false);
 assert.deepEqual(errors,[]);
 console.log('PASS independent category reset, saved shortcuts and no SQL execution');
}finally{
 if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});socket.close();
}
