import test from 'node:test';
import assert from 'node:assert/strict';
import { editorSessionState } from '../src/editorSessionState.js';
import { oracleVocabularyStatus } from '../src/oracleVocabularyStatus.js';

test('session status reports work before idle state without hiding a pending transaction in state', () => {
  for (const [flag,text] of [['connecting','Connecting'],['cancelling','Cancelling'],['exporting','Exporting'],['fetching','Fetching rows'],['executing','Running SQL']]) {
    assert.equal(editorSessionState({connected:true,transactionPending:true,[flag]:true}).text,text);
  }
  assert.equal(editorSessionState({connected:false,transactionPending:true}).text,'Disconnected');
  assert.equal(editorSessionState({connected:true,transactionPending:true}).text,'Transaction pending');
  assert.equal(editorSessionState({connected:true}).text,'Connected');
  assert.equal(editorSessionState({connected:true,executing:true,stage:'Waiting for first rows'}).text,'Waiting for first rows');
  assert.equal(editorSessionState({connected:true,stage:'Waiting for first rows'}).text,'Connected');
  assert.equal(editorSessionState({connected:true,readOnlyAnalysis:true,transactionPending:true}).text,'Read-only analysis');
});

test('keyword catalog distinguishes server vocabulary from offline and manually selected references', () => {
  const vocabulary={version:'23.5.0',words:['SELECT','XMLAGG'],error:null};
  assert.match(oracleVocabularyStatus('auto',vocabulary),/Oracle 23 reference.*2 server SQL keywords/);
  assert.match(oracleVocabularyStatus('19',vocabulary),/Oracle 19 reference.*Offline SQL reference/);
  assert.match(oracleVocabularyStatus('auto',{version:'21.0',words:[],error:'ORA-00942'}),/Oracle 21 reference.*Offline SQL reference.*ORA-00942/);
  assert.match(oracleVocabularyStatus('auto',null),/Oracle 19 reference.*Offline SQL reference/);
});
