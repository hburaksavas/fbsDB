import test from 'node:test';
import assert from 'node:assert/strict';
import {reversibility,commitButtonTitle,rollbackButtonTitle} from '../src/reversibility.js';
test('each transaction state says plainly whether it can still be undone',()=>{
 assert.equal(reversibility('pending').line,'Not committed · can still be rolled back');
 assert.equal(reversibility('committed').line,'Committed · permanent');
 assert.equal(reversibility('rolledBack').line,'Rolled back · undone');
 assert.match(reversibility('unconfirmed').line,/^Unconfirmed · check the stored data/);
 assert.deepEqual(['pending','committed','rolledBack','unconfirmed'].map(id=>reversibility(id).tone),['open','permanent','undone','unknown']);
 assert.equal(reversibility('nope'),null);
});
test('the buttons that change the state name their effect',()=>{
 assert.match(commitButtonTitle,/permanent/);assert.match(rollbackButtonTitle,/discard/);
});
