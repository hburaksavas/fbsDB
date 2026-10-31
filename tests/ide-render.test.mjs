import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

test('workbench and IDE dialogs render with disconnected session and explicit command states',async()=>{
  const output=await build({stdin:{contents:`
    import React from 'react';import {renderToString} from 'react-dom/server';
    import {App} from './src/App.jsx';
    import {IdeCommandPalette} from './src/IdeCommandPalette.jsx';
    import {OracleObjectDialog} from './src/OracleObjectDialog.jsx';
    import {WorkspaceDevelopmentDialog} from './src/WorkspaceDevelopmentDialog.jsx';
    import {ConnectionDiagnosticsDialog} from './src/ConnectionDiagnosticsDialog.jsx';
    import {ResultToolbar} from './src/ResultToolbar.jsx';
    import {SqlScriptDialog} from './src/SqlScriptDialog.jsx';
    export const object=renderToString(<OracleObjectDialog state={{target:{owner:'APP',name:'T',type:'TABLE'},data:{ddl:'CREATE TABLE T (N NUMBER)',grants:[],dependencies:[],impact:[]}}} onClose={()=>{}} onDefinition={()=>{}} onNavigate={()=>{}}/>);
    export const replacement=renderToString(<WorkspaceDevelopmentDialog mode="replace" state={{preview:{id:'review',files:[{path:'C:/t.sql',relativePath:'t.sql',before:'SELECT 1 FROM dual;',after:'SELECT 2 FROM dual;'}],skipped:[]}}} files={[]} onClose={()=>{}} onPreview={()=>{}} onApply={()=>{}} onInvalidate={()=>{}}/>);
    export const diagnostics=renderToString(<ConnectionDiagnosticsDialog report={{success:false,steps:[{stage:'Authentication',status:'Failed',message:'ORA-01017',elapsedMs:5}]}} onClose={()=>{}}/>);
    export const toolbar=renderToString(<ResultToolbar onAction={()=>{}}/>);
    export const html=renderToString(<App/>);
    export const palette=renderToString(<IdeCommandPalette mode="commands" files={[]} objects={[]} connections={[]} outline={[]} commands={[{id:'run',label:'Run SQL',disabled:true}]} onClose={()=>{}} onChoose={()=>{}}/>);
    export const script=renderToString(<SqlScriptDialog source="CREATE TABLE t(x NUMBER); SELECT :x FROM dual;" run={null} timeout={0} onTimeout={()=>{}} onStart={()=>{}} onCancel={()=>{}} onClose={()=>{}} disabled={true}/>);
  `,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',logLevel:'silent',banner:{js:`globalThis.window={innerHeight:900,chrome:{webview:{postMessage(){}}}};globalThis.document={activeElement:null};globalThis.localStorage={getItem(){return null},setItem(){}};`}});
  const module={exports:{}};
  new Function('module','exports','require',output.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
  assert.match(module.exports.html,/Disconnected/);
  assert.match(module.exports.html,/Open Editors/);
  assert.match(module.exports.html,/aria-label="Application menu"/);
  assert.match(module.exports.html,/Open workspace/);
  assert.match(module.exports.html,/class="status-intellisense saved-state editor-save-button"[^>]*aria-label="Save SQL file \(Ctrl\+S\)"/);
  assert.doesNotMatch(module.exports.html.match(/<div class="editor-tabs-actions">([\s\S]*?)<\/div>/)?.[1] || '',/Save SQL file/);
  assert.doesNotMatch(module.exports.html,/>SQL FILES</);
  assert.match(module.exports.html.replace(/<!--.*?-->/g,''),/Ln 1, Col 1/);
  assert.match(module.exports.palette,/aria-disabled="true"/);
  // The DDL warning is now an explicit confirmation opened by Run script;
  // native feedback tests verify the guard before any execution request.
  assert.match(module.exports.script,/CREATE TABLE t/);
  assert.match(module.exports.script,/SQL script preview/);
  assert.match(module.exports.object,/CREATE TABLE T/);
  assert.match(module.exports.replacement,/SELECT 2 FROM dual/);
  assert.match(module.exports.diagnostics,/Authentication/);
  assert.match(module.exports.toolbar,/aria-label="Fetch and export"/);
  assert.match(module.exports.toolbar,/aria-label="Pivot options"/);
});
