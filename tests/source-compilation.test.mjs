import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSourceCompilation,databaseSourceChanged,sourceBaseline} from '../src/sourceCompilation.js';
import {compilationProblemItems} from '../src/plsqlDiagnostics.js';

test('compile preparation preserves editor text and removes only SQLPlus slash delimiters',()=>{
  const original="-- header\nPACKAGE BODY billing AS\n PROCEDURE run IS BEGIN x:=4/2; END;\nEND;\n/\n-- retained";
  const prepared=prepareSourceCompilation({name:'billing.pkb',content:original});
  assert.equal(prepared.error,null);
  assert.equal(prepared.original,original);
  assert.ok(prepared.sql.startsWith('CREATE OR REPLACE -- header'));
  assert.ok(prepared.sql.includes('4/2'));
  assert.ok(prepared.sql.endsWith('-- retained'));
  assert.ok(!prepared.sql.includes('\n/\n'));
  assert.ok(prepareSourceCompilation({name:'bad.pks',content:original}).error);
  assert.ok(prepareSourceCompilation({name:'q.sql',content:'SELECT 1 FROM dual;'}).error);
  assert.ok(prepareSourceCompilation({name:'billing.pkb',content:original,readOnly:true}).error);
});

test('compilation diagnostics map through a generated CREATE prefix and editor slash delimiters',()=>{
  const original='-- lead\nPACKAGE BODY billing AS\n PROCEDURE run IS BEGIN invalid_call; END;\nEND;\n/\n-- tail';
  const report={owner:'APP',name:'BILLING',type:'PACKAGE BODY',source:'PACKAGE BODY billing AS\n PROCEDURE run IS BEGIN invalid_call; END;\nEND;\n',errors:[{line:2,position:25,text:'PLS-00201',attribute:'ERROR'}]};
  report.errors[0].position=report.source.split('\n')[1].indexOf('invalid_call')+1;
  const [problem]=compilationProblemItems(report,{executedSql:original,editorSnapshot:original,statementOffset:0},'source-tab');
  assert.equal(problem.offset,original.indexOf('invalid_call'));
  assert.equal(problem.line,3);
  assert.equal(problem.tabId,'source-tab');
});

test('source baselines compare only the same object, database context and profile without retaining server text',()=>{
  const snapshot={owner:'APP',name:'BILLING',type:'PACKAGE',version:'v1',context:'PDB/EDITION',profileId:'DEV',source:'private implementation'};
  const baseline=sourceBaseline(snapshot);
  assert.equal(baseline.source,undefined);
  assert.equal(databaseSourceChanged(baseline,{...snapshot,version:'v2'}),true);
  assert.equal(databaseSourceChanged(baseline,snapshot),false);
  for(const patch of [{owner:'OTHER'},{name:'OTHER'},{type:'PACKAGE BODY'},{context:'OTHER/EDITION'},{profileId:'PROD'}])assert.equal(databaseSourceChanged(baseline,{...snapshot,...patch,version:'v2'}),false);
});


test('multi-source scripts retain independent compilation identities for per-object baselines',async()=>{
 const {sourceCompilationUnits,sourceIdentity}=await import('../src/sourceCompilation.js');
 const source='CREATE PACKAGE billing AS PROCEDURE run; END;\n/\nCREATE PACKAGE BODY billing AS PROCEDURE run IS BEGIN NULL; END; END;\n/\nSELECT 1 FROM dual;';
 const units=sourceCompilationUnits({name:'deploy.sql',content:source});
 assert.equal(units.length,2);assert.notEqual(sourceIdentity(units[0].declaration),sourceIdentity(units[1].declaration));
 assert.ok(units[1].statementOffset>0);assert.equal(units[1].original,units[1].sql);
 assert.equal(sourceCompilationUnits({name:'deploy.pks',content:source}).length,0);
});
