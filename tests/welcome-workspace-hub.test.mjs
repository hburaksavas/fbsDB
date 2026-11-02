import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
async function load(){
 const output=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {WelcomeWorkspaceHub,welcomeWorkspaceLists,workspaceTemplates} from './src/WelcomeWorkspaceHub.jsx';
 export {welcomeWorkspaceLists,workspaceTemplates};export const render=props=>renderToStaticMarkup(<WelcomeWorkspaceHub {...props}/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',logLevel:'silent'});
 const module={exports:{}};globalThis.window??={};new Function('module','exports','require',output.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
 return module.exports;
}
test('welcome hub separates pinned and recent workspaces by last opened time with bounded lists',async()=>{
 const {welcomeWorkspaceLists}=await load();
 const catalog=[{id:'old',path:'D:/old',pinned:true,lastOpened:'2026-01-01'},{id:'new',path:'D:/new',pinned:true,lastOpened:'2026-10-01'},...Array.from({length:10},(_,index)=>({id:`r${index}`,path:`D:/r${index}`,lastOpened:`2026-09-${String(index+1).padStart(2,'0')}`}))];
 const lists=welcomeWorkspaceLists({catalog});
 assert.deepEqual(lists.pinned.map(item=>item.id),['new','old']);
 assert.equal(lists.recent.length,8);assert.equal(lists.recent[0].id,'r9');assert.ok(lists.recent.every(item=>!item.pinned));
 assert.deepEqual(welcomeWorkspaceLists({recent:['D:\\work\\billing']}).recent.map(item=>item.name),['billing']);
 assert.deepEqual(welcomeWorkspaceLists({}),{pinned:[],recent:[]});
});
test('welcome hub renders unavailable/active destinations as disabled and offers every template without a host',async()=>{
 const {render,workspaceTemplates}=await load();
 const html=render({workspace:{catalog:[{id:'a',name:'Active project',path:'D:/a',available:true,active:true},{id:'m',name:'Missing project',path:'D:/m',available:false,pinned:true}]},startup:true});
 assert.match(html,/Active project/);assert.match(html,/Missing project/);assert.match(html,/Unavailable/);assert.match(html,/>Active</);
 for(const template of workspaceTemplates)assert.match(html,new RegExp(`disabled="" aria-label="Create ${template.name}"`));
 assert.match(html,/checked/);
 assert.match(render({workspace:{}}),/No pinned workspaces yet/);
});
