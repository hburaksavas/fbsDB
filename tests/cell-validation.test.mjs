import test from 'node:test';
import assert from 'node:assert/strict';
import {byteLength,invalidDraftCells,lengthMeter,validateCell} from '../src/cellValidation.js';
test('lengths are counted in characters and UTF-8 bytes against the column semantics',()=>{
 assert.equal(byteLength('İş'),4);
 assert.deepEqual(lengthMeter('İş',{size:3}),{chars:2,bytes:4,limit:3,unit:'bytes',used:4,over:true});
 assert.equal(lengthMeter('İş',{size:3,lengthSemantics:'CHAR'}).over,false);assert.equal(lengthMeter('x',{}).limit,null);
});
test('numbers are checked for format, precision and scale',()=>{
 const column={name:'AMOUNT',type:'NUMBER',precision:5,scale:2};
 assert.equal(validateCell(column,{value:'123.45'}),null);assert.equal(validateCell(column,{value:'-1e3'}),null);
 assert.match(validateCell(column,{value:'abc'}),/needs a number/);assert.match(validateCell(column,{value:'1234.5'}),/3 digits before/);assert.match(validateCell(column,{value:'1.234'}),/2 decimal places/);
 assert.equal(validateCell(column,{value:'1.200'}),null,'Trailing zeros do not count');
 assert.equal(validateCell({name:'CUSTOMER_ID',type:'NUMBER',precision:38,scale:127},{value:'1001'}),null,'NUMBER without declared precision has no digit limit');
 assert.equal(validateCell({name:'F',type:'FLOAT',precision:126,scale:-127},{value:'12345.678'}),null);
 assert.equal(validateCell({name:'N',type:'NUMBER',precision:3,scale:-2},{value:'12300'}),null,'Negative scale widens the integer part');
 assert.match(validateCell({name:'N',type:'NUMBER',precision:2,scale:5},{value:'1'}),/0 digits before/);
});
test('NULL, dates and text length are checked locally',()=>{
 assert.match(validateCell({name:'ID',type:'NUMBER',nullable:false},{isNull:true}),/does not allow NULL/);assert.equal(validateCell({name:'N',type:'VARCHAR2',nullable:true},{isNull:true}),null);
 for(const type of ['TIMESTAMP WITH TIME ZONE','TIMESTAMP WITH LOCAL TIME ZONE']){
  for(const value of ['2026-11-02 10:30:00+03:00','2026-11-02T10:30:00.123456789-03:30','2026-11-02 10:30:00Z'])assert.equal(validateCell({name:'T',type},{value}),null,value);
  for(const value of ['2026-11-02 10:30:00','2026-11-02 10:30+03:00','2026-11-02 10:30:00 +03:00','2026-11-02T10:30:00-04:00[America/New_York]'])assert.match(validateCell({name:'T',type},{value}),/needs a date with its offset/,value);
 }
 assert.match(validateCell({name:'D',type:'DATE'},{value:'tomorrow'}),/needs a date/);assert.equal(validateCell({name:'D',type:'DATE'},{value:'2026-11-02 10:30:00'}),null);
 assert.match(validateCell({name:'S',type:'VARCHAR2',size:3},{value:'abcd'}),/at most 3 bytes; this value has 4/);assert.equal(validateCell({name:'S',type:'VARCHAR2',size:3},{value:'abc'}),null);
});
test('invalid staged cells are listed in grid order',()=>{
 const columns=[{name:'A',type:'NUMBER'},{name:'B',type:'VARCHAR2',size:2}];
 const list=invalidDraftCells({'3:1':{value:'xyz'},'1:0':{value:'q'},'2:0':{value:'7'}},columns);
 assert.deepEqual(list.map(item=>`${item.row}:${item.col}`),['1:0','3:1']);
});
