import test from 'node:test';
import assert from 'node:assert/strict';
import {detectSmartLink} from '../src/smartLinks.js';
test('URLs and email addresses are recognized inside values without trailing punctuation',()=>{
 assert.deepEqual(detectSmartLink('See https://example.com/a?b=1).'),{kind:'url',text:'https://example.com/a?b=1',target:'https://example.com/a?b=1'});
 assert.equal(detectSmartLink('ftp://example.com'),null);
 assert.deepEqual(detectSmartLink('Contact: Ops.Team+db@example.co.uk'),{kind:'email',text:'Ops.Team+db@example.co.uk',target:'mailto:Ops.Team+db@example.co.uk'});
});
test('Windows and UNC paths are recognized; only Oracle source files can open in the editor',()=>{
 assert.deepEqual(detectSmartLink('C:\\scripts\\billing.pkb'),{kind:'path',text:'C:\\scripts\\billing.pkb',target:'C:\\scripts\\billing.pkb',openable:true});
 assert.equal(detectSmartLink('\\\\server\\share\\report.pdf').openable,false);
 assert.equal(detectSmartLink('relative\\file.sql'),null);
});
test('qualified Oracle object references follow quoting rules; plain words and other values are ignored',()=>{
 assert.deepEqual(detectSmartLink('app.Invoices'),{kind:'object',text:'app.Invoices',owner:'APP',name:'INVOICES'});
 assert.deepEqual(detectSmartLink('"App"."Mixed Name"'),{kind:'object',text:'"App"."Mixed Name"',owner:'App',name:'Mixed Name'});
 for(const value of ['INVOICES','12.50','a.b.c',null,'',{kind:'binary'},'1.5e3'])assert.equal(detectSmartLink(value),null,String(value));
});
