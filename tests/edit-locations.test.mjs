import test from 'node:test';
import assert from 'node:assert/strict';
import {EditLocations,transformEditOffset,currentExecutionOffset} from '../src/editLocations.js';
test('edit anchors follow insertions/replacements and histories remain isolated by document',()=>{
 const history=new EditLocations();history.record('a',[{rangeOffset:10,rangeLength:0,text:'abc'}],100,1);history.record('b',[{rangeOffset:5,rangeLength:0,text:'x'}],100,2);history.record('a',[{rangeOffset:0,rangeLength:0,text:'prefix'}],106,3);
 assert.equal(history.items[0].offset,19);assert.equal(history.items[1].offset,6);
 assert.equal(history.last(()=>true).tabId,'a');assert.equal(history.move(-1,()=>true).tabId,'b');assert.equal(history.move(1,()=>true).tabId,'a');
 history.forget('b');assert.ok(history.items.every(item=>item.tabId==='a'));
 assert.equal(transformEditOffset(15,[{rangeOffset:10,rangeLength:8,text:'new'}]),13);
});
test('execution navigation uses unique current SQL or preserves the need for an exact snapshot',()=>{
 const context={editorSnapshot:'SELECT 1 FROM dual;',executedSql:'SELECT 1 FROM dual;',statementOffset:0};
 assert.equal(currentExecutionOffset(context,{content:context.editorSnapshot}),0);
 assert.equal(currentExecutionOffset(context,{content:'SELECT 2 FROM dual;\nSELECT 1 FROM dual;'}),20);
 assert.equal(currentExecutionOffset(context,{content:'SELECT 1 FROM dual;\nSELECT 1 FROM dual;'}),null);
 assert.equal(currentExecutionOffset(context,{content:'SELECT 2 FROM dual;'}),null);
});
