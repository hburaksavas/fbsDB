import test from 'node:test';
import assert from 'node:assert/strict';
import {relatedFileProposals} from '../src/contextualFiles.js';
const rules={testPatterns:['tests/{name}_test.sql'],packagePairs:[],associations:[],project:{areas:{migrations:'db/migrations',scripts:'scripts',tests:'tests'}}};
const spec={name:'billing.pks',path:'D:/p/packages/billing.pks',content:'CREATE OR REPLACE PACKAGE billing AS\n  FUNCTION total(p_id IN NUMBER) RETURN NUMBER;\n  PROCEDURE reset(p_customer NUMBER, p_note VARCHAR2 DEFAULT NULL);\nEND billing;\n/'};
test('proposals follow the project rules and list calls with bind placeholders',()=>{
 const result=relatedFileProposals(spec,rules,['db/migrations/V002__x.sql','db/migrations/V010__y.sql','tests/other.sql']);
 assert.equal(result.error,'');assert.deepEqual(result.proposals.map(item=>item.id),['test','migration','example']);
 const [test_,migration,example]=result.proposals;
 assert.equal(test_.path,'tests/billing_test.sql');assert.equal(migration.path,'db/migrations/V011__billing_change.sql');assert.equal(example.path,'scripts/billing_example.sql');
 assert.match(example.content,/:result := billing\.total\(p_id => :p_id\);/);assert.match(example.content,/billing\.reset\(p_customer => :p_customer, p_note => :p_note\);/);
 assert.match(test_.content,/not a configured test framework/);assert.match(migration.content,/not done by fbsDB/);
});
test('existing targets are marked and non-source documents are refused',()=>{
 const result=relatedFileProposals(spec,rules,['Tests/Billing_Test.sql']);
 assert.equal(result.proposals[0].exists,true);assert.equal(result.proposals[1].exists,false);
 assert.match(relatedFileProposals({name:'q.sql',path:'D:/p/q.sql',content:'select 1 from dual'},rules,[]).error,/Open a package/);
 assert.equal(relatedFileProposals(spec,{associations:[],packagePairs:[],testPatterns:[]},[]).proposals[1].path,'migrations/V001__billing_change.sql');
});
