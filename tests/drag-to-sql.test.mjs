import test from 'node:test';
import assert from 'node:assert/strict';
import {dragSqlDraft} from '../src/dragToSql.js';

const orders={owner:'APP',name:'ORDERS',type:'TABLE',columns:[{name:'ID'},{name:'Customer Name'}],foreignKeys:[{owner:'APP',table:'ORDERS',name:'FK_CUSTOMER',column:'CUSTOMER_ID',targetOwner:'APP',targetTable:'CUSTOMERS',targetColumn:'ID',position:1}]};
const customers={owner:'APP',name:'CUSTOMERS',type:'TABLE',columns:[{name:'ID'}]};
test('table and column drags produce quoted, editable SELECT drafts',()=>{
 assert.match(dragSqlDraft(orders).text,/t\.ID,\n  t\."Customer Name"/);
 assert.match(dragSqlDraft(orders,'Customer Name').text,/SELECT\n  t\."Customer Name"/);
 assert.equal(dragSqlDraft(orders,'MISSING'),null);
});
test('a verified single FK produces a composite-safe JOIN draft',()=>{
 const draft=dragSqlDraft(customers,null,'SELECT * FROM APP.ORDERS',[orders,customers]);
 assert.equal(draft.kind,'join');assert.match(draft.text,/a\.CUSTOMER_ID = b\.ID/);
 assert.equal(dragSqlDraft(customers,null,'SELECT * FROM other',[orders,customers]).kind,'select');
});
