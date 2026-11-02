import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBindLookups,lookupParameters,pickedValue,prepareLookup,saveBindLookup} from '../src/bindLookup.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
test('a picker query is one SELECT that may only bind :search',()=>{
 const plan=prepareLookup("SELECT id, name FROM customers WHERE UPPER(name) LIKE UPPER(:search) || '%';");
 assert.equal(plan.error,undefined);assert.equal(plan.usesSearch,true);assert.equal(plan.sql.endsWith(';'),false);
 assert.equal(prepareLookup('SELECT id FROM t').usesSearch,false);
 for(const text of ['','DELETE FROM t','SELECT id FROM t WHERE a = :other','SELECT 1 FROM dual; SELECT 2 FROM dual'])assert.ok(prepareLookup(text).error,text);
 assert.match(prepareLookup('SELECT :a, :b FROM dual').error,/:A, :B/);
});
test('the search text is the only parameter sent and is passed as a bind value',()=>{
 assert.deepEqual(lookupParameters({usesSearch:true},"x' OR 1=1"),[{name:'SEARCH',type:'VARCHAR2',value:"x' OR 1=1",direction:'IN'}]);
 assert.deepEqual(lookupParameters({usesSearch:false},'ignored'),[]);
});
test('picked values are the first column as text and NULL is not pickable',()=>{
 assert.equal(pickedValue([42,'Ada']),'42');assert.equal(pickedValue([null,'x']),null);assert.equal(pickedValue([]),null);assert.equal(pickedValue('x'),null);
});
test('lookup queries persist per bind name, can be cleared and survive broken storage',()=>{
 const storage=memory();
 saveBindLookup(storage,'customer_id','SELECT id FROM c');assert.deepEqual(loadBindLookups(storage),{CUSTOMER_ID:'SELECT id FROM c'});
 saveBindLookup(storage,'CUSTOMER_ID','');assert.deepEqual(loadBindLookups(storage),{});
 storage.setItem('fbsdb.bindLookups','{bad');assert.deepEqual(loadBindLookups(storage),{});assert.deepEqual(loadBindLookups(null),{});
});
