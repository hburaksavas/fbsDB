import test from 'node:test';
import assert from 'node:assert/strict';
import {tabPathLabels,nextQueryName} from '../src/tabPathLabels.js';
test('same-basename tabs use the shortest suffix while unrelated names stay compact',()=>{
 const tabs=[{id:'a',name:'q.sql',path:'C:/work/first/reports/q.sql'},{id:'b',name:'Q.sql',path:'C:\\work\\second\\reports\\Q.sql'},{id:'c',name:'other.sql',path:'C:/work/other.sql'}];
 const labels=tabPathLabels(tabs);assert.equal(labels.get('a'),'first/reports');assert.equal(labels.get('b'),'second/reports');assert.equal(labels.has('c'),false);
 assert.equal(tabPathLabels(tabs.slice(0,1)).size,0);
});
test('same-file views use ordinals without inventing source or copy labels',()=>{
 const tabs=[{id:'a',name:'q.sql',path:'C:/work/q.sql'},{id:'b',name:'q.sql',path:'c:/WORK/q.sql'},{id:'draft',name:'q.sql'},{id:'server',name:'q.sql',readOnly:true}];
 const labels=tabPathLabels(tabs);assert.equal(labels.has('a'),false);assert.equal(labels.get('b'),'(2)');assert.equal(labels.has('draft'),false);assert.equal(labels.has('server'),false);
});
test('same-name independent queries get only a numeric disambiguator',()=>{
 assert.deepEqual([...tabPathLabels([{id:'a',name:'q.sql'},{id:'b',name:'q.sql'}])],[['b','(2)']]);
});
test('query names advance past existing unsaved queries',()=>{
 assert.equal(nextQueryName([]),'Query 1');
 assert.equal(nextQueryName([{name:'Query 1'},{name:'Query 4'},{name:'Query 100',path:'C:/Query 100'}]),'Query 5');
});
