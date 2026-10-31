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






let scriptId;
try{
 await call('Page.enable');await call('Runtime.enable');scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture})).identifier;
 await call('Page.reload');await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length&&document.querySelector('.app-status')?.textContent.includes('UX fixture')`);await evaluate('new Promise(r=>setTimeout(r,150))');
 const profile={id:'PW_QA',name:'Password QA',user:'QA',host:'fixture.invalid',port:'1521',service:'QA',method:'basic',env:'DEV',hasSavedCredentials:false};
 await evaluate(`__uxFixture.emit({type:'connection.profiles',profiles:[${JSON.stringify(profile)}],aliases:[]})`);
 for(let i=0;i<3;i++){
  await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);await key('Escape');
  await click('[data-connection-profile="PW_QA"]');await until(`document.querySelector('.auth-modal .connection-password')`);
  assert.equal(await evaluate(`document.querySelector('.password-visibility').disabled`),true);
  await input('.password-entry-input','QA-only-not-a-credential');
  await click('[aria-label="Show password"]');assert.equal(await evaluate(`document.querySelector('.password-entry-input').type`),'text');
  await click('[aria-label="Hide password"]');assert.equal(await evaluate(`document.querySelector('.password-entry-input').type`),'password');
  await click('[aria-label="Remember password"]');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Remember password"]').checked`),true);
  await evaluate(`document.querySelector('[aria-label="Remember password"]').focus()`);await key(' ');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Remember password"]').checked`),false);
  const styles=await evaluate(`(()=>{const input=document.querySelector('.password-entry-input'),frame=document.querySelector('.password-entry-frame');input.focus();const s=getComputedStyle(input),f=getComputedStyle(frame);return {border:s.borderTopWidth,outline:s.outlineStyle,shadow:s.boxShadow,frame:f.borderTopWidth,bg:s.backgroundColor,fg:s.color}})()`);
  assert.equal(styles.border,'0px');assert.equal(styles.outline,'none');assert.equal(styles.shadow,'none');assert.equal(styles.frame,'1px');assert.equal(styles.bg,'rgba(0, 0, 0, 0)');
  assert.equal(await evaluate(`document.querySelector('.auth-modal').textContent.includes('Securely remember on this Windows account')`),false);
  console.log('PASS password visibility, keyboard remember and one focus frame, theme',i);await key('Escape');
 }
 // Saved credentials are represented without putting a dummy password into the editor.
 await evaluate(`__uxFixture.emit({type:'connection.profiles',profiles:[{...${JSON.stringify(profile)},hasSavedCredentials:true}],aliases:[]})`);
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await click('[aria-label="Edit Password QA"]');await until(`document.querySelector('.profile-fields .connection-password')`);
 assert.equal(await evaluate(`document.querySelector('.password-entry-input').value`),'');assert.equal(await evaluate(`document.querySelector('.password-entry-input').placeholder`),'Saved password');
 assert.equal(await evaluate(`document.querySelector('.password-visibility').disabled`),true);
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.password-remember-thumb')).transitionDuration`),'0s');
 assert.equal(await evaluate(`__uxFixture.commands.some(c=>['connection.connect','connection.test','connection.save'].includes(c.command))`),false);
 assert.deepEqual(errors,[]);console.log('PASS shared profile password control, saved-password behavior, reduced motion and no credential submission');
}finally{
 await call('Emulation.setEmulatedMedia',{features:[]});if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});socket.close();
}
