import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutActions,loadPinned,pinStorageKey,savePinned,togglePinned} from '../src/gridBarLayout.js';
const memory=()=>{const data=new Map();return{getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,value)}};
test('outside edit mode only the actions that work there stay on the bar',()=>{
 assert.deepEqual(layoutActions({editMode:false}),{inline:['descriptions'],menu:[]});
});
test('in edit mode everything is in the menu and only pinned actions are also on the bar',()=>{
 const plain=layoutActions({editMode:true});
 assert.deepEqual(plain.inline,[]);assert.ok(plain.menu.includes('bulk')&&plain.menu.includes('tabAdds')&&plain.menu.includes('template'));
 const pinned=layoutActions({editMode:true,pinned:['bulk','paste']});
 assert.deepEqual(pinned.inline,['paste','bulk']);assert.ok(pinned.menu.includes('bulk'),'a pinned action stays in the menu so it can be unpinned');
});
test('a switched-on toggle is shown on the bar while it is on, and a pin never moves a menu-only action',()=>{
 assert.deepEqual(layoutActions({editMode:true,active:['changesOnly']}).inline,['changesOnly']);
 assert.deepEqual(layoutActions({editMode:true,active:['tabAdds','template'],pinned:['tabAdds']}).inline,[]);
});
test('unavailable actions are left out of both places',()=>{
 const result=layoutActions({editMode:true,hidden:['template']});
 assert.ok(!result.menu.includes('template'));
});
test('pinning toggles in catalog order and ignores unknown ids',()=>{
 let pinned=togglePinned([],'checks');pinned=togglePinned(pinned,'paste');
 assert.deepEqual(pinned,['paste','checks']);assert.deepEqual(togglePinned(pinned,'paste'),['checks']);
 assert.deepEqual(togglePinned(pinned,'tabAdds'),pinned);assert.deepEqual(togglePinned(pinned,'nope'),pinned);
});
test('the pinned set is stored and read back defensively',()=>{
 const storage=memory();savePinned(storage,['bulk']);assert.deepEqual(loadPinned(storage),['bulk']);
 storage.setItem(pinStorageKey,'{broken');assert.deepEqual(loadPinned(storage),[]);
 storage.setItem(pinStorageKey,JSON.stringify(['bulk','tabAdds','x']));assert.deepEqual(loadPinned(storage),['bulk']);
 assert.deepEqual(loadPinned(undefined),[]);
 assert.doesNotThrow(()=>savePinned({setItem(){throw new Error('full')}},['bulk']));
});
