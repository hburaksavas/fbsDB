import test from 'node:test';
import assert from 'node:assert/strict';
import {convertIdentifier,identifierWords,planIdentifierCase} from '../src/identifierCase.js';
const apply=(source,plan)=>[...plan.edits].reverse().reduce((text,edit)=>text.slice(0,edit.start)+edit.text+text.slice(edit.end),source);
const all=source=>({start:0,end:source.length});
test('identifier words split snake, camel, acronym and digit boundaries',()=>{
 assert.deepEqual(identifierWords('customerID2Name'),['customer','ID','2','Name']);
 assert.deepEqual(identifierWords('ORDER_LINE_ID'),['ORDER','LINE','ID']);
 assert.equal(convertIdentifier('orderLineId','snake'),'order_line_id');
 assert.equal(convertIdentifier('order_line_id','camel'),'orderLineId');
 assert.equal(convertIdentifier('order_line_id','pascal'),'OrderLineId');
 assert.equal(convertIdentifier('orderLineId','upper'),'ORDER_LINE_ID');
});
test('conversion leaves strings, comments, binds, keywords and quoted identifiers untouched by default',()=>{
 const source=`SELECT order_id, "MixedCase" FROM orders WHERE note = 'order_id' AND id = :order_id -- order_id\n`;
 const plan=planIdentifierCase(source,all(source),'camel');
 assert.equal(apply(source,plan),`SELECT orderId, "MixedCase" FROM orders WHERE note = 'order_id' AND id = :order_id -- order_id\n`);
 assert.deepEqual(plan.skipped.map(item=>item.reason).sort(),['Bind variable','Quoted identifier is case-sensitive']);
 assert.deepEqual(plan.renames.map(item=>[item.before,item.after,item.identityChanged]),[['order_id','orderId',true]]);
});
test('case-only changes of unquoted names keep Oracle identity; quoted conversion is opt-in and changes identity',()=>{
 const source='select order_id from Orders';
 const upper=planIdentifierCase(source,all(source),'upper');
 assert.equal(apply(source,upper),'select ORDER_ID from ORDERS');assert.equal(upper.identityChanges,0);
 const quoted='SELECT "orderId" FROM t';
 const plan=planIdentifierCase(quoted,all(quoted),'snake',{includeQuoted:true});
 assert.equal(apply(quoted,plan),'SELECT "order_id" FROM t');assert.equal(plan.identityChanges,1);assert.equal(plan.renames[0].quoted,true);
});
test('selection range, special characters, keyword results and limits are enforced',()=>{
 const source='v_first_name := v_last_name; x$y := a#b;';
 const plan=planIdentifierCase(source,{start:0,end:12},'camel');
 assert.equal(apply(source,plan),'vFirstName := v_last_name; x$y := a#b;');
 assert.equal(planIdentifierCase(source,all(source),'camel').skipped.filter(item=>item.reason==='Contains $ or #').length,2);
 assert.deepEqual(planIdentifierCase('Select_ := 1',all('Select_ := 1'),'snake').skipped.map(item=>item.reason),['Would become a keyword']);
 assert.match(planIdentifierCase('a',{start:0,end:0},'snake').error,/Select/);
 const big='a '.repeat(50001);assert.match(planIdentifierCase(big,all(big),'upper').error,/100,000/);
 const many=Array.from({length:2001},(_,i)=>`a_${i}`).join(' ');assert.match(planIdentifierCase(many,all(many),'camel').error,/2,000/);
 const renames=planIdentifierCase('a_b + a_b',all('a_b + a_b'),'camel').renames;assert.equal(renames.length,1);assert.equal(renames[0].count,2);
});
test('project dictionary expands known terms and inspects alternative spellings',()=>{
 const dictionary={style:'upper',terms:[{name:'customer',abbreviation:'cust',aliases:'custmer,client'}]};
 const source='SELECT custmer_id, cust_id FROM customer';
 const full=planIdentifierCase(source,all(source),'project-full',{dictionary});
 assert.equal(apply(source,full),'SELECT CUSTOMER_ID, CUSTOMER_ID FROM CUSTOMER');
 assert.deepEqual(full.inspections.map(item=>item.value),['custmer_id']);
 const short=planIdentifierCase(source,all(source),'project-short',{dictionary});
 assert.equal(apply(source,short),'SELECT CUST_ID, CUST_ID FROM CUST');
 assert.ok(short.identityChanges>0);
});
