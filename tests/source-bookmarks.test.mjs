import test from 'node:test';
import assert from 'node:assert/strict';
import {readSourceBookmarks,serializeSourceBookmarks,bookmarkMatches} from '../src/sourceBookmarks.js';
test('bookmark persistence contains only named file positions, excluding drafts, source text and execution values',()=>{
 const marks=[{id:'a',name:'Invoice',path:'C:/work/a.sql',root:'C:/work',lineNumber:4,column:2,content:'secret',parameters:'secret'},{id:'draft',name:'Draft',path:null,lineNumber:1,column:1},{id:'server',name:'Server',path:null,server:true,lineNumber:3,column:1}];
 const serialized=serializeSourceBookmarks(marks);assert.equal(serialized.items.length,1);assert.ok(!JSON.stringify(serialized).includes('secret'));assert.equal(readSourceBookmarks(JSON.stringify(serialized)).items[0].name,'Invoice');
 assert.ok(bookmarkMatches(marks[0],{id:'different-view',path:'c:/WORK/A.sql'},'c:/work'));assert.equal(bookmarkMatches(marks[0],{path:'C:/work/a.sql'},'C:/other'),false);
});
test('future/corrupt bookmark storage remains protected and invalid positions are excluded',()=>{
 assert.equal(readSourceBookmarks('{broken').writable,false);assert.equal(readSourceBookmarks('{"version":99,"items":[]}').writable,false);
 assert.equal(readSourceBookmarks('{"version":1,"items":[{"id":"bad","name":"bad","path":"C:/a.sql","lineNumber":0,"column":1}]}').items.length,0);
 assert.equal(readSourceBookmarks(null).writable,true);
});
