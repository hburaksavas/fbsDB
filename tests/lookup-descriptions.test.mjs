import test from 'node:test';
import assert from 'node:assert/strict';
import {descriptionMap,loadLookupDescriptions,lookupColumnKey,prepareDescriptionQuery,saveLookupDescription} from '../src/lookupDescriptions.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
test('loaded key values become binds in the configured query, never SQL text',()=>{
 const plan=prepareDescriptionQuery('SELECT id, name FROM customers WHERE id IN ({keys});',['7','7',"x' OR 1=1",null,'']);
 assert.equal(plan.sql,'SELECT id, name FROM customers WHERE id IN (:k0, :k1)');assert.deepEqual(plan.parameters.map(item=>[item.name,item.type,item.value]),[['K0','NUMBER','7'],['K1','VARCHAR2',"x' OR 1=1"]]);
 assert.deepEqual([plan.covered,plan.total],[2,2]);
});
test('the query needs one {keys} marker, one SELECT and no binds of its own; the key count is bounded',()=>{
 for(const [text,part] of [['SELECT 1 FROM dual','{keys} once'],['SELECT {keys} FROM t WHERE x IN ({keys})','{keys} once'],['DELETE FROM t WHERE id IN ({keys})','is one SELECT query only'],['SELECT id FROM t WHERE a = :b AND id IN ({keys})','binds of its own']])assert.match(prepareDescriptionQuery(text,['1']).error,new RegExp(part.replace(/[{}]/g,'\\$&')),text);
 assert.match(prepareDescriptionQuery('SELECT id FROM t WHERE id IN ({keys})',[]).error,/no values/);
 const many=prepareDescriptionQuery('SELECT id FROM t WHERE id IN ({keys})',Array.from({length:80},(_,i)=>String(i)));assert.deepEqual([many.covered,many.total],[50,80]);
});
test('descriptions annotate keys without replacing them',()=>{
 const map=descriptionMap([[7,'Ada','London'],['8',null,''],[null,'x'],['9','Bob']]);
 assert.equal(map.get('7'),'Ada · London');assert.equal(map.has('8'),false);assert.equal(map.get('9'),'Bob');assert.equal(map.size,2);
});
test('queries persist per source column and survive broken storage',()=>{
 const storage=memory(),key=lookupColumnKey({sourceSchema:'app',sourceTable:'orders',sourceColumn:'cust_id'});assert.equal(key,'APP.ORDERS.CUST_ID');assert.equal(lookupColumnKey({name:'X'}),null);
 saveLookupDescription(storage,key,' SELECT 1 ');assert.deepEqual(loadLookupDescriptions(storage),{[key]:'SELECT 1'});saveLookupDescription(storage,key,'');assert.deepEqual(loadLookupDescriptions(storage),{});
 storage.setItem('fbsdb.lookupDescriptions','{bad');assert.deepEqual(loadLookupDescriptions(storage),{});
});
