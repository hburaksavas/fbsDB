import test from 'node:test';
import assert from 'node:assert/strict';
import {previewOpenPlan,settlePreview} from '../src/previewTabs.js';
const tabs=[{id:'a',path:['D:','w','a.sql'].join(String.fromCharCode(92)),dirty:false},{id:'b',path:'D:/w/b.sql',dirty:true},{id:'draft',path:null,dirty:false}];
test('a single click opens a preview that replaces only a clean preview tab',()=>{
 assert.deepEqual(previewOpenPlan({previewId:'a',tabs},{path:'D:/w/new.sql'},{preview:true}),{type:'open',asPreview:true,replace:'a'});
 assert.deepEqual(previewOpenPlan({previewId:'b',tabs},{path:'D:/w/new.sql'},{preview:true}),{type:'open',asPreview:true,replace:null});
 assert.deepEqual(previewOpenPlan({previewId:null,tabs},{path:'D:/w/new.sql'},{preview:true}),{type:'open',asPreview:true,replace:null});
});
test('explicit opens, a disabled feature and cached files never create previews',()=>{
 assert.deepEqual(previewOpenPlan({previewId:'a',tabs},{path:'D:/w/new.sql'},{}),{type:'open',asPreview:false,replace:null});
 assert.deepEqual(previewOpenPlan({previewId:'a',tabs},{path:'D:/w/new.sql'},{preview:true,enabled:false}),{type:'open',asPreview:false,replace:null});
 assert.deepEqual(previewOpenPlan({previewId:'a',tabs},{path:'d:/W/A.sql'},{preview:true}),{type:'activate',id:'a',promote:false});
 assert.deepEqual(previewOpenPlan({previewId:'a',tabs},{path:'D:/w/a.sql'},{}),{type:'activate',id:'a',promote:true});
 assert.deepEqual(previewOpenPlan({previewId:'a',tabs},{path:'D:/w/b.sql'},{}),{type:'activate',id:'b',promote:false});
});
test('editing or closing a preview ends its preview state',()=>{
 assert.equal(settlePreview('a',tabs),'a');assert.equal(settlePreview('b',tabs),null);assert.equal(settlePreview('gone',tabs),null);assert.equal(settlePreview(null,tabs),null);
});
