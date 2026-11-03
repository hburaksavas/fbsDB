import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmSummary} from '../src/applyConfirm.js';
const statements=[{kind:'update',expectRows:1},{kind:'update',expectRows:1},{kind:'insert',expectRows:1},{kind:'delete',expectRows:1}];
test('the summary counts statements and rows by kind and names the button after the effect',()=>{
 const result=confirmSummary({statements,target:{profileName:'HR Test',environment:'TEST'}});
 assert.equal(result.headline,'4 statements · about 4 rows affected (2 updates, 1 insert, 1 delete)');
 assert.equal(result.buttonLabel,'Apply 4 changes');assert.equal(result.target,'HR Test · TEST');assert.equal(result.isProd,false);assert.equal(result.warning,'');
 assert.equal(confirmSummary({statements:[statements[0]],target:{}}).buttonLabel,'Apply 1 change');
});
test('a production target is called out with its name',()=>{
 const result=confirmSummary({statements,target:{profileName:'Payroll',environment:'prod'}});
 assert.equal(result.isProd,true);assert.match(result.warning,/PRODUCTION connection \(Payroll\)/);assert.equal(result.target,'Payroll · PROD');
});
test('an unnamed or unknown target is shown honestly and drafts left out are mentioned',()=>{
 const result=confirmSummary({statements,target:{environment:'UNKNOWN'},excludedCount:2});
 assert.equal(result.unknownTarget,true);assert.equal(result.target,'Connection not named');assert.equal(result.isProd,false);
 assert.equal(result.note,'2 pending changes stay a draft.');
 assert.equal(confirmSummary({statements,target:null,excludedCount:1}).note,'1 pending change stays a draft.');
});
test('rows follow the expected row counts of the statements',()=>{
 assert.match(confirmSummary({statements:[{kind:'delete',expectRows:3}]}).headline,/about 3 rows affected \(1 delete\)/);
});
