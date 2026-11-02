import test from 'node:test';
import assert from 'node:assert/strict';
import {pruneSelection,selectTabs,selectionMenuItems} from '../src/tabSelection.js';
const order=['a','b','c','d','e'];
test('ctrl toggles and starts from the active tab; shift selects ranges; plain click clears',()=>{
 let state=selectTabs({order,active:'b'},'d',{ctrl:true});
 assert.deepEqual(state.selected,['b','d']);
 state=selectTabs({order,active:'b',...state},'c',{ctrl:true});assert.deepEqual(state.selected,['b','c','d']);
 state=selectTabs({order,active:'b',...state},'c',{ctrl:true});assert.deepEqual(state.selected,['b','d']);
 assert.deepEqual(selectTabs({order,active:'b',anchor:null},'d',{shift:true}).selected,['b','c','d']);
 const ranged=selectTabs({order,active:'a',selected:['a'],anchor:'a'},'c',{shift:true});assert.deepEqual(ranged.selected,['a','b','c']);
 assert.deepEqual(selectTabs({order,active:'a',selected:['a','b'],anchor:'a'},'e',{shift:true,ctrl:true}).selected,['a','b','c','d','e']);
 assert.deepEqual(selectTabs({order,active:'a',selected:['a','b']},'c').selected,[]);
 assert.deepEqual(selectTabs({order,selected:['a']},'zzz',{ctrl:true}).selected,['a']);
});
test('closed tabs are pruned and a single leftover tab is not a multi-selection',()=>{
 assert.deepEqual(pruneSelection(['a','c'],['a','b','c']),['a','c']);assert.deepEqual(pruneSelection(['a'],['a','b']),[]);
});
test('menu item expands package views and needs at least two tabs',()=>{
 assert.deepEqual(selectionMenuItems(['a']),[]);
 assert.deepEqual(selectionMenuItems(['a','b'],id=>id==='a'?['a','a-body']:[id]),[{label:'Close 2 selected tabs',ids:['a','a-body','b']}]);
});
