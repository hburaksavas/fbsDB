import test from 'node:test';
import assert from 'node:assert/strict';
import {announce,announcementSnapshot,gridAnnouncement,resultAnnouncement,subscribeAnnouncements} from '../src/announcer.js';
test('announcements update the right region and notify subscribers each time, repeats included',()=>{
 let calls=0;const off=subscribeAnnouncements(()=>{calls++});
 announce('Edit mode on');announce('Edit mode on');announce('Oracle rejected a value','assertive');announce('   ');announce(null);
 const state=announcementSnapshot();
 assert.equal(state.polite,'Edit mode on');assert.equal(state.assertive,'Oracle rejected a value');assert.equal(calls,3);assert.equal(state.tick>=3,true);off();
});
test('grid events become short sentences, with the mode change first',()=>{
 const base={editMode:false,pending:0,invalid:0};
 assert.match(gridAnnouncement(base,{...base,editMode:true}),/^Edit mode on/);
 assert.equal(gridAnnouncement({...base,editMode:true},base),'Edit mode off.');
 assert.equal(gridAnnouncement(base,{...base,pending:1}),'1 pending change.');
 assert.equal(gridAnnouncement({...base,pending:2},{...base,pending:0}),'No pending changes.');
 assert.equal(gridAnnouncement(base,{...base,invalid:2}),'2 staged values would be rejected by Oracle.');
 assert.equal(gridAnnouncement({...base,invalid:2},{...base,invalid:0}),'');assert.equal(gridAnnouncement(base,base),'');
});
test('a finished query announces its row count and elapsed time',()=>{
 assert.equal(resultAnnouncement({rows:1,elapsedMs:12}),'1 row returned in 12 ms.');
 assert.equal(resultAnnouncement({rows:1200,elapsedMs:30,hasMore:true}),'1,200 rows returned in 30 ms; more rows are available.');
 assert.equal(resultAnnouncement({rows:0}),'0 rows returned.');assert.equal(resultAnnouncement({}),'');
});
