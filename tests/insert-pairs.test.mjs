import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPlaceholder,insertPairsAt} from '../src/insertPairs.js';
const sql='INSERT INTO orders (id, "Customer Name", total) VALUES (:id, UPPER(:n), NVL(:t, 0));';
const slice=(item)=>sql.slice(item.start,item.end);
test('pairs columns with values from either side of the statement',()=>{
 const onValue=insertPairsAt(sql,sql.indexOf('UPPER')+2);
 assert.equal(onValue.side,'values');assert.equal(onValue.index,1);
 assert.deepEqual(onValue.columns.map(item=>item.name),['id','Customer Name','total']);
 assert.deepEqual(onValue.values.map(slice),[':id','UPPER(:n)','NVL(:t, 0)']);
 const onColumn=insertPairsAt(sql,sql.indexOf('total')+1);
 assert.equal(onColumn.side,'columns');assert.equal(onColumn.index,2);assert.equal(onColumn.mismatch,false);
});
test('missing values keep their slot and mismatches are reported',()=>{
 const text='BEGIN\n  INSERT INTO t (a, b, c) VALUES (1, );\nEND;';
 const pairs=insertPairsAt(text,text.indexOf(', )')+2);
 assert.equal(pairs.side,'values');assert.equal(pairs.index,1);assert.equal(pairs.values[1].empty,true);assert.equal(pairs.mismatch,true);
 assert.equal(insertPairsAt('INSERT INTO t SELECT * FROM s',5),null);
 assert.equal(insertPairsAt('SELECT 1 FROM dual',3),null);
 assert.equal(insertPairsAt('INSERT INTO t (a, b) VALUES (1, 2)',3).side,null);
});
test('placeholders follow column names',()=>{
 assert.equal(bindPlaceholder('Customer Name'),':customer_name');assert.equal(bindPlaceholder('1st'),':c1st');
});
