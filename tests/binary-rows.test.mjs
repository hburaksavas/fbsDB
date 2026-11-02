import test from 'node:test';
import assert from 'node:assert/strict';
import {binaryRows,byteChar,byteRange,describeByteRange} from '../src/binaryRows.js';
const bytes=Uint8Array.from([0x50,0x4b,0x03,0x04,...Array.from({length:30},(_,i)=>0x41+i)]);
test('rows keep one hex cell and one text cell per byte with absolute offsets',()=>{
 const rows=binaryRows(bytes,0);
 assert.equal(rows.length,3);assert.equal(rows[0].label,'00000000');assert.equal(rows[1].label,'00000010');
 assert.deepEqual(rows[0].cells.slice(0,4).map(c=>[c.at,c.hex,c.char]),[[0,'50','P'],[1,'4B','K'],[2,'03','.'],[3,'04','.']]);
 assert.equal(rows.at(-1).cells.length,2);
 assert.equal(binaryRows(bytes,16,8)[0].cells.length,8);
 assert.equal(byteChar(0x7f),'.');assert.equal(byteChar(0x20),' ');
});
test('ranges are order-independent and describe their offsets and hex',()=>{
 assert.deepEqual(byteRange(5,2),{start:2,end:5});assert.equal(byteRange(null,2),null);
 assert.deepEqual(describeByteRange(bytes,{start:0,end:1}),{length:2,label:'0x0–0x1 · 2 bytes',hex:'50 4B'});
 assert.equal(describeByteRange(bytes,{start:3,end:3}).label,'0x3–0x3 · 1 byte');
});
