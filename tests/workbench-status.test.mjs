import test from 'node:test';
import assert from 'node:assert/strict';
import {workbenchStatus,transactionStatus} from '../src/workbenchStatusModel.js';
const connection={state:'connected'};
test('footer priority keeps running/cancellation and actual errors ahead of pending and selection summaries',()=>{
 const selection={cells:4,rows:2,columns:2,scope:'current page'},session={queryOutcome:{kind:'error',message:'ORA-00942: missing\ntrace'},transactionPending:true};
 assert.equal(workbenchStatus({session:{...session,cancelling:true},connection,selection}).kind,'busy');
 assert.equal(workbenchStatus({session,connection,selection}).text,'ORA-00942: missing');
 assert.equal(workbenchStatus({session:{transactionPending:true},connection,selection}).text,'Transaction pending');
 assert.equal(workbenchStatus({connection,selection}).text,'4 cells · 2 rows · 2 columns · current page');
 assert.match(workbenchStatus({session:{scriptRun:{running:true,awaitingSourceReview:{index:1}}},connection}).text,/statement 2/);
});
test('footer transaction text follows the physical session mode and disconnected ambiguity',()=>{
 assert.equal(transactionStatus({autoCommit:true}),'Auto commit');assert.equal(transactionStatus({transactionPending:true}),'Manual commit · pending');assert.equal(transactionStatus({analysisReadOnly:true,transactionPending:true}),'Read-only analysis');assert.equal(transactionStatus({connectionLost:true,transactionPending:true}),'Transaction state unverified');
});
