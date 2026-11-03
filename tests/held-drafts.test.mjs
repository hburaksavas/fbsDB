import test from 'node:test';
import assert from 'node:assert/strict';
import {heldDraftsNotice} from '../src/heldDrafts.js';
import {clearTabDrafts,draftStoreVersion,listTabDrafts,saveStoredDrafts,subscribeDraftStore} from '../src/draftStore.js';
import {editCell,emptyDrafts} from '../src/gridDrafts.js';
const drafts=count=>{let value=emptyDrafts();for(let i=0;i<count;i++)value=editCell(value,i,1,'a',{value:'b'});return value};
test('edits kept for another result are announced with their total and tables',()=>{
 const entries=[{key:'t|APP.ORDERS',table:'APP.ORDERS',count:3},{key:'t|APP.PRICES',table:'APP.PRICES',count:1}];
 const notice=heldDraftsNotice(entries,'t|APP.CUSTOMERS');
 assert.equal(notice.total,4);assert.match(notice.text,/4 unapplied grid edits are kept for APP.ORDERS and APP.PRICES/);assert.deepEqual(notice.keys,['t|APP.ORDERS','t|APP.PRICES']);
 assert.match(heldDraftsNotice([entries[1]],'x').text,/1 unapplied grid edit is kept for APP.PRICES.*discard it/);
 assert.match(heldDraftsNotice([...entries,{key:'t|C',table:'C',count:1}],'x').text,/APP.ORDERS, APP.PRICES and 1 more/);
});
test('nothing is announced for the result that owns the edits, or when nothing is held',()=>{
 assert.equal(heldDraftsNotice([{key:'t|APP.ORDERS',table:'APP.ORDERS',count:2}],'t|APP.ORDERS'),null);
 assert.equal(heldDraftsNotice([],'x'),null);
});
test('the store lists a tab\'s held drafts and tells subscribers when they change',()=>{
 let calls=0;const off=subscribeDraftStore(()=>{calls++});const before=draftStoreVersion();
 saveStoredDrafts('tab-9|APP.ORDERS',{signature:'s',drafts:drafts(2),conflicts:[]});
 assert.deepEqual(listTabDrafts('tab-9').map(row=>[row.table,row.count]),[['APP.ORDERS',2]]);
 assert.ok(draftStoreVersion()>before&&calls>=1);
 saveStoredDrafts('tab-9|APP.ORDERS',null);assert.deepEqual(listTabDrafts('tab-9'),[]);
 saveStoredDrafts('tab-9|APP.X',{signature:'s',drafts:drafts(1),conflicts:[]});clearTabDrafts('tab-9');assert.deepEqual(listTabDrafts('tab-9'),[]);
 off();
});
