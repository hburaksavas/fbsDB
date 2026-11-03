import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseHint,dismissHint,hintStorageKey,loadHintPrefs,saveHintPrefs} from '../src/editHints.js';
const base={editMode:true,editable:true};
const none={dismissed:[],off:false};
test('no tip outside edit mode, for a read-only result or while an Apply runs',()=>{
 assert.equal(chooseHint({...base,editMode:false}),null);
 assert.equal(chooseHint({...base,editable:false}),null);
 assert.equal(chooseHint({...base,applying:true}),null);
});
test('the tip follows the selection and what is staged',()=>{
 assert.equal(chooseHint(base).id,'select');
 assert.equal(chooseHint({...base,selectedCells:1,selectedRows:1}).id,'single');
 const multi=chooseHint({...base,selectedCells:12,selectedRows:3});
 assert.equal(multi.id,'multi');assert.match(multi.text,/12 cells selected.*Bulk edit/);
 const review=chooseHint({...base,selectedCells:1,selectedRows:1,pending:1});
 assert.equal(review.id,'review');assert.match(review.text,/1 change staged/);
 assert.match(chooseHint({...base,pending:3}).text,/3 changes staged/);
});
test('a dismissed tip is skipped, falling back to the next one that applies, and tips can be switched off',()=>{
 const prefs=dismissHint(none,'review');
 assert.equal(chooseHint({...base,selectedCells:1,selectedRows:1,pending:2},prefs).id,'single');
 assert.equal(chooseHint({...base,pending:2},prefs),null);
 assert.equal(chooseHint(base,{...none,off:true}),null);
 assert.equal(dismissHint(prefs,'review'),prefs);
});
test('tip preferences are stored and read back defensively',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 saveHintPrefs(storage,{dismissed:['single'],off:true});
 assert.deepEqual(loadHintPrefs(storage),{dismissed:['single'],off:true});
 data.set(hintStorageKey,'{broken');assert.deepEqual(loadHintPrefs(storage),{dismissed:[],off:false});
 data.set(hintStorageKey,JSON.stringify({dismissed:[1,'a'],off:'yes'}));assert.deepEqual(loadHintPrefs(storage),{dismissed:['a'],off:false});
 assert.deepEqual(loadHintPrefs(undefined),{dismissed:[],off:false});
 assert.doesNotThrow(()=>saveHintPrefs({setItem(){throw new Error('full')}},none));
});
