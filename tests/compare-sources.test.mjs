import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonSummary,placeSources,readDroppedFiles} from '../src/compareSources.js';
const file=(name,size,type='')=>({name,size,type,body:name+' text'});
const read=async item=>item.body;
test('dropped files are limited to two small text files and rejections are explained',async()=>{
 const result=await readDroppedFiles([file('a.sql',10),file('b.pkb',10),file('c.sql',10)],read);
 assert.deepEqual(result.accepted.map(item=>item.label),['a.sql','b.pkb']);assert.match(result.rejected[0].reason,/Only two/);
 const mixed=await readDroppedFiles([file('big.sql',3*1024*1024),file('photo.png',10,'image/png'),{name:'bin.sql',size:5,type:'',body:'a\u0000b'},file('ok.txt',5,'text/plain')],async item=>item.body);
 assert.deepEqual(mixed.rejected.map(item=>item.reason),['Larger than 2 MB.','Not a text file.','Contains binary data.']);assert.equal(mixed.accepted[0].label,'ok.txt');
 assert.deepEqual(await readDroppedFiles(null,read),{accepted:[],rejected:[]});
});
test('sources fill the empty side first and a pair fills both',()=>{
 const a={label:'a',text:'1'},b={label:'b',text:'2'},c={label:'c',text:'3'};
 assert.deepEqual(placeSources({left:null,right:null},[a]),{left:a,right:null});
 assert.deepEqual(placeSources({left:a,right:null},[b]),{left:a,right:b});
 assert.deepEqual(placeSources({left:a,right:b},[c]),{left:a,right:c});
 assert.deepEqual(placeSources({left:a,right:b},[b,c]),{left:b,right:c});assert.deepEqual(placeSources({left:a},[]),{left:a});
});
test('summaries describe missing, identical and different sides',()=>{
 assert.match(comparisonSummary(null,{text:'x'}),/both sides/);
 assert.match(comparisonSummary({text:'x'},{text:'x'}),/identical/);
 assert.match(comparisonSummary({text:'a\nb'},{text:'a\nb\nc'}),/2 lines vs 3 lines/);
});
