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
async function key(key,modifiers=0){await call('Input.dispatchKeyEvent',{type:'keyDown',key,text:key==='Enter'?'\r':undefined,code:key===' '?'Space':key,windowsVirtualKeyCode:{' ':32,Enter:13,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38}[key]||(/^F\d+$/.test(key)?111+Number(key.slice(1)):key.toUpperCase().charCodeAt(0)),modifiers});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
const editor=`window.monaco.editor.getEditors().find(e=>document.contains(e.getDomNode()))`;
const fixture=nativeUxFixture;







const extraFixture=`(()=>{
 localStorage.removeItem('fbsdb.objectFavorites');
 const base=chrome.webview.postMessage, state={hold:false,pending:[],error:false,copied:[],objects:[]};window.__objectFixture=state;
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>state.copied.push(text)}});
 chrome.webview.postMessage=value=>{base(value);const m=JSON.parse(value),p=m.payload||{},reply=data=>setTimeout(()=>__uxFixture.emit({...data,requestId:m.id,tabId:m.tabId,epoch:p.epoch}),10);
  const columns=[{name:'ID',type:'NUMBER',writable:true,primaryKey:p.name!=='NO_PK',nullable:false,indexed:true},{name:'NAME',type:'VARCHAR2',writable:true,primaryKey:false,nullable:true,indexed:false}];
  if(m.command==='schema.objectDetails')reply({type:'schema.object',item:{owner:p.owner,name:p.name,type:p.objectType,columns,details:[{name:'Status',value:'VALID'}],targetOwner:'APP',targetName:'TBL'}});
  if(!m.command?.startsWith('completion.')||m.command==='completion.cancel')return;
  let result={owner:p.owner,name:p.name,type:p.objectType,columns,members:p.objectType==='PACKAGE'?[{name:'RUN',subprogramId:1,parameters:[]},{name:'RUN',subprogramId:2,parameters:[{name:'P_ID',type:'NUMBER',mode:'IN'}]}]:[{name:p.name,subprogramId:1,parameters:[{name:'P_ID',type:'NUMBER',mode:'IN'}],returnType:p.objectType==='FUNCTION'?'NUMBER':null}],targetOwner:'APP',targetName:'TBL',foreignKeys:[{owner:'APP',table:'CHILD',name:'FK_CHILD',column:'PARENT_ID',targetOwner:'APP',targetTable:'TBL',targetColumn:'ID',position:1}]};
  if(m.command==='completion.definition'){
   const stored={PACKAGE:p.body?'PACKAGE BODY PKG AS PROCEDURE RUN IS BEGIN NULL; END; END;':'PACKAGE PKG AS PROCEDURE RUN; END;',PROCEDURE:'PROCEDURE PROC(p_id NUMBER) IS BEGIN NULL; END;',FUNCTION:'FUNCTION FUNC RETURN NUMBER IS BEGIN RETURN 1; END;',TYPE:'TYPE TYP AS OBJECT(id NUMBER);',TRIGGER:'TRIGGER TRG BEFORE INSERT ON TBL BEGIN NULL; END;'};
   result={owner:p.owner,name:p.name,type:p.objectType,text:stored[p.objectType]||'CREATE TABLE "APP"."'+p.name+'" ("ID" NUMBER);'};
  }
  if(m.command==='completion.objectAnalysis')result={owner:p.owner,name:p.name,type:p.objectType,ddl:'DDL',grants:[],dependencies:[],impact:[]};
  if(m.command==='completion.objectDraftMetadata')result={owner:p.owner,name:p.name,columns};
  const finish=()=>reply(state.error&&m.command==='completion.definition'?{type:'completion.reply',error:'ORA-31603: object metadata is not accessible'}:{type:'completion.reply',result});
  if(state.hold&&m.command==='completion.definition')state.pending.push(finish);else finish();
 };
})()`;
let scriptId;
const keyFor=(type,name)=>`[data-object-key=${JSON.stringify('APP.'+type+'.'+name)}]`;
async function context(type,name,keyboard=false){const selector=keyFor(type,name);await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing object');e.focus();${keyboard?'':"e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:220,clientY:180}))"}})()`);if(keyboard)await key('F10',8);await until(`document.querySelector('.oracle-object-menu')`)}
async function choose(text){await textClick('.oracle-object-menu button',text)}
async function returnToOrigin(){await click('[data-editor-tab="tab-1"] [role="tab"]');await until(`document.querySelector('.oracle-schema-node')`);await evaluate(`document.querySelectorAll('.oracle-object-tree details').forEach(e=>e.open=true)`);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await evaluate(`document.querySelectorAll('.oracle-object-tree details').forEach(e=>e.open=true)`);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
try{
 await call('Page.enable');await call('Runtime.enable');scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:nativeUxFixture+';\n'+extraFixture})).identifier;
 await call('Page.reload');await until(`window.__objectFixture&&window.monaco?.editor.getEditors().length&&document.querySelector('.app-status')?.textContent.includes('UX fixture')`);await evaluate('new Promise(r=>setTimeout(r,150))');
 await evaluate(`__uxFixture.emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV'},serverVersion:'23'})`);
 const objects=Object.entries({TABLE:'TBL',VIEW:'VW', 'MATERIALIZED VIEW':'MV',SYNONYM:'SYN',PACKAGE:'PKG',PROCEDURE:'PROC',FUNCTION:'FUNC',TRIGGER:'TRG',SEQUENCE:'SEQ',INDEX:'IDX',CONSTRAINT:'CONS',TYPE:'TYP','DATABASE LINK':'LINK'}).map(([type,name])=>({owner:'APP',type,name,columns:[],...(type==='SYNONYM'?{targetOwner:'APP',targetName:'TBL'}:{})}));objects.push({owner:'APP',name:'NO_PK',type:'TABLE',columns:[]});
 await evaluate(`__objectFixture.objects=${JSON.stringify(objects)};__uxFixture.emit({type:'schema.loaded',tabId:'tab-1',schema:'APP',objects:__objectFixture.objects})`);
 await until(`document.querySelector('.oracle-schema-node>summary')`);await click('.oracle-schema-node>summary');await evaluate(`document.querySelectorAll('.oracle-category-node').forEach(e=>e.open=true)`);await until(`document.querySelector(${JSON.stringify(keyFor('TABLE','TBL'))})`);
 await evaluate(`${editor}.setValue('SELECT 42 FROM dual;')`);
 for(let i=0;i<3;i++){
  await click('[aria-label="Settings"]');await textClick('[aria-label="Settings categories"] button','Appearance');await click(`.theme-choice:nth-child(${i+1})`);await key('Escape');
  for(const object of objects){
   const before=await evaluate(`__uxFixture.commands.length`);await context(object.type,object.name,true);
   assert.equal(await evaluate(`document.querySelector('.oracle-object-menu').dataset.theme`),['default','dark','light'][i]);
   assert.equal(await evaluate(`__uxFixture.commands.length`),before,'Opening a menu must not load or execute anything');
   await key('Escape');assert.equal(await evaluate(`document.activeElement?.dataset.objectKey`),'APP.'+object.type+'.'+object.name);
  }
  console.log('PASS typed menus/Shift+F10/Escape without requests, theme',i);
 }
 await context('TABLE','TBL');await choose('Copy');await choose('Qualified name');await until(`!document.querySelector('.oracle-object-menu')`);assert.equal(await evaluate(`__objectFixture.copied.at(-1)`),'"APP"."TBL"');
 await context('TABLE','TBL');await choose('Add to favorites');await context('TABLE','TBL');assert.ok(await evaluate(`document.querySelector('.oracle-object-menu').textContent.includes('Remove from favorites')`));await key('Escape');
 await evaluate(`__objectFixture.editor=${editor};true`);await context('TABLE','TBL');await choose('Columns');await until(`document.querySelector('[aria-label="Object inspector tabs"] [aria-selected=true]')?.textContent==='Columns'`);assert.equal(await evaluate(`__objectFixture.editor===${editor}`),true);await click('[aria-label="Close object inspector"]');
 await context('TABLE','TBL');await choose('Related tables');await until(`document.querySelector('.oracle-dependency-list')?.textContent.includes('APP.CHILD')`);await click('[aria-label="Close object inspector"]');
 await context('TABLE','TBL');await choose('Generate SQL');await key('Escape');assert.ok(await evaluate(`document.querySelector('.oracle-object-menu').textContent.includes('Open details')`));await key('Escape');
 await context('TABLE','TBL');await choose('Generate SQL');await choose('UPDATE template');await until(`${editor}.getValue().startsWith('UPDATE')`);
 assert.ok(await evaluate(`${editor}.getValue().includes('WHERE "ID" = :p1')`));
 await returnToOrigin();assert.equal(await evaluate(`${editor}.getValue()`),'SELECT 42 FROM dual;');
 await context('TABLE','NO_PK');await choose('Generate SQL');await choose('MERGE template');await until(`document.querySelector('.feedback-stack .feedback-notification[data-kind=error]:last-child')`);assert.match(await evaluate(`document.querySelector('.feedback-stack .feedback-notification[data-kind=error]:last-child').textContent`),/primary key/);await key('Escape');await key('Escape');
 await context('PACKAGE','PKG');await choose('Generate SQL');await choose('Call member…');await until(`document.querySelector('.oracle-object-menu').textContent.includes('RUN (P_ID IN NUMBER)')`);await choose('RUN (P_ID IN NUMBER)');await until(`${editor}.getValue().includes('"APP"."PKG"."RUN"')`);await returnToOrigin();
 console.log('PASS typed inspector, copy/favorites, composite-safe UPDATE and package overload draft');
 await context('SYNONYM','SYN');await choose('Go to target');await until(`document.querySelector('.oracle-object-inspector>header').textContent.includes('TBL')`);await click('[aria-label="Close object inspector"]');
 await context('TABLE','TBL');await choose('Refresh metadata');await until(`!document.querySelector('.oracle-object-menu')`);
 await evaluate(`__objectFixture.error=true`);await context('VIEW','VW');await choose('DDL');await choose('Open in editor');await until(`document.querySelector('.feedback-stack .feedback-notification[data-kind=error]:last-child')`);assert.match(await evaluate(`document.querySelector('.feedback-stack .feedback-notification[data-kind=error]:last-child').textContent`),/ORA-31603/);await key('Escape');await key('Escape');
 await evaluate(`__objectFixture.error=false`);await context('VIEW','VW');await choose('Refresh metadata');
 await context('TABLE','TBL');await choose('DDL');await choose('Save as…');await until(`__uxFixture.commands.some(c=>c.command==='file.save')`);const saved=await evaluate(`__uxFixture.commands.find(c=>c.command==='file.save')`);assert.notEqual(saved.tabId,'tab-1');assert.ok(saved.payload.content.includes('"APP"."TBL"'));await returnToOrigin();
 console.log('PASS target navigation, metadata refresh, permission errors and DDL Save As in a separate draft');
 // Dismissed asynchronous metadata must never open an orphan SQL tab.
 await evaluate(`__objectFixture.hold=true`);const tabs=await evaluate(`document.querySelectorAll('.file-tab').length`);
 await context('VIEW','VW');await choose('DDL');await choose('Open in editor');await until(`__objectFixture.pending.length>0`);await key('Escape');await key('Escape');await evaluate(`__objectFixture.hold=false;__objectFixture.pending.splice(0).forEach(f=>f())`);await evaluate('new Promise(r=>setTimeout(r,60))');assert.equal(await evaluate(`document.querySelectorAll('.file-tab').length`),tabs);
 await context('VIEW','VW');await choose('DDL');await choose('Open in editor');await until(`${editor}.getValue().includes('CREATE TABLE "APP"."VW"')`);await returnToOrigin();
 // A tab switch also cancels an in-flight source action.
 await evaluate(`__objectFixture.hold=true`);await context('PROCEDURE','PROC');await choose('Source / DDL');await choose('Open in editor');await until(`__objectFixture.pending.length>0`);
 await click('[aria-label="New SQL file"]');const active=await evaluate(`document.querySelector('.file-tab.active').dataset.editorTab`);
 await evaluate(`__objectFixture.hold=false;__objectFixture.pending.splice(0).forEach(f=>f())`);await evaluate('new Promise(r=>setTimeout(r,60))');assert.equal(await evaluate(`document.querySelector('.file-tab.active').dataset.editorTab`),active);
 assert.equal(await evaluate(`${editor}.getValue()`),'');
 // New SQL file normally inherits a profile; menu generation itself does not connect or execute.
 assert.equal(await evaluate(`__uxFixture.commands.some(c=>c.command==='sql.execute'||c.command==='transaction.commit')`),false);
 assert.ok(await evaluate(`__uxFixture.commands.filter(c=>c.command==='completion.objectDraftMetadata').every(c=>c.tabId==='tab-1'&&c.payload.tabId==='tab-1')`));
 await returnToOrigin();await evaluate(`__objectFixture.hold=true`);const beforeReconnect=await evaluate(`document.querySelectorAll('.file-tab').length`);
 await context('FUNCTION','FUNC');await choose('Source / DDL');await choose('Open in editor');await until(`__objectFixture.pending.length>0`);
 await evaluate(`__uxFixture.emit({type:'connection.connected',tabId:'tab-1',profile:{id:'UX_DEV'},serverVersion:'23'})`);await until(`!document.querySelector('.oracle-object-menu')`);
 await evaluate(`__objectFixture.hold=false;__objectFixture.pending.splice(0).forEach(f=>f())`);await evaluate('new Promise(r=>setTimeout(r,60))');assert.equal(await evaluate(`document.querySelectorAll('.file-tab').length`),beforeReconnect);
 assert.deepEqual(errors,[]);console.log('PASS metadata origin, missing-PK handling, cancelled source actions, dirty-buffer preservation and no SQL execution');
}finally{if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});socket.close()}
