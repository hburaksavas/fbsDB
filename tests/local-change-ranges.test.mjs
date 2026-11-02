import test from 'node:test';
import assert from 'node:assert/strict';
import {localChangeRanges} from '../src/localChangeRanges.js';
test('local changes separate independent edits, anchor deletions and disappear on text reversion',()=>{
 assert.deepEqual(localChangeRanges('a\nb\nc\nd\ne','a\nB\nc\nd\nE').ranges,[{start:2,end:2},{start:5,end:5}]);
 assert.deepEqual(localChangeRanges('a\nb\nc','a\nc').ranges,[{start:2,end:2}]);
 assert.deepEqual(localChangeRanges('a\nb','a\nb\nc').ranges,[{start:3,end:3}]);
 assert.deepEqual(localChangeRanges('a\nb','a\nb'),{ranges:[],coarse:false});
 assert.deepEqual(localChangeRanges('a\r\nb','a\nb').ranges,[]);
});
test('unrelated huge line spans use bounded coarse comparison',()=>{
 const result=localChangeRanges(Array.from({length:2000},(_,i)=>`before ${i}`).join('\n'),Array.from({length:2000},(_,i)=>`after ${i}`).join('\n'));
 assert.equal(result.coarse,true);assert.deepEqual(result.ranges,[{start:1,end:2000}]);
});
