import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionInspectorSections} from '../src/sessionInspector.js';
const find=(sections,id)=>sections.find(section=>section.id===id).rows;
test('disconnected sessions explain what is missing instead of showing stale values',()=>{
 const sections=sessionInspectorSections({connection:{id:'No connection'}});
 assert.deepEqual(find(sections,'connection')[1],['State','Not connected','This tab']);
 assert.equal(find(sections,'session')[0][1],'Connect to read the session');assert.equal(find(sections,'nls')[0][1],'Connect to read NLS settings');
 assert.equal(find(sections,'cursor')[0][1],'No result yet');
});
test('connected sessions list schema, NLS provenance, transaction and cursor state',()=>{
 const sections=sessionInspectorSections({connection:{id:'DEV',name:'Dev'},context:{schema:'APP',container:'PDB1',edition:'ORA$BASE',service:'dev.svc',sessionId:'42,7'},
  nls:{effective:{NLS_DATE_FORMAT:'DD.MM.YYYY',NLS_LANGUAGE:'TURKISH',SESSIONTIMEZONE:'+03:00',NLS_CUSTOM:'x'},configured:{NLS_DATE_FORMAT:'DD.MM.YYYY'},initial:{NLS_LANGUAGE:'AMERICAN',SESSIONTIMEZONE:'+03:00'}},
  transactionPending:true,autoCommit:false,executing:false,result:{hasMore:true,sqlId:'abc123',elapsedMs:15},rowsLoaded:1000,generation:3});
 assert.equal(find(sections,'session')[0][1],'APP');assert.equal(find(sections,'session').at(-1)[1],'42,7');
 const nls=find(sections,'nls');
 assert.deepEqual(nls.map(row=>row[0]),['NLS_LANGUAGE','NLS_DATE_FORMAT','SESSIONTIMEZONE','NLS_CUSTOM']);
 assert.equal(nls[0][2],'Changed from AMERICAN in this session');assert.equal(nls[1][2],'Profile override');assert.equal(nls[2][2],'Database default');
 assert.equal(find(sections,'transaction')[0][1],'Yes — commit or roll back');
 const cursor=find(sections,'cursor');assert.deepEqual(cursor.map(row=>row[0]),['Rows loaded','More rows on server','SQL id','Elapsed']);assert.equal(cursor[0][1],'1,000');assert.equal(cursor[1][1],'Yes — open cursor');
 assert.equal(find(sessionInspectorSections({connection:{id:'DEV'},result:{hasMore:true,cursorUnavailable:true}}),'cursor')[1][1],'Cursor no longer available');
});
