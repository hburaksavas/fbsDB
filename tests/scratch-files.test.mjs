import test from 'node:test';
import assert from 'node:assert/strict';
import {isScratch,nextScratchName,promptsOnClose} from '../src/scratchFiles.js';
test('scratch names count up from the highest open scratch',()=>{
 assert.equal(nextScratchName([]),'Scratch 1.sql');
 assert.equal(nextScratchName([{name:'Scratch 1.sql'},{name:'Scratch 3.sql'},{name:'Untitled.sql'},{name:'Scratch x.sql'}]),'Scratch 4.sql');
});
test('scratch tabs close without a save prompt until they are promoted to a project file',()=>{
 assert.equal(isScratch({scratch:true,path:null}),true);assert.equal(isScratch({scratch:true,path:'D:/p/a.sql'}),false);assert.equal(isScratch({path:null}),false);
 assert.equal(promptsOnClose({scratch:true,dirty:true}),false);
 assert.equal(promptsOnClose({scratch:true,path:'D:/p/a.sql',dirty:true}),true);
 assert.equal(promptsOnClose({dirty:true}),true);assert.equal(promptsOnClose({dirty:true,readOnly:true}),false);assert.equal(promptsOnClose({dirty:false}),false);
});
