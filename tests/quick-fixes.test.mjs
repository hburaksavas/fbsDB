import test from 'node:test';
import assert from 'node:assert/strict';
import {contextualQuickFixes} from '../src/quickFixes.js';

const report=(source,offset,message)=>({id:'compiler-1',source:'Oracle compiler',editorSnapshot:source,offset,message});
test('compiler semicolon fix stays on the verified source line',()=>{
  const source='BEGIN\n  NULL\nEND;';
  const fixes=contextualQuickFixes(source,source.indexOf('NULL'),[report(source,source.indexOf('NULL'),'PLS-00103: Encountered the symbol END when expecting one of the following: ;')]);
  assert.equal(fixes.length,1);assert.equal(fixes[0].label,'Add missing semicolon');
  const edit=fixes[0].edits[0];assert.equal(source.slice(0,edit.start)+edit.text+source.slice(edit.end),'BEGIN\n  NULL;\nEND;');
  assert.equal(contextualQuickFixes(source,source.indexOf('NULL'),[report('changed',source.indexOf('NULL'),'PLS-00103 expecting ;')]).length,0);
  const atEnd=contextualQuickFixes(source,source.indexOf('END'),[report(source,source.indexOf('END'),'PLS-00103: Encountered END when expecting ;')]);
  assert.equal(atEnd[0].edits[0].start,source.indexOf('NULL')+4);
});
test('unknown local declaration uses an explicit placeholder and requires DECLARE',()=>{
  const source='DECLARE\nBEGIN\n  v_new := 1;\nEND;';
  const message="PLS-00201: identifier 'V_NEW' must be declared";
  const fixes=contextualQuickFixes(source,source.indexOf('v_new'),[report(source,source.indexOf('v_new'),message)]);
  assert.equal(fixes.length,1);assert.match(fixes[0].edits[0].text,/V_NEW VARCHAR2\(4000\); -- TODO: verify type/);
  assert.equal(contextualQuickFixes('BEGIN\n v_new := 1;\nEND;',7,[report('BEGIN\n v_new := 1;\nEND;',7,message)]).length,0);
});
