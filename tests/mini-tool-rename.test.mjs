import test from 'node:test';
import assert from 'node:assert/strict';
import {validateToolName} from '../src/miniTools.js';
const tools=[{id:'a'.repeat(32),name:'Shared lookup'},{id:'b'.repeat(32),name:'Orders'}];
test('tool names are trimmed, bounded and unique ignoring case, excluding the tool itself',()=>{
 assert.equal(validateToolName(tools,'  New name ').name,'New name');
 assert.equal(validateToolName(tools,'').error,'Enter a tool name.');assert.match(validateToolName(tools,'x'.repeat(101)).error,/100/);
 assert.match(validateToolName(tools,'orders').error,/already/);
 assert.equal(validateToolName(tools,'ORDERS','b'.repeat(32)).name,'ORDERS');
});
