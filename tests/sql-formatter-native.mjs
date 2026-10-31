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
try {
  await call('Page.enable'); await call('Runtime.enable');
  scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture})).identifier;
  await call('Page.reload');
  await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length`);
  await click('[aria-label="Settings"]');
  for (let i=0;i<3;i++) {
    await textClick('[aria-label="Settings categories"] button','Appearance');
    await click(`.theme-choice:nth-child(${i+1})`);
    await textClick('[aria-label="Settings categories"] button','Formatter');
    await until(`document.querySelector('.sql-formatter-settings')`);
    await input('[aria-label="SQL keyword case"]','lower');
    await input('[aria-label="Formatter indentation"]','spaces');
    await input('[aria-label="Formatter indent size"]','8');
    assert.match(await evaluate(`document.querySelector('[aria-label="SQL formatter preview"]').textContent`),/select\n        i.invoice_id/);
    const colors=await evaluate(`(()=>{const el=document.querySelector('[aria-label="SQL keyword case"]'),s=getComputedStyle(el);return {fg:s.color,bg:s.backgroundColor,shadow:s.boxShadow}})()`);
    assert.notEqual(colors.fg,colors.bg);assert.equal(colors.shadow,'none');
    console.log('PASS formatter settings/preview theme',i,colors);
  }
  await key('Escape');
  const source='select a,b from dual;\nselect untouched from dual;';
  await evaluate(`${editor}.setValue(${JSON.stringify(source)});${editor}.setSelection({startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:22});${editor}.focus()`);
  await key('F',10);
  await until(`${editor}.getValue().startsWith('select\\n        a,')`);
  assert.ok((await evaluate(`${editor}.getValue()`)).endsWith('\nselect untouched from dual;'));
  assert.equal(await evaluate(`!!document.querySelector('.workspace-search')`),false);
  await key('z',2);
  await until(`${editor}.getValue()===${JSON.stringify(source)}`);
  console.log('PASS Ctrl+Shift+F selection, unchanged outside selection and one-step Undo');
  await evaluate(`${editor}.setSelection({startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1});${editor}.focus()`);
  await key('F',10);
  await until(`${editor}.getValue().includes('select\\n        untouched')`);
  assert.equal(await evaluate(`window.__uxFixture.commands.some(c=>c.command==='sql.execute')`),false);
  console.log('PASS whole document formatting without execution');
  await call('Page.reload');await until(`window.monaco?.editor.getEditors().length`);
  await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Formatter');
  assert.equal(await evaluate(`document.querySelector('[aria-label="SQL keyword case"]').value`),'lower');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Formatter indent size"]').value`),'8');
  assert.deepEqual(errors,[]);
  console.log('PASS persisted custom formatter settings in native WebView2');
} finally {
  if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});
  socket.close();
}
