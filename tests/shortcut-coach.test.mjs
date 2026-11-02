import test from 'node:test';
import assert from 'node:assert/strict';
import {dismissShortcutHint,isShortcutText,nextShortcutHint,resetShortcutHints,shortcutCoachStorageKey} from '../src/shortcutCoach.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values}};
test('only real shortcut texts produce hints',()=>{
 for(const text of ['Ctrl+Enter','Ctrl+Shift+O','Alt+O','Ctrl+Alt+PageDown','Shift+F12','Ctrl+/'])assert.equal(isShortcutText(text),true,text);
 for(const text of ['','Enter','Preferences','Ctrl+','Next startup'])assert.equal(isShortcutText(text),false,text);
});
test('hints appear at most three times, stop after dismissal and respect the setting',()=>{
 const storage=memory(),request={id:'run',label:'Run current SQL statement',shortcut:'Ctrl+Enter'};
 assert.equal(nextShortcutHint(storage,request).message,'Run current SQL statement: Ctrl+Enter');
 nextShortcutHint(storage,request);nextShortcutHint(storage,request);assert.equal(nextShortcutHint(storage,request),null);
 assert.ok(nextShortcutHint(storage,{...request,id:'format'}));dismissShortcutHint(storage,'format');assert.equal(nextShortcutHint(storage,{...request,id:'format'}),null);
 assert.equal(nextShortcutHint(storage,{...request,id:'other',enabled:false}),null);
 resetShortcutHints(storage);assert.equal(storage.values.has(shortcutCoachStorageKey),false);assert.ok(nextShortcutHint(storage,request));
});
test('coach tolerates unavailable storage',()=>{
 const broken={getItem(){throw new Error('x')},setItem(){throw new Error('x')},removeItem(){throw new Error('x')}};
 assert.ok(nextShortcutHint(broken,{id:'run',label:'Run',shortcut:'Ctrl+Enter'}));assert.doesNotThrow(()=>dismissShortcutHint(broken,'run'));assert.doesNotThrow(()=>resetShortcutHints(broken));
});
