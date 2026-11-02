import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlSnippets} from '../src/liveTemplates.js';
test('live templates have unique triggers and include the PL/SQL skeletons',()=>{
 const triggers=sqlSnippets.map(snippet=>snippet.trigger);
 assert.equal(new Set(triggers).size,triggers.length);
 for(const trigger of ['proc','func','cursor','curfor','exc','raise','pkg','pkgb'])assert.ok(triggers.includes(trigger),trigger);
 assert.ok(sqlSnippets.every(snippet=>/^[a-z][a-z0-9_]{1,23}$/.test(snippet.trigger)&&snippet.label&&snippet.detail));
});
test('placeholders are well formed, numbered from 1 and reuse names consistently',()=>{
 for(const snippet of sqlSnippets){
  const stops=[...snippet.text.matchAll(/\$\{(\d+):([^}]*)\}/g)].map(match=>[Number(match[1]),match[2]]);
  assert.ok(stops.length,snippet.trigger);
  assert.equal(snippet.text.replace(/\$\{\d+:[^}]*\}/g,'').includes('${'),false,snippet.trigger);
  const numbers=[...new Set(stops.map(([n])=>n))].sort((a,b)=>a-b);assert.deepEqual(numbers,numbers.map((_,i)=>i+1),snippet.trigger);
  const names=new Map();for(const [n,name] of stops){if(names.has(n))assert.equal(names.get(n),name,`${snippet.trigger} \${${n}}`);names.set(n,name)}
 }
});
test('procedure template closes with its own name and a SQL*Plus terminator',()=>{
 const proc=sqlSnippets.find(snippet=>snippet.trigger==='proc').text.replace(/\$\{\d+:([^}]*)\}/g,'$1');
 assert.match(proc,/^CREATE OR REPLACE PROCEDURE procedure_name \(\n {4}p_id IN NUMBER\n\) IS\nBEGIN[\s\S]*END procedure_name;\n\/$/);
});
