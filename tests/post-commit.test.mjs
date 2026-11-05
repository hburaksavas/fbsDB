import test from 'node:test';
import assert from 'node:assert/strict';
import {appliedEntries,compareVerification,verificationQuery} from '../src/postCommit.js';
const columns=[{name:'ID',type:'NUMBER',sourceSchema:'APP',sourceTable:'T',sourceColumn:'ID'},{name:'NAME',type:'VARCHAR2',sourceSchema:'APP',sourceTable:'T',sourceColumn:'NAME'}];
const statements=[{kind:'update',row:0,binds:[{name:'c1',value:'Ada L'},{name:'uk1',value:'1'},{name:'ok1',value:'Ada'}]},{kind:'delete',row:1,binds:[{name:'dk1',value:'2'}]},{kind:'update',row:2,binds:[{name:'uk1',value:'3'}]}];
const outcomes=[{index:0,status:'applied'},{index:1,status:'applied'},{index:2,status:'failed'}];
const entries=appliedEntries(statements,outcomes,{0:{1:{value:'Ada L',isNull:false}}});
test('only applied statements are kept, with their keys and edited cells',()=>{
 assert.deepEqual(entries.map(item=>[item.kind,item.row,item.key]),[['update',0,['1']],['delete',1,['2']]]);assert.equal(entries[0].cells[1].value,'Ada L');
});
test('the verification query reads the changed rows by key with binds only',()=>{
 const query=verificationQuery({columns,identity:[0],entries});
 assert.equal(query.sql,'SELECT "ID", "NAME" FROM "APP"."T" WHERE ("ID" = :v0k0) OR ("ID" = :v1k0)');assert.deepEqual(query.parameters.map(item=>item.value),['1','2']);assert.deepEqual(query.selected,[0,1]);
 assert.match(verificationQuery({columns,identity:[0],entries:[]}).error,/Nothing/);
 assert.match(verificationQuery({columns,identity:[0],entries:Array.from({length:51},(_,row)=>({kind:'delete',row,key:[String(row)],cells:{}}))}).error,/at most 50/);
});
test('a changed key is looked up by its new value',()=>{
 const moved=[{kind:'update',row:0,key:['1'],cells:{0:{value:'10',isNull:false}}}];
 assert.deepEqual(verificationQuery({columns,identity:[0],entries:moved}).parameters.map(item=>item.value),['10']);
});
test('results separate matches, differences and missing rows without claiming a failed commit',()=>{
 const base={identity:[0],entries,selected:[0,1]};
 assert.deepEqual(compareVerification({...base,rows:[[1,'Ada L']]}).map(item=>item.status),['ok','ok']);
 const differs=compareVerification({...base,rows:[[1,'Someone else']]});assert.equal(differs[0].status,'differs');assert.match(differs[0].message,/is "Someone else", expected "Ada L"/);
 assert.equal(compareVerification({...base,rows:[]})[0].status,'missing');assert.equal(compareVerification({...base,rows:[[1,'Ada L'],[2,'x']]})[1].status,'differs');
 assert.equal(compareVerification({...base,rows:[['1.0','Ada L']]})[0].status,'ok','numbers compare as numbers');
});
import {commitReceipt,duplicateValues} from '../src/postCommit.js';
test('a commit receipt lists time, table, counts and keys with old and new values and states its scope',()=>{
 const text=commitReceipt({entries,table:'"APP"."T"',columns,identity:[0],committedAt:new Date('2026-11-03T10:00:00Z'),tab:'tab-1'});
 assert.match(text,/Committed at: 2026-11-03T10:00:00.000Z · tab tab-1/);assert.match(text,/Grid changes: 1 update, 1 delete/);
 assert.match(text,/- update 1 · NAME: undefined -> Ada L|- update 1 · NAME: .* -> Ada L/);assert.match(text,/- delete 2$/m);assert.match(text,/Other work in the same session/);
});
test('duplicating a row leaves keys, locked columns and unsupported values out and keeps NULL explicit',()=>{
 const cols=[{name:'ID'},{name:'NAME'},{name:'NOTE'},{name:'DOC'},{name:'WHEN'}];
 const editable=[{editable:true},{editable:true},{editable:true},{editable:false},{editable:true}];
 const values=duplicateValues(cols,editable,[0],['1','Ada',null,'blob',{kind:'temporal',value:'2026-01-02 03:04:05'}]);
 assert.deepEqual(values,{1:{value:'Ada'},2:{isNull:true},4:{value:'2026-01-02 03:04:05'}});
});

import {mergeAppliedEntries,reconcileApplied,reconciliationNote,reconciliationQuery} from '../src/postCommit.js';
const edit=(row,key,name,original,value='new')=>({kind:'update',row,key,cells:{[name]:{value,isNull:false,original}}});
test('an unknown Commit is told apart row by row: saved, not saved or neither',()=>{
 const results=rows=>reconcileApplied({identity:[0],entries:[edit(0,['1'],1,'old')],selected:[0,1],rows}).map(item=>item.status);
 assert.deepEqual(results([[1,'new']]),['saved']);
 assert.deepEqual(results([[1,'old']]),['notSaved']);
 assert.deepEqual(results([[1,'someone else']]),['unknown'],'Neither value: never offered for a retry');
 assert.deepEqual(results([]),['unknown'],'A missing row is not assumed to be either');
 const deleted=rows=>reconcileApplied({identity:[0],entries:[{kind:'delete',row:0,key:['1'],cells:{}}],selected:[0,1],rows})[0].status;
 assert.equal(deleted([]),'saved');assert.equal(deleted([[1,'x']]),'notSaved');
});
test('a changed key is looked for under both keys',()=>{
 const entries=[{kind:'update',row:0,key:['1'],cells:{0:{value:'10',isNull:false,original:'1'}}}];
 assert.deepEqual(reconciliationQuery({columns,identity:[0],entries}).parameters.map(item=>item.value),['10','1']);
 const status=rows=>reconcileApplied({identity:[0],entries,selected:[0,1],rows})[0].status;
 assert.equal(status([[10,'x']]),'saved');assert.equal(status([[1,'x']]),'notSaved');assert.equal(status([]),'unknown');
});
test('several Applies to one row compare the value before the first with the value after the last',()=>{
 const entries=[edit(0,['1'],1,'first','second'),edit(0,['1'],1,'second','third')];
 assert.deepEqual(mergeAppliedEntries(entries)[0].cells[1],{value:'third',isNull:false,original:'first'});
 const status=rows=>reconcileApplied({identity:[0],entries,selected:[0,1],rows})[0].status;
 assert.equal(status([[1,'third']]),'saved');assert.equal(status([[1,'first']]),'notSaved');assert.equal(status([[1,'second']]),'unknown');
 assert.equal(mergeAppliedEntries([edit(0,['1'],1,'a'),{kind:'delete',row:0,key:['1'],cells:{}}])[0].kind,'delete');
});
test('datetimes compare as datetimes and a NULL is a value',()=>{
 const cell={kind:'temporal',oracleType:'DATE',value:'2026-03-04T05:06:07'};
 const entries=[edit(0,['1'],1,null,'2026-03-04 05:06:07')];
 assert.equal(reconcileApplied({identity:[0],entries,selected:[0,1],rows:[[1,cell]]})[0].status,'saved');
 assert.equal(reconcileApplied({identity:[0],entries,selected:[0,1],rows:[[1,null]]})[0].status,'notSaved');
 assert.equal(compareVerification({identity:[0],entries,selected:[0,1],rows:[[1,cell]]})[0].status,'ok','Verify after a Commit agrees');
 const zoned={kind:'temporal',oracleType:'TIMESTAMP WITH TIME ZONE',value:'2026-03-04T05:06:07.500000000',offset:'+03:00'};
 assert.equal(reconcileApplied({identity:[0],entries:[edit(0,['1'],1,null,'2026-03-04 02:06:07.5Z')],selected:[0,1],rows:[[1,zoned]]})[0].status,'saved','The same instant');
});
test('a zoned key binds with its zone',()=>{
 const zonedColumns=[{name:'T',type:'TIMESTAMP WITH TIME ZONE',sourceSchema:'APP',sourceTable:'T',sourceColumn:'T'},columns[1]];
 const query=verificationQuery({columns:zonedColumns,identity:[0],entries:[{kind:'delete',row:0,key:['2026-03-04T05:06:07+03:00'],cells:{}}]});
 assert.equal(query.parameters[0].type,'TIMESTAMPTZ');
});
test('the note counts each result, names what was not checked and explains a mix',()=>{
 assert.match(reconciliationNote([{status:'saved'},{status:'saved'}]),/^2 saved\. This covers only the changes sent from this grid/);
 assert.match(reconciliationNote([{status:'saved'},{status:'notSaved'},{status:'unknown'}],2),/^1 saved, 1 not saved, 1 unclear, 2 new rows not checked\..*this mix means another session/);
 assert.doesNotMatch(reconciliationNote([{status:'notSaved'}]),/mix/);
});
