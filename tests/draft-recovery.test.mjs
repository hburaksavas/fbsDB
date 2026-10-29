import test from 'node:test';
import assert from 'node:assert/strict';
import { draftSnapshot, parseDraftSnapshot } from '../src/draftRecovery.js';

test('draft recovery preserves document order and profile preference without session or parameter values',()=>{
  const tabs=[{id:'a',name:'a.sql',path:'C:/a.sql',content:'select :x from dual',dirty:true,connectionProfileId:'profile',password:'secret',parameters:[{value:'secret'}],rows:[['private']]},{id:'definition',name:'package.sql',content:'BEGIN NULL; END;',readOnly:true},{id:'b',name:'b.sql',content:'old',dirty:false}];
  const data=draftSnapshot(tabs,'b',{content:'unsaved',dirty:true},123);
  assert.deepEqual(data.files.map(file=>file.id),['a','b']);
  assert.equal(data.files[1].content,'unsaved');
  assert.equal(data.files[0].connectionProfileId,'profile');
  const json=JSON.stringify(data);assert.ok(!json.includes('secret'));assert.ok(!json.includes('private'));
  assert.deepEqual(parseDraftSnapshot(json),data);
});

test('recovery ignores invalid and clean snapshots and discards unexpected persisted fields',()=>{
  assert.equal(parseDraftSnapshot('{'),null);
  assert.equal(parseDraftSnapshot(JSON.stringify({version:1,files:[{id:'a',name:'a.sql',path:'a.sql',content:'SELECT 1',dirty:false}]})),null);
  const data=parseDraftSnapshot(JSON.stringify({version:1,activeTabId:'missing',files:[{id:'a',name:'a.sql',content:'SELECT 1',dirty:true,password:'bad'},{id:'a',name:'a.sql',content:'duplicate',dirty:true}]}));
  assert.equal(data.activeTabId,'a');assert.equal(data.files.length,1);assert.ok(!('password' in data.files[0]));
});
