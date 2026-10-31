// Integration audit of actual App/Monaco/settings and body portals in WebView2.
// The fixture blocks database, workspace and credential operations.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {nativeUxFixture} from './nativeUxFixture.mjs';
import {themeContrastAudit} from './themeContrastAudit.mjs';
import palettes from '../src/themePalettes.json' with {type:'json'};
const endpoint=process.argv[2]||'http://127.0.0.1:9339';
let target;for(let i=0;i<100;i++){try{target=(await(await fetch(endpoint+'/json/list')).json()).find(t=>t.type==='page'&&t.url.startsWith('https://fbsdb.local/'));if(target)break}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(target,'Native fbsDB WebView2 required');
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let sequence=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))).then(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))))');
async function until(code){for(let i=0;i<100;i++){if(await evaluate(`Boolean(${code})`))return;await new Promise(r=>setTimeout(r,50))}throw Error('Timed out '+code)}
async function click(selector){assert.ok(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.click();return true})()`),selector);await settle()}
async function textClick(selector,text){assert.ok(await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e||e.disabled)return false;e.click();return true})()`),text);await settle()}
async function input(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);await settle()}
async function escape(){await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await settle()}
const report=[];let scriptId,storage;
const capture=async(theme,page)=>{const result=await evaluate(themeContrastAudit);report.push({theme,page,...result});writeFileSync('.artifacts/theme-app-audit.json',JSON.stringify(report,null,2));assert.ok(result.samples>0,page)};
async function searchFrame(label){
 const style=await evaluate(`(()=>{const e=document.querySelector('[aria-label="${label}"]');e.focus();const s=getComputedStyle(e),p=getComputedStyle(e.parentElement);return {innerBorder:s.borderWidth,innerOutline:s.outlineWidth,innerShadow:s.boxShadow,innerBackground:s.backgroundColor,outerBorder:p.borderWidth,outerRadius:p.borderRadius,focused:e.parentElement.matches(':focus-within')}})()`);
 assert.deepEqual(style,{innerBorder:'0px',innerOutline:'0px',innerShadow:'none',innerBackground:'rgba(0, 0, 0, 0)',outerBorder:'1px',outerRadius:'6px',focused:true},label+' single search frame');
}
async function nativeEscape(){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await settle()}
async function clickFindControl(selector,label){
 const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x-90,y:point.y+90});await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
 const hit=await evaluate(`new Promise((resolve,reject)=>{let count=0;const check=()=>{const tip=document.querySelector('#fbsdb-app-tooltip');if(tip?.textContent.includes(${JSON.stringify(label)})&&Number(getComputedStyle(tip).opacity)===1){const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),t=tip.getBoundingClientRect();resolve({owned:e.contains(document.elementFromPoint(${point.x},${point.y})),passive:getComputedStyle(tip).pointerEvents==='none',clear:t.bottom<=r.top||t.top>=r.bottom||t.right<=r.left||t.left>=r.right});return}if(++count>150){reject(Error('Tooltip did not settle: '+${JSON.stringify(label)}));return}setTimeout(check,30)};check()})`);
 assert.deepEqual(hit,{owned:true,passive:true,clear:true},label+' tooltip cannot cover or intercept its button');
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await settle();
}
async function findInteractions(theme){
 const sample='SELECT qa_find_token FROM dual;\nSELECT qa_find_token FROM dual;';
 const original=await evaluate(`(()=>{const e=window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())),sql=e.getValue();e.setValue(${JSON.stringify(sample)});e.setPosition({lineNumber:1,column:1});e.setScrollTop(0);return sql})()`);
 const before=await evaluate(`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())).getScrolledVisiblePosition({lineNumber:1,column:1}).top`);
 await evaluate(`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())).getAction('editor.action.startFindReplaceAction').run()`);await settle();
 const after=await evaluate(`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())).getScrolledVisiblePosition({lineNumber:1,column:1}).top`);assert.equal(after,before,theme+' Find/Replace must not push the gutter/text down');
 await evaluate(`(()=>{const e=document.querySelector('.find-widget textarea[aria-label="Find"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'qa_find_token');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await until(`document.querySelector('.find-widget .codicon-find-next-match').getAttribute('aria-disabled')==='false'`);await settle();
 await clickFindControl('.find-widget .codicon-find-next-match','Next Match');assert.equal(await evaluate(`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())).getSelection().startLineNumber`),2);
 await clickFindControl('.find-widget .codicon-find-previous-match','Previous Match');assert.equal(await evaluate(`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())).getSelection().startLineNumber`),1);
 await evaluate(`(()=>{const e=window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode()));e.setSelection(new window.monaco.Range(1,1,2,e.getModel().getLineMaxColumn(2)))})()`);await until(`document.querySelector('.find-widget .codicon-find-selection').getAttribute('aria-disabled')==='false'`);
 await clickFindControl('.find-widget .codicon-find-selection','Find in Selection');assert.equal(await evaluate(`document.querySelector('.find-widget .codicon-find-selection').getAttribute('aria-checked')`),'true');
 await clickFindControl('.find-widget .codicon-find-selection','Find in Selection');
 const query=await evaluate(`document.querySelector('.find-widget textarea[aria-label="Find"]').value`);
 await click('[aria-label="Manage connections"]');await until(`document.querySelector('.connection-library')`);
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.find-widget')).visibility`),'hidden',theme+' application dialogs must cover editor widgets');
 const managerHit=await evaluate(`(()=>{const e=document.querySelector('[aria-label="Close connection manager"]'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`);assert.equal(managerHit,true,'Editor overlays cannot intercept dialog controls');
 await click('[aria-label="Close connection manager"]');await settle();assert.equal(await evaluate(`getComputedStyle(document.querySelector('.find-widget')).visibility`),'visible');assert.equal(await evaluate(`document.querySelector('.find-widget textarea[aria-label="Find"]').value`),query,'Find state survives the dialog');
 await clickFindControl('.find-widget .codicon-widget-close','Close');await until(`!document.querySelector('.find-widget').classList.contains('visible')`);
 await evaluate(`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())).setValue(${JSON.stringify(original)})`);
}
async function monacoField(selector,theme){
 const state=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),box=e.closest('.monaco-inputbox');e.blur();const before=box.getBoundingClientRect();e.focus();const after=box.getBoundingClientRect(),a=getComputedStyle(e),b=getComputedStyle(box);return {innerBorder:a.borderWidth,innerOutline:a.outlineStyle,innerShadow:a.boxShadow,outerBorder:b.borderWidth,outerOutline:b.outlineStyle,outerShadow:b.boxShadow,radius:b.borderRadius,color:b.borderTopColor,sameSize:before.width===after.width&&before.height===after.height}})()`);
 const rgb=palettes[theme].tokens['--accent'].slice(1).match(/../g).map(v=>parseInt(v,16)).join(', ');
 assert.deepEqual(state,{innerBorder:'0px',innerOutline:'none',innerShadow:'none',outerBorder:'1px',outerOutline:'none',outerShadow:'none',radius:'6px',color:`rgb(${rgb})`,sameSize:true},theme+' '+selector+' must use one frame without focus layout changes');
}
try{
 await call('Page.enable');await until(`window.monaco?.editor.getEditors().length&&document.querySelector('.desktop-shell')`);storage=await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('fbsdb.')).map(k=>[k,localStorage.getItem(k)]))`);
 scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture})).identifier;
 await call('Page.reload');await until(`window.__uxFixture&&window.monaco?.editor.getEditors().length&&document.querySelector('.app-status')?.textContent.includes('UX fixture')`);
 for(const theme of ['default','dark','light']){
  await click('.ide-view-menu>button');await textClick('.view-categories button','Appearance');await input('[aria-label="Theme"]',theme);await escape();
  assert.equal(await evaluate(`document.documentElement.dataset.theme`),theme);
  await evaluate(`(()=>{const e=window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode()));e.setValue("-- theme comment\\nSELECT\\n'Theme text'\\n42\\nCOUNT\\n+\\nidentifier");e.setPosition({lineNumber:1,column:1})})()`);await settle();
  await until(`Array.from(document.querySelectorAll('.monaco-editor .view-lines span')).some(e=>e.textContent==='42')`);
  const syntax=await evaluate(`Array.from(document.querySelectorAll('.monaco-editor .view-lines span[class*="mtk"]')).map(e=>({text:e.textContent,color:getComputedStyle(e).color,italic:getComputedStyle(e).fontStyle}))`);
  for(const [text,key]of [['-- theme comment','comment'],['SELECT','keyword'],["'Theme text'",'string'],['42','number'],['COUNT','function'],['+','--muted'],['identifier','--foreground']]){
   const sample=syntax.find(e=>e.text.replace(/\s/g,' ').trim()===text);assert.ok(sample,JSON.stringify({theme,text,syntax}));
   const color=(key.startsWith('--')?palettes[theme].tokens[key]:palettes[theme].editor[key]).slice(1).match(/../g).map(v=>parseInt(v,16));assert.equal(sample.color,`rgb(${color.join(', ')})`,theme+' '+key);
  }
  await capture(theme,'Workbench / Monaco');
  await findInteractions(theme);
  await evaluate(`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())).getAction('editor.action.startFindReplaceAction').run()`);await until(`document.querySelector('.find-widget textarea[aria-label="Replace"]')`);await settle();
  await monacoField('.find-widget textarea[aria-label="Find"]',theme);await monacoField('.find-widget textarea[aria-label="Replace"]',theme);
  await evaluate(`(()=>{const e=document.querySelector('.find-widget textarea[aria-label="Find"]'),toggle=document.querySelector('.find-widget [aria-label^="Use Regular Expression"]');if(toggle.getAttribute('aria-checked')!=='true')toggle.click();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'[');e.dispatchEvent(new Event('input',{bubbles:true}));e.focus()})()`);await until(`document.querySelector('.find-widget .monaco-inputbox.error')`);
  const invalidFrame=await evaluate(`(()=>{const e=document.querySelector('.find-widget textarea[aria-label="Find"]'),a=getComputedStyle(e),b=getComputedStyle(e.closest('.monaco-inputbox'));return {inner:a.borderWidth,outer:b.borderWidth,outline:b.outlineStyle,shadow:b.boxShadow,color:b.borderTopColor}})()`);
  const danger=palettes[theme].tokens['--danger'].slice(1).match(/../g).map(v=>parseInt(v,16));assert.deepEqual(invalidFrame,{inner:'0px',outer:'1px',outline:'none',shadow:'none',color:`rgb(${danger.join(', ')})`},theme+' regex errors color the existing frame');
  await evaluate(`(()=>{const e=document.querySelector('.find-widget textarea[aria-label="Find"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.find-widget [aria-label^="Use Regular Expression"]').click()})()`);await settle();
  await nativeEscape();
  await evaluate(`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode())).getAction('editor.action.gotoLine').run()`);await until(`document.querySelector('.quick-input-widget input')`);await settle();await monacoField('.quick-input-widget input',theme);await nativeEscape();
  await click('.ide-file-menu>button');await capture(theme,'File menu');await escape();
  await click('.ide-view-menu>button');for(const category of ['Panels','Layout','Appearance']){await textClick('.view-categories button',category);await capture(theme,'View '+category)}await escape();
  await click('[aria-label="Settings"]');await until(`document.querySelector('.settings-frame')`);
  for(const category of ['Appearance','Style','Completion','Formatter','Shortcuts','Connections','Oracle session / NLS','Results Table View','Export','Accessibility','Privacy']){await textClick('[aria-label="Settings categories"] button',category);await capture(theme,'Settings '+category)}
  await textClick('.appearance-footer button','Done');
  await click('[aria-label="SQL snippets"]');await searchFrame('Search SQL snippets');await capture(theme,'SQL snippets');await click('[aria-label="Close SQL snippets"]');
  await click('[aria-label="History"]');await searchFrame('Search query history');await capture(theme,'Query history');await click('[aria-label="Close query history"]');
  await click('[aria-label="Search workbench"]');await capture(theme,'Workbench search');await escape();
  await click('.connection-control');await capture(theme,'Connection picker');await escape();
  // An open body portal must immediately follow a theme change.
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="SQL snippets"]');e.focus();e.dispatchEvent(new FocusEvent('focusin',{bubbles:true}))})()`);await until(`document.querySelector('.app-tooltip')`);await settle();assert.equal(await evaluate(`document.querySelector('.app-tooltip').dataset.theme`),theme);await capture(theme,'Body tooltip');
  await evaluate(`document.activeElement.blur()`);await settle();
  console.log('AUDIT App',theme);
 }
 writeFileSync('.artifacts/theme-app-audit.json',JSON.stringify(report,null,2));
 const failures=report.flatMap(r=>r.failures.map(f=>({theme:r.theme,page:r.page,...f})));
 console.log(JSON.stringify(failures,null,2));assert.equal(failures.length,0,'App computed theme failures');
 assert.equal(await evaluate(`window.__uxFixture.commands.some(c=>['sql.execute','workspace.replace.apply','connection.save'].includes(c.command))`),false);
 console.log('PASS actual App, all settings categories, menus, tooltip and Monaco theme switching');
}finally{
 if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});
 let restoreId;if(storage)restoreId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:`for(const k of Object.keys(localStorage).filter(k=>k.startsWith('fbsdb.')))localStorage.removeItem(k);for(const [k,v]of Object.entries(${JSON.stringify(storage)}))localStorage.setItem(k,v)`})).identifier;
 await call('Page.reload');await until(`window.monaco?.editor.getEditors().length`).catch(()=>{});if(restoreId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:restoreId});socket.close();
}
