import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteImpactSeed} from '../src/deleteImpact.js';

test('safe-delete review seeds a parameter search with resolved local usage',()=>{
  const source='CREATE OR REPLACE PROCEDURE p_run(p_id IN NUMBER) IS\nBEGIN\n  DBMS_OUTPUT.PUT_LINE(p_id);\nEND;';
  const impact=deleteImpactSeed(source,source.indexOf('p_id')+2);
  assert.equal(impact.name,'P_ID');assert.equal(impact.kind,'parameter');assert.equal(impact.localReferences,1);assert.equal(impact.localComplete,true);
});
test('nonlocal names cannot be described as safe to delete',()=>{
  assert.match(deleteImpactSeed('SELECT id FROM t',7).error,/local procedure/);
});
