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
async function key(key,modifiers=0){await call('Input.dispatchKeyEvent',{type:'keyDown',key,text:key==='Enter'?'\r':undefined,code:key===' '?'Space':key,windowsVirtualKeyCode:{' ':32,Enter:13,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38}[key]||key.toUpperCase().charCodeAt(0),modifiers});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
const editor=`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode()))`;
const fixture=nativeUxFixture;





async function toggle(label,checked){await evaluate(`(()=>{const label=[...document.querySelectorAll('.completion-settings label')].find(e=>e.textContent.trim()===${JSON.stringify(label)});const input=label?.querySelector('input[type="checkbox"]');if(!input)throw Error('Missing toggle');if(input.checked!==${checked})input.click()})()`);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
let scriptId;
try{
 await call('Page.enable');await call('Runtime.enable');
 scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture})).identifier;
 await call('Page.reload');await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length`);
 await click('[aria-label="Settings"]');
 for(let i=0;i<3;i++){
  await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);
  await textClick('[aria-label="Settings categories"] button','Style');
  assert.equal(await evaluate(`!!document.querySelector('.completion-settings')`),false);
  await textClick('[aria-label="Settings categories"] button','Completion');
  assert.equal(await evaluate(`document.querySelectorAll('.completion-settings fieldset').length`),4);
  await input('[aria-label="Minimum characters"]','4');await input('[aria-label="Suggestion limit"]','50');
  await input('[aria-label="Suggestion delay (ms)"]','50');
  await toggle('Accept with Enter',false);await toggle('Inline suggestions',false);
  assert.equal(await evaluate(`${editor}.getRawOptions().acceptSuggestionOnEnter`),'off');
  const style=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('[aria-label="Minimum characters"]'));return {fg:s.color,bg:s.backgroundColor,shadow:s.boxShadow}})()`);
  assert.notEqual(style.fg,style.bg);assert.equal(style.shadow,'none');
  console.log('PASS Completion page, advanced options and live Enter preference, theme',i);
 }
 await key('Escape');
 await evaluate(`${editor}.trigger('test','hideSuggestWidget',{});${editor}.setValue('SELECT T');${editor}.setPosition({lineNumber:1,column:9});${editor}.focus()`);
 await evaluate('new Promise(r=>setTimeout(r,400))');
 assert.equal(await evaluate(`!!document.querySelector('.suggest-widget.visible')`),false);
 await key(' ',2);await until(`document.querySelector('.suggest-widget.visible .monaco-list-row')`);
 await key('Enter');
 await until(`${editor}.getValue().replaceAll('\\r','')==='SELECT T\\n'`);
 console.log('PASS minimum characters, manual Ctrl+Space bypass and Enter inserts newline when disabled');
 await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Completion');
 await toggle('Functions / procedures',false);
 await key('Escape');
 await evaluate(`${editor}.setValue('SELECT TO_CH');${editor}.setPosition({lineNumber:1,column:13});${editor}.focus()`);
 await key(' ',2);await evaluate('new Promise(r=>setTimeout(r,400))');
 assert.equal(await evaluate(`[...document.querySelectorAll('.suggest-widget.visible .label-name')].some(e=>e.textContent==='TO_CHAR')`),false);
 await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Completion');
 await toggle('Functions / procedures',true);await toggle('Accept with Enter',true);
 await key('Escape');
 await evaluate(`${editor}.trigger('test','hideSuggestWidget',{});${editor}.setValue('SELECT TO_CH');${editor}.setPosition({lineNumber:1,column:13});${editor}.focus()`);
 await key(' ',2);await until(`[...document.querySelectorAll('.suggest-widget.visible .label-name')].some(e=>e.textContent==='TO_CHAR')`);
 await key('Enter');await until(`${editor}.getValue().includes('TO_CHAR(')`);
 console.log('PASS source filtering and Enter accepts suggestions when enabled');
 await call('Page.reload');await until(`window.monaco?.editor.getEditors().length`);
 await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Completion');
 assert.equal(await evaluate(`document.querySelector('[aria-label="Minimum characters"]').value`),'4');
 assert.equal(await evaluate(`document.querySelector('[aria-label="Suggestion limit"]').value`),'50');
 await textClick('.settings-frame-search button','Reset user category');
 assert.equal(await evaluate(`document.querySelector('[aria-label="Minimum characters"]').value`),'0');
 assert.equal(await evaluate(`document.querySelector('[aria-label="Suggestion limit"]').value`),'300');
 assert.equal(await evaluate(`window.__uxFixture.commands.some(c=>c.command==='sql.execute')`),false);
 assert.deepEqual(errors,[]);
 console.log('PASS persisted Completion settings, category reset and no SQL execution');
}finally{if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});socket.close()}
