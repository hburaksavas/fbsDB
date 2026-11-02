import test from 'node:test';
import assert from 'node:assert/strict';
import {floatingToolbarEnabled,floatingToolbarPlacement,setFloatingToolbarEnabled} from '../src/floatingSelectionToolbar.js';
const container={left:100,top:50,width:600,height:300,bottom:350};
const toolbar={width:200,height:28};
test('toolbar sits below the focused cell, right-aligned and clamped inside the grid',()=>{
 assert.deepEqual(floatingToolbarPlacement({left:300,right:420,top:100,bottom:124},container,toolbar),{left:120,top:78});
 assert.deepEqual(floatingToolbarPlacement({left:100,right:150,top:100,bottom:124},container,toolbar),{left:4,top:78});
 assert.deepEqual(floatingToolbarPlacement({left:600,right:900,top:100,bottom:124},container,toolbar),{left:396,top:78});
});
test('toolbar flips above near the bottom and hides when the cell is scrolled away',()=>{
 assert.deepEqual(floatingToolbarPlacement({left:300,right:420,top:320,bottom:344},container,toolbar),{left:120,top:238});
 assert.equal(floatingToolbarPlacement({left:300,right:420,top:400,bottom:424},container,toolbar),null);
 assert.equal(floatingToolbarPlacement(null,container,toolbar),null);
});
test('dismissal preference is optional and survives unavailable storage',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 assert.equal(floatingToolbarEnabled(storage),true);setFloatingToolbarEnabled(storage,false);assert.equal(floatingToolbarEnabled(storage),false);setFloatingToolbarEnabled(storage,true);assert.equal(floatingToolbarEnabled(storage),true);
 const broken={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};
 assert.equal(floatingToolbarEnabled(broken),true);assert.doesNotThrow(()=>setFloatingToolbarEnabled(broken,false));
});
