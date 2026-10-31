// Real native WebView2: production CSS, isolated React surfaces, computed colors,
// and actual WinUI title/caption brushes. No screenshots or Oracle operations.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';
import {productionStyles} from './productionStyles.mjs';
import palettes from '../src/themePalettes.json' with {type:'json'};
const endpoint=process.argv[2]||'http://127.0.0.1:9339';
let target;for(let i=0;i<100;i++){try{target=(await(await fetch(endpoint+'/json/list')).json()).find(t=>t.type==='page'&&t.url.startsWith('https://fbsdb.local/'));if(target)break}catch{}await new Promise(r=>setTimeout(r,100))}
assert.ok(target,'Native fbsDB WebView2 required');
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const inner=code=>evaluate(`document.getElementById('theme-qa').contentWindow.eval(${JSON.stringify(code)})`);
const settle=()=>inner('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))).then(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))))');
async function forceControls(){
 const {root}=await call('DOM.getDocument',{depth:-1,pierce:true});
 const find=n=>n.nodeName==='IFRAME'&&n.attributes?.includes('theme-qa')?n:(n.children||[]).map(find).find(Boolean);
 const doc=find(root)?.contentDocument;assert.ok(doc,'Fixture document');
 const {nodeIds}=await call('DOM.querySelectorAll',{nodeId:doc.nodeId,selector:'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a,[tabindex="0"]'});
 await Promise.all(nodeIds.map(nodeId=>call('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover','focus-visible']})));
}
async function wait(code){for(let i=0;i<100;i++){if(await inner(`Boolean(${code})`))return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out '+code)}
const stub=`const listeners=new Set();let id=0;export const isNativeHost=true;export const setNativeTabId=()=>{};export const subscribeNativeMessages=f=>{listeners.add(f);return()=>listeners.delete(f)};export const notifyUiReady=()=>{};export function sendNativeCommand(command,payload={}){const requestId='fixture-'+(++id);setTimeout(()=>{for(const f of listeners)f({type:'workspace.tools.list',requestId,root:payload.root,catalog:{tools:[],errors:[]}})},10);return requestId}`;
const bundle=await build({entryPoints:['tests/themeGallery.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-native',setup(b){b.onResolve({filter:/nativeBridge$/},()=>({path:'bridge',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js'}))}}]});
const html=`<!doctype html><style>${productionStyles()}\nhtml,body,#root{width:100%;height:100%;margin:0;min-width:0!important}.theme-fixture{position:relative}.theme-fixture>.result-hover-popover{position:relative;inset:auto}.theme-fixture>.oracle-object-inspector{height:800px}.theme-fixture .editor-toolbar-overflow{display:block!important}</style><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`;

// Canvas is used solely as a CSS color parser (including color(srgb)/color-mix),
// never to capture an application surface or image.
import {themeContrastAudit as audit} from './themeContrastAudit.mjs';

const pages=['appearance','profile','tns','bind','diagnostics','drafts','script','object-DDL','object-Grants','object-Dependencies','object-Impact',...['Overview','Columns','Constraints','Indexes','Definition','Grants','Dependencies','Impact'].map(p=>'inspector-'+p),'definition','plan','plan-error',...['results','export','accessibility','privacy'].map(p=>'settings-'+p),'completion','tns-settings','calculated',...['copy','load','export','sql','lookup','filters-advanced'].map(p=>'action-'+p),'pivot','value-raw','value-json','value-xml','column-format','toolbar','tools','git','replace','palette','explorer','connection',...['disconnected','connecting','inactive','disabled','pending','prod','test','uat','open'].map(p=>'connection-'+p),'library','library-new','library-empty','library-folder','library-locked','context-profile','context-live','context-folder','context-background','context-groups','context-move','problems','overflow'];
const report=[];
try{
 await call('DOM.enable');await call('CSS.enable');
 await evaluate(`(()=>{document.getElementById('theme-qa')?.remove();const f=document.createElement('iframe');f.id='theme-qa';f.style.cssText='position:fixed;left:-10000px;top:0;width:1280px;height:1000px;border:0';f.srcdoc=${JSON.stringify(html)};document.body.appendChild(f)})()`);
 await wait('window.themeGallery');
 for(const theme of Object.keys(palettes)){
  await inner(`window.themeGallery.setTheme(${JSON.stringify(theme)})`);await settle();
  for(const page of pages){
   await inner(`window.themeGallery.show(${JSON.stringify(page)})`);await settle();
   if(page.startsWith('object-')&&page!=='object-DDL')await inner(`Array.from(document.querySelectorAll('.oracle-object-tabs button')).find(e=>e.textContent===${JSON.stringify(page.slice(7))})?.click()`);
   if(page.startsWith('value-')&&page!=='value-raw')await inner(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(page==='value-json'?'JSON':'XML')})?.click()`);
   if(page==='context-groups'||page==='context-move')await inner(`Array.from(document.querySelectorAll('.connection-context-menu button')).find(e=>e.textContent.trim()===${JSON.stringify(page==='context-groups'?'Group labels':'Move to folder')})?.click()`);
   if(page==='library-folder')await inner(`Array.from(document.querySelectorAll('.connection-folder-row')).find(e=>e.textContent==='Finance').click()`);
   if(page==='overflow'){await inner(`document.querySelector('[aria-label="More editor actions"]').click()`);await wait(`document.querySelector('.editor-overflow-menu')`)}
   if(page==='tools'){await inner(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Save SELECT as tool').click()`);await wait(`document.querySelector('.mini-tool-fields input')`)}
   await inner(`document.querySelectorAll('details').forEach(e=>e.open=true)`);
   await settle();const result=await inner(audit);report.push({theme,page,...result});
   assert.deepEqual(result.errors,[],theme+'/'+page+' runtime errors');
   await forceControls();await settle();report.push({theme,page:page+' hover/focus',...await inner(audit)});
  }
  // Portals stay open while changing palettes; they cannot retain copied colors.
  const next=theme==='default'?'dark':theme==='dark'?'light':'default';
  await inner(`window.themeGallery.setTheme(${JSON.stringify(next)})`);await settle();
  assert.equal(await inner(`document.querySelector('.editor-overflow-menu').dataset.theme`),next);
  report.push({theme:next,page:'open overflow theme change',...await inner(audit)});
  await inner(`document.querySelector('[data-trigger]').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))`);await wait(`document.querySelector('.app-tooltip')`);await settle();
  await inner(`window.themeGallery.setTheme(${JSON.stringify(theme)})`);await settle();
  assert.equal(await inner(`document.querySelector('.app-tooltip').dataset.theme`),theme);
  report.push({theme,page:'open tooltip theme change',...await inner(audit)});
  // Test native chrome using the same command sent by App's theme effect.
  const reply=await evaluate(`new Promise((resolve,reject)=>{const id='theme-audit-${theme}';const listener=e=>{let m=e.data;if(typeof m==='string')m=JSON.parse(m);if(m.type==='ui.theme'&&m.requestId===id){chrome.webview.removeEventListener('message',listener);resolve(m)}};chrome.webview.addEventListener('message',listener);chrome.webview.postMessage(JSON.stringify({type:'command',id,tabId:document.querySelector('.file-tab.active')?.dataset.editorTab||'tab-1',command:'ui.setTheme',payload:{theme:${JSON.stringify(theme)}}}));setTimeout(()=>reject(Error('Native theme reply timeout')),5000)})`);
  assert.equal(reply.theme,theme);assert.ok(!reply.error,reply.error);
  const t=palettes[theme].tokens;assert.deepEqual(reply.chrome,{requestedTheme:theme==='light'?'Light':'Dark',background:t['--bg'],titleBar:t['--chrome'],foreground:t['--foreground'],captionBackground:t['--chrome'],captionForeground:t['--foreground']});
  report.push({theme,native:reply});
  console.log('AUDIT',theme,pages.length,'surfaces',report.filter(r=>r.theme===theme).reduce((n,r)=>n+(r.samples||0),0),'text/icon samples');
 }
 writeFileSync('.artifacts/theme-native-audit.json',JSON.stringify(report,null,2));
 const failures=report.flatMap(r=>(r.failures||[]).map(f=>({theme:r.theme,page:r.page,...f})));
 console.log(JSON.stringify(failures,null,2));assert.equal(failures.length,0,'Computed contrast failures; see .artifacts/theme-native-audit.json');
 console.log('PASS three themes, all gallery surfaces, controls, menus and native chrome');
}finally{await evaluate(`document.getElementById('theme-qa')?.remove()`);socket.close()}
