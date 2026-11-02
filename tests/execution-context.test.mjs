import test from 'node:test';
import assert from 'node:assert/strict';
import {documentConnection,profileEnvironment,editedSinceExecution,resultProvenance} from '../src/executionContext.js';

const document={id:'file',name:'query.sql',content:'SELECT 1 FROM dual;',connectionProfileId:'DEV'};
const profiles=[{id:'DEV',name:'Development',env:'DEV'},{id:'PROD',name:'Production',env:'PROD'}];

test('environment context uses explicit metadata and keeps live connection context distinct from saved associations',()=>{
  assert.equal(profileEnvironment({name:'Production copy',env:'UNKNOWN'}),'UNKNOWN');
  const offline=documentConnection({...document,connectionProfileId:'PROD'},{},profiles);
  assert.equal(offline.environment,'PROD');assert.equal(offline.state,'disconnected');
  const live=documentConnection({...document,connectionProfileId:'PROD'},{file:{activeConnection:profiles[0]}},profiles);
  assert.equal(live.environment,'DEV');assert.equal(live.profileId,'DEV');
  const metadata=documentConnection({id:'definition',metadataOriginTabId:'file'},{file:{activeConnection:profiles[1]}},profiles);
  assert.equal(metadata.environment,'PROD');
});

test('connection states retain pending work separately from connected/disconnected/inactive state',()=>{
  const sessions={file:{activeConnection:profiles[0],transactionPending:true}};
  assert.equal(documentConnection(document,sessions,profiles).short,'TX');
  sessions.file.connectionLost=true;
  assert.equal(documentConnection(document,sessions,profiles).short,'Off TX');
  sessions.file.connecting=true;sessions.file.connectingProfileId='PROD';sessions.file.connectingEnvironment='PROD';
  assert.equal(documentConnection(document,sessions,profiles).environment,'PROD');
  assert.equal(documentConnection(document,sessions,profiles).state,'connecting');
  sessions.file={activeConnection:profiles[0],inactive:true};
  assert.equal(documentConnection(document,sessions,profiles).state,'inactive');
});

test('result provenance compares the exact captured editor text, profile and session generation',()=>{
  const result={editorSnapshot:document.content,executedProfileId:'DEV',executedProfile:'Development',executedTabId:'file',executedConnectionGeneration:1,executedContext:{sessionId:'101'},sqlVersion:'abcdef1234567890'};
  const connection={profileId:'DEV',generation:1};
  assert.equal(resultProvenance(result,document,connection,{sessionId:'101'}).key,'matching');
  assert.equal(editedSinceExecution({...document,content:document.content+' -- edit'},result),true);
  assert.equal(resultProvenance(result,{...document,content:'SELECT 2 FROM dual;'},connection,{sessionId:'101'}).key,'edited');
  assert.equal(resultProvenance(result,document,{...connection,generation:2},{sessionId:'101'}).key,'context-changed');
  assert.equal(resultProvenance(result,document,connection,{sessionId:'102'}).key,'context-changed');
  assert.equal(resultProvenance(result,document,{...connection,profileId:'PROD'},{sessionId:'101'}).key,'context-changed');
  assert.equal(resultProvenance({},document,connection,null).key,'unknown');
});

test('reverting to the exact executed source clears the edit marker independently of dirty/save state',()=>{
  const execution={editorSnapshot:document.content};
  assert.equal(editedSinceExecution({...document,dirty:false,content:'SELECT 2 FROM dual;'},execution),true);
  assert.equal(editedSinceExecution({...document,dirty:true},execution),false);
});
