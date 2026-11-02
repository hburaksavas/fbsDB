import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsedText,settleTransaction,startApplied,transactionText} from '../src/appliedTransaction.js';
test('applied counts accumulate while the transaction stays open and restart after it ends',()=>{
 let tx=startApplied(null,2,1000);assert.deepEqual(tx,{count:2,since:1000,state:'pending'});
 tx=startApplied(tx,1,5000);assert.deepEqual(tx,{count:3,since:1000,state:'pending'});
 tx=settleTransaction(tx,'committed');assert.equal(tx.state,'committed');assert.deepEqual(startApplied(tx,1,9000),{count:1,since:9000,state:'pending'});
 assert.equal(settleTransaction(tx,'rolled back'),tx,'A settled transaction does not change again');assert.equal(settleTransaction(null,'committed'),null);
 assert.equal(settleTransaction({count:1,since:0,state:'pending'},'rolled back').state,'rolledBack');
});
test('elapsed time and the state text say what is known and what is not',()=>{
 assert.equal(elapsedText(0,45000),'45 s');assert.equal(elapsedText(0,180000),'3 min');assert.equal(elapsedText(0,3900000),'1 h 5 min');
 assert.match(transactionText({count:1,since:0,state:'pending'},60000),/1 grid change applied, not committed · open for 1 min\. Other work in this session is not counted/);
 assert.match(transactionText({count:2,since:0,state:'committed'}),/2 grid changes committed/);assert.match(transactionText({count:2,since:0,state:'rolledBack'}),/rolled back; the grid shows the stored values/);
 assert.equal(transactionText(null),'');
});
test('a commit that failed with the connection is unconfirmed, not committed',()=>{
 const tx=settleTransaction({count:2,since:0,state:'pending'},'unconfirmed');
 assert.equal(tx.state,'unconfirmed');assert.match(transactionText(tx),/2 grid changes were being committed when the connection failed\. Whether Oracle saved them is not confirmed/);
 assert.equal(settleTransaction(tx,'committed').state,'committed','A later confirmed commit can still settle it');assert.equal(settleTransaction({count:1,since:0,state:'committed'},'unconfirmed').state,'committed');
});
