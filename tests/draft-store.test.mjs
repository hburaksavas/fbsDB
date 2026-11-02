import test from 'node:test';
import assert from 'node:assert/strict';
import {clearAllStoredDrafts,columnsSignature,draftStoreKey,hasStoredDrafts,loadStoredDrafts,saveStoredDrafts} from '../src/draftStore.js';
const columns=[{name:'ID',sourceSchema:'APP',sourceTable:'T'},{name:'X'}];
test('drafts are keyed by tab and source table and only restored for the same column layout',()=>{
 clearAllStoredDrafts();
 const key=draftStoreKey('tab-1',columns),signature=columnsSignature(columns);
 assert.equal(key,'tab-1|APP.T');assert.equal(draftStoreKey('tab-2',columns),'tab-2|APP.T');assert.equal(draftStoreKey('tab-1',[{name:'A'}]),null);
 saveStoredDrafts(key,{signature,drafts:{marker:1}});
 assert.equal(loadStoredDrafts(key,signature).drafts.marker,1);assert.equal(loadStoredDrafts(key,'other'),null);assert.equal(loadStoredDrafts('tab-2|APP.T',signature),null);
 assert.equal(hasStoredDrafts(key),true);saveStoredDrafts(key,null);assert.equal(hasStoredDrafts(key),false);assert.equal(loadStoredDrafts(null,signature),null);
});
import {clearTabDrafts,countTabDrafts} from '../src/draftStore.js';
import {editCell,emptyDrafts,toggleDeleted} from '../src/gridDrafts.js';
test('unapplied edits are counted per tab and can be cleared for that tab only',()=>{
 clearAllStoredDrafts();
 let drafts=editCell(emptyDrafts(),0,0,'a',{value:'b'});drafts=toggleDeleted(drafts,3);
 saveStoredDrafts('tab-1|APP.T',{signature:'s',drafts});saveStoredDrafts('tab-1|APP.U',{signature:'s',drafts:editCell(emptyDrafts(),1,1,'x',{value:'y'}),conflicts:[{}]});saveStoredDrafts('tab-2|APP.T',{signature:'s',drafts});
 assert.equal(countTabDrafts('tab-1'),4);assert.equal(countTabDrafts('tab-2'),2);assert.equal(countTabDrafts('tab-3'),0);
 clearTabDrafts('tab-1');assert.equal(countTabDrafts('tab-1'),0);assert.equal(countTabDrafts('tab-2'),2);assert.equal(countTabDrafts('tab-10'),0);
});
