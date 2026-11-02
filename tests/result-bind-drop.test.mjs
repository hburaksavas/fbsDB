import test from 'node:test';
import assert from 'node:assert/strict';
import {bindNameFor,cellDragData,parseCellDrag,planBindDrop} from '../src/resultBindDrop.js';
test('bind names are valid, lower case and unique among existing binds',()=>{
 assert.equal(bindNameFor('INVOICE_ID',[]),'invoice_id');assert.equal(bindNameFor('INVOICE_ID',['INVOICE_ID']),'invoice_id_2');
 assert.equal(bindNameFor('Total Amount ($)',[]),'total_amount');assert.match(bindNameFor('1st',[]),/^[a-z]/);assert.ok(bindNameFor('',[]).length>0);
});
test('dragged cells carry a typed value only when it is short, scalar and not sensitive',()=>{
 assert.deepEqual(parseCellDrag(cellDragData({name:'AMOUNT',type:'NUMBER(10,2)'},12.5)),{column:'AMOUNT',type:'NUMBER',value:'12.5',});
 assert.equal(parseCellDrag(cellDragData({name:'API_TOKEN',type:'VARCHAR2'},'abc')).value,null);
 assert.equal(parseCellDrag(cellDragData({name:'DOC',type:'CLOB'},'text')).value,null);
 assert.equal(parseCellDrag(cellDragData({name:'N',type:'VARCHAR2'},'x'.repeat(1001))).value,null);
 assert.equal(parseCellDrag(cellDragData({name:'N',type:'TIMESTAMP(6)'},null)).type,'TIMESTAMP');
 assert.equal(parseCellDrag('not json'),null);assert.equal(parseCellDrag('{"column":1}'),null);
});
test('a drop inserts only the placeholder and offers the value as a session suggestion',()=>{
 const plan=planBindDrop(cellDragData({name:'STATUS',type:'VARCHAR2'},"O'Brien; DROP"),['STATUS']);
 assert.equal(plan.insertText,':status_2');assert.ok(!plan.insertText.includes('Brien'));assert.deepEqual(plan.prefill,{name:'STATUS_2',type:'VARCHAR2',value:"O'Brien; DROP"});
 assert.equal(planBindDrop(cellDragData({name:'PASSWORD',type:'VARCHAR2'},'x'),[]).prefill,null);assert.equal(planBindDrop('garbage',[]),null);
});
