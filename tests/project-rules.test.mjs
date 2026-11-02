import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProjectRules,expandSourcePattern,projectAreaFiles,projectOptions} from '../src/projectRules.js';
import {describeOracleSource,packageDocumentGroups,relatedSourceCandidates} from '../src/oracleSourceIdentity.js';

const rules={...defaultProjectRules,associations:[...defaultProjectRules.associations,{extension:'.spec',type:'PACKAGE'},{extension:'.impl',type:'PACKAGE BODY'}],packagePairs:[{specification:'spec/{name}.spec',body:'impl/{name}.impl'}],testPatterns:['tests/test_{name}.sql','{directory}/{name}.test.sql']};
const spec={id:'spec',name:'billing.spec',path:'C:/work/spec/billing.spec',content:'CREATE PACKAGE billing AS END;\n/'};
const body={id:'body',name:'billing.impl',path:'C:/work/impl/billing.impl',content:'CREATE PACKAGE BODY billing AS END;\n/'};
const context={root:'C:/work',rules};

test('project associations validate declared types for custom extensions',()=>{
  assert.equal(describeOracleSource(spec,rules).expectedType,'PACKAGE');
  assert.equal(describeOracleSource(body,rules).warning,null);
  assert.ok(describeOracleSource({...spec,content:body.content},rules).warning);
});

test('configured path pairs disambiguate reciprocal package groups across directories',()=>{
  const extra={...body,id:'other',path:'C:/work/other/billing.impl'};
  assert.deepEqual(packageDocumentGroups([spec,body,extra],context),[['spec','body']]);
  assert.deepEqual(packageDocumentGroups([spec,{...body,content:body.content.replace('billing','other')}],context),[]);
  assert.deepEqual(packageDocumentGroups([spec,{...body,connectionProfileId:'prod'}],context),[]);
  assert.deepEqual(packageDocumentGroups([spec,{...body,content:body.content.replace('billing','OTHER.billing')}],context),[]);
});

test('discovery includes configured test paths without claiming source identity or executing tests',()=>{
  const testFile={path:'C:/work/tests/test_billing.sql',name:'test_billing.sql',content:'BEGIN assert_billing; END;\n/'};
  const unrelated={...testFile,path:'C:/work/tests/test_other.sql'};
  const result=relatedSourceCandidates(spec,[],[body,testFile,unrelated],context);
  assert.deepEqual(result.map(item=>item.relation),['PACKAGE BODY','Test']);
  assert.equal(result[1].declaration,undefined);
  assert.equal(result[1].content,testFile.content);
  assert.equal(relatedSourceCandidates(spec,[{...body,content:'SELECT 1 FROM dual;',dirty:true}],[body],context).length,0);
});

test('path expansion stays inside visible workspace folders even for quoted object names',()=>{
  assert.equal(expandSourcePattern('{directory}/{name}.test.sql','BILLING','spec'),'spec/billing.test.sql');
  assert.equal(expandSourcePattern('{directory}/{name}.test.sql','BILLING',''),'billing.test.sql');
  for(const name of ['../outside','A/B','A\\B','A:C','A"B','..'])assert.equal(expandSourcePattern('tests/{name}.sql',name),null);
  for(const pattern of ['../{name}.sql','/{name}.sql','.fbsdb/{name}.sql','bin/{name}.sql','tests/{unknown}.sql'])assert.equal(expandSourcePattern(pattern,'BILLING'),null);
});


test('test-to-source navigation uses forward conventions and lists ambiguous declarations for explicit choice',()=>{
  const active={id:'test',path:'C:/work/tests/test_billing.sql',content:'BEGIN billing.run; END;'};
  const other={...spec,id:'other',path:'C:/work/other/billing.spec'};
  const result=relatedSourceCandidates(active,[],[spec,body,other],context);
  assert.equal(result.length,3);
  assert.ok(result.every(item=>item.relation==='Source under test'));
  assert.equal(relatedSourceCandidates({...active,path:'C:/else/tests/test_billing.sql'},[],[spec],context).length,0);
  assert.equal(relatedSourceCandidates(active,[{...spec,content:spec.content.replace('billing','other'),dirty:true}],[spec],context).length,0);
  assert.equal(relatedSourceCandidates({...active,readOnly:true},[],[spec],context).length,0);
  const localRules={...rules,testPatterns:['{directory}/{name}.test.sql']};
  assert.equal(relatedSourceCandidates({...active,path:'C:/work/spec/billing.test.sql'},[],[spec,body],{...context,rules:localRules}).length,1);
});


test('project area filters respect exact workspace boundaries and independent project defaults',()=>{
 const configured={...rules,project:{...defaultProjectRules.project,areas:{...defaultProjectRules.project.areas,packages:'spec'}}};
 const files=[spec,body,{...spec,path:'C:/work/spec-copy/billing.spec'},{...spec,path:'C:/other/spec/billing.spec'}];
 assert.deepEqual(projectAreaFiles(files,context.root,'packages',configured),[spec]);
 assert.deepEqual(projectAreaFiles(files,context.root,'all',configured),files);
 assert.equal(projectOptions(undefined).run.pageSize,1000);
 assert.equal(defaultProjectRules.project.areas.packages,'packages');
});
