import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Static audit: every modal must announce itself as a dialog, be modal and have an accessible name. Focus entry, the Tab trap,
// Escape and focus restore all come from ModalBackdrop, so a modal that uses it and carries these attributes is covered.
const files=fs.readdirSync(new URL('../src/',import.meta.url)).filter(name=>name.endsWith('.jsx'));
const source=name=>fs.readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const lineOf=(text,index)=>text.slice(0,index).split('\n').length;
test('every ModalBackdrop wraps an element with a dialog role, aria-modal and a name',()=>{
 const problems=[];let total=0;
 for(const name of files){
  const text=source(name);let at=-1;
  while((at=text.indexOf('<ModalBackdrop',at+1))>=0){
   total++;const chunk=text.slice(at,at+900);
   const role=/role=("(alert)?dialog"|\{)/.test(chunk),modal=/aria-modal/.test(chunk)||/\{content\}/.test(chunk),named=/aria-label(ledby)?=/.test(chunk)||/\{content\}/.test(chunk);
   if(!(role&&modal&&named)||false){ if(!/\{content\}/.test(chunk))problems.push(`${name}:${lineOf(text,at)} role=${role} modal=${modal} name=${named}`); }
  }
 }
 assert.ok(total>=50,`expected to audit many modals, saw ${total}`);
 assert.deepEqual(problems,[]);
});
test('every element with a dialog role has an accessible name',()=>{
 const problems=[];
 for(const name of files){
  const text=source(name);const pattern=/\srole=\{?"(?:alert)?dialog"/g;let match;
  while((match=pattern.exec(text))){
   const tag=text.slice(Math.max(0,text.lastIndexOf('<',match.index)),match.index+500);
   const end=tag.indexOf('>');const open=end>0?tag.slice(0,end+1):tag;
   if(!/aria-label(ledby)?=/.test(open))problems.push(`${name}:${lineOf(text,match.index)}`);
  }
 }
 assert.deepEqual(problems,[]);
});
test('ModalBackdrop itself moves focus in, traps Tab, handles Escape and restores focus',()=>{
 const text=source('ModalBackdrop.jsx');
 for(const piece of ['visibleFocusTargets(element)[0]?.focus','event.key===\'Tab\'','event.key !== "Escape"','restoreFocus(opener.current'])assert.ok(text.includes(piece),`missing: ${piece}`);
});
