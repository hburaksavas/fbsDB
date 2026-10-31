import {createConnectionLifecycle} from '../src/connectionLifecycle.js';
import {transactionRecoveryHint} from '../src/resultStatus.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {retainHistory,historyAllowed} from '../src/queryHistory.js';
import {persistLocal} from '../src/localPersistence.js';
import {feedbackSnapshot,dismissFeedback} from '../src/feedbackStore.js';
import {isDdl} from '../src/sqlSafety.js';
import {normalizeMiniTool} from '../src/miniTools.js';
test('history expiry, disabled profiles and zero retention remove stored SQL',()=>{
 const now=10*86400000,entries=[{profile:'PROD',startedAt:now},{profile:'DEV',startedAt:now},{profile:'DEV',startedAt:0}];
 assert.deepEqual(retainHistory(entries,{limit:50,days:1,excludedProfiles:' prod '},now),[entries[1]]);
 assert.deepEqual(retainHistory(entries,{limit:0},now),[]);assert.equal(historyAllowed('Prod',' DEV, prod '),false);
});
test('failed draft persistence reports recovery risk without throwing',()=>{
 assert.equal(persistLocal({setItem(){throw Error('quota')}},'fbsdb.sqlDrafts','SQL'),false);
 assert.match(feedbackSnapshot().find(item=>item.id==='storage:fbsdb.sqlDrafts').message,/Save your SQL to a file/);
 dismissFeedback('storage:fbsdb.sqlDrafts');
 const saved=[];assert.equal(persistLocal({setItem(...args){saved.push(args)}},'key','value'),true);assert.deepEqual(saved,[['key','value']]);
});
test('DDL classification ignores comments and quoted literal contents',()=>{
 assert.equal(isDdl('/* review */ CREATE TABLE t (n NUMBER)'),true);
 assert.equal(isDdl("SELECT 'DROP TABLE t' FROM dual"),false);assert.equal(isDdl('-- ALTER\nSELECT 1 FROM dual'),false);
});
test('mini tools keep bounded sharing metadata and remain backward compatible',()=>{
 const old=normalizeMiniTool({version:1,name:'tool',sql:'SELECT :ID FROM dual'});
 assert.equal(old.revision,0);assert.equal(old.description,'');
 const next=normalizeMiniTool({...old,description:'d'.repeat(2100),usage:'Enter :ID',changeNotes:'Add ID',revision:2});
 assert.equal(next.description.length,2000);assert.equal(next.revision,2);assert.equal(next.changeNotes,'Add ID');assert.equal('values' in next,false);
});

test('execution recovery never claims timeout or cancellation undoes committed data',()=>{
 assert.match(transactionRecoveryHint({transactionPending:true}),/Commit or Rollback/);
 assert.match(transactionRecoveryHint({transactionPending:false}),/No pending transaction/);
 assert.match(transactionRecoveryHint({}),/unconfirmed/);
 assert.match(transactionRecoveryHint({}),/verify whether it already took effect/);
});

test('connection actions keep credential prompt owner and transaction guard across tab switches',()=>{
 const commands=[],guards=[],p={documents:{activeId:'a'},pendingConnectionsRef:{current:new Map()},activeConnection:{id:'OLD'},transactionPending:false,authProfile:null,authTestRequestRef:{current:null},pendingSwitch:null,
 updateTabSession(){},setConnecting(){},setConnectionError(){},setAuthProfile(value){p.authProfile=value},editorIsReadonly(){return false},setManagementError(){},setShowPicker(){},setPendingSwitch(value){guards.push(value)},setActiveConnection(){},setRunState(){}};
 const actions=createConnectionLifecycle(()=>p,{native:true,send(command,payload){commands.push({command,payload});return String(commands.length)}});
 actions.beginConnection({id:'NEW'});p.documents.activeId='b';actions.submitConnectionCredentials({user:'user',password:'secret'});
 assert.equal(commands[0].payload.tabId,'a');assert.equal(p.pendingConnectionsRef.current.get('1').credentials,undefined);
 actions.connectInBackground({id:'NEW',tabId:'a'});assert.equal(commands.length,1);
 p.transactionPending=true;actions.switchConnection({id:'OTHER',hasSavedCredentials:true});assert.equal(guards[0].tabId,'b');assert.equal(commands.length,1);
 p.pendingSwitch={tabId:'a'};actions.finishTransaction('rollback');assert.equal(commands[1].payload.tabId,'a');
});
