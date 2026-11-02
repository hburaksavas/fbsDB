import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeToolbarPrefs,toggleToolbarItem} from '../src/toolbarPrefs.js';
import {layoutToolbar} from '../src/editorToolbarModel.js';
import {resultToolbarLayout} from '../src/resultToolbarLayout.js';
test('preferences drop unknown, fixed and duplicate ids',()=>{
 assert.deepEqual(normalizeToolbarPrefs({editor:['save','save','nope'],result:['view','commands','pin']}),{editor:['save'],result:['pin']});
 assert.deepEqual(normalizeToolbarPrefs(null),{editor:[],result:[]});
});
test('toggling hides then restores an action and ignores fixed ones',()=>{
 const hidden=toggleToolbarItem(undefined,'editor','find');assert.deepEqual(hidden.editor,['find']);
 assert.deepEqual(toggleToolbarItem(hidden,'editor','find').editor,[]);
 assert.deepEqual(toggleToolbarItem(hidden,'result','view'),hidden);
});
test('hidden editor actions move to the overflow menu even when space is plentiful',()=>{
 const layout=layoutToolbar(2000,undefined,['find','save']);
 assert.ok(!layout.inline.some(item=>['find','save'].includes(item.id)));assert.ok(['find','save'].every(id=>layout.overflow.some(item=>item.id===id)));
 assert.ok(layoutToolbar(2000).inline.some(item=>item.id==='find'));
});
test('hidden result actions are listed as overflow actions',()=>{
 const groups=[[['view',0,'v'],['pin',0,'p'],['export',0,'e']]];
 const result=resultToolbarLayout(groups,99,['pin']);
 assert.ok(!result.visibleIds.has('pin'));assert.deepEqual(result.overflow.map(item=>item[0]),['pin']);
});
