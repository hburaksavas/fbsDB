import test from 'node:test';
import assert from 'node:assert/strict';
import {applyExternalFileChange} from '../src/externalFileState.js';

test('external file notices retain dirty text and reject stale replies after save or path moves',()=>{
  const tab={id:'stable',path:'C:/sql/a.sql',content:'unsaved text',dirty:true,diskVersion:'v1'};
  const change={path:'c:\\sql\\a.sql',expectedVersion:'v1',snapshot:{version:'v2',content:'outside text'}};
  const result=applyExternalFileChange(tab,change);
  assert.equal(result.content,tab.content);assert.equal(result.dirty,true);assert.equal(result.externalChange.content,'outside text');assert.equal(result.id,tab.id);
  assert.equal(applyExternalFileChange({...tab,diskVersion:'v3'},change).externalChange,undefined);
  assert.equal(applyExternalFileChange({...tab,path:'C:/sql/moved.sql'},change).externalChange,undefined);
});
test('unknown recovery baselines require review unless the editor exactly matches disk; recovered access clears only the notice',()=>{
  const tab={path:'C:/sql/a.sql',content:'recovered draft',dirty:true};
  const change={path:tab.path,expectedVersion:null,snapshot:{version:'hash',content:'disk text'}};
  assert.equal(applyExternalFileChange(tab,change).externalChange.baselineUnknown,true);
  assert.equal(applyExternalFileChange(tab,change,'disk text').diskVersion,'hash');
  const unavailable={...tab,diskVersion:'hash',externalChange:{version:'unavailable',error:'locked'}};
  const result=applyExternalFileChange(unavailable,{...change,expectedVersion:'hash'});
  assert.equal(result.externalChange,null);assert.equal(result.content,tab.content);assert.equal(result.dirty,true);
});
