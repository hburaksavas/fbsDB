import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDrafts,editCell} from '../src/gridDrafts.js';
import {clearAllStoredDrafts,loadStoredDrafts,saveStoredDrafts,settleStoredTransactions} from '../src/draftStore.js';

const entry=(state,drafts=emptyDrafts())=>({signature:'s',drafts,conflicts:[],tx:{count:1,since:0,state},appliedLog:[{row:0}],txLabel:'work'});
const load=key=>loadStoredDrafts(key,'s');
test('a kept record follows the session while its grid is not on screen',()=>{
  clearAllStoredDrafts();
  saveStoredDrafts('tab-1|APP.A',entry('pending'));saveStoredDrafts('tab-2|APP.A',entry('pending'));
  settleStoredTransactions('tab-1','committed');
  assert.equal(load('tab-1|APP.A'),null,'A committed record with nothing else is dropped');
  assert.equal(load('tab-2|APP.A').tx.state,'pending','Another tab is not touched');
});
test('edits still waiting survive when their transaction ends',()=>{
  clearAllStoredDrafts();
  saveStoredDrafts('tab-1|APP.A',entry('pending',editCell(emptyDrafts(),0,1,'a',{value:'b'})));
  settleStoredTransactions('tab-1','rolled back');
  const kept=load('tab-1|APP.A');
  assert.equal(kept.tx,null);assert.deepEqual(kept.appliedLog,[]);assert.equal(kept.txLabel,'');assert.equal(Object.keys(kept.drafts.cells).length,1);
});
test('an unknown Commit stays checkable, and a new session forgets only pending work',()=>{
  clearAllStoredDrafts();
  saveStoredDrafts('tab-1|APP.A',entry('pending'));
  settleStoredTransactions('tab-1','unconfirmed');
  assert.equal(load('tab-1|APP.A').tx.state,'unconfirmed');assert.equal(load('tab-1|APP.A').appliedLog.length,1);
  settleStoredTransactions('tab-1','reconnected');
  assert.equal(load('tab-1|APP.A').tx.state,'unconfirmed','Reconnecting is when it can be checked');
  saveStoredDrafts('tab-1|APP.B',entry('pending'));
  settleStoredTransactions('tab-1','reconnected');
  assert.equal(load('tab-1|APP.B'),null,'The old session took its pending work with it');
  settleStoredTransactions('tab-1','committed');
  assert.equal(load('tab-1|APP.A'),null,'A later confirmed Commit settles it');
});
