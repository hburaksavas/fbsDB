import test from 'node:test';
import assert from 'node:assert/strict';
import {findValueMatches,splitByMatches} from '../src/valueSearch.js';
test('matches carry line and column positions and respect case sensitivity',()=>{
 const text='{\n  "Name": "a",\n  "name": "b"\n}';
 assert.deepEqual(findValueMatches(text,'name').matches.map(m=>[m.line,m.column]),[[2,4],[3,4]]);
 assert.deepEqual(findValueMatches(text,'Name',{caseSensitive:true}).matches.map(m=>m.line),[2]);
 assert.deepEqual(findValueMatches(text,''),{matches:[],truncated:false});
 assert.equal(findValueMatches('aaaa','aa').matches.length,2);
});
test('large values stop at the limit and split keeps all text',()=>{
 const result=findValueMatches('x'.repeat(50),'x',{limit:10});
 assert.equal(result.matches.length,10);assert.equal(result.truncated,true);
 const parts=splitByMatches('one two one',findValueMatches('one two one','one').matches);
 assert.deepEqual(parts,[{text:'one',match:0},{text:' two '},{text:'one',match:1}]);
 assert.equal(parts.map(p=>p.text).join(''),'one two one');
});
