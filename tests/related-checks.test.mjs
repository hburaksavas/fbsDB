import test from 'node:test';
import assert from 'node:assert/strict';
import {childCountQuery,interpretCount,normalizeRelations,relationLabel} from '../src/relatedChecks.js';
const relation={owner:'APP',table:'ORDERS',constraint:'FK_O',deleteRule:'NO ACTION',pairs:[{child:'CUST_ID',parent:'ID'}]};
const columns=[{name:'ID',type:'NUMBER',sourceColumn:'ID'},{name:'NAME',type:'VARCHAR2',sourceColumn:'NAME'}];
test('relations are read from either casing and labelled with their delete rule',()=>{
 const normalized=normalizeRelations({children:[{Owner:'APP',Table:'ORDERS',Constraint:'FK_O',DeleteRule:'cascade',Pairs:[{Child:'CUST_ID',Parent:'ID'}]}],parents:[{owner:'APP',table:'REGIONS',constraint:'FK_R',pairs:[{child:'REGION_ID',parent:'ID'}]}]});
 assert.equal(normalized.children[0].deleteRule,'CASCADE');assert.equal(normalized.parents[0].deleteRule,'NO ACTION');assert.equal(relationLabel(normalized.children[0]),'APP.ORDERS (CUST_ID) · CASCADE');
});
test('the count query uses binds for the deleted rows keys and reports what it cannot check',()=>{
 const query=childCountQuery(relation,[['1','a'],['2','b'],[null,'c']],columns);
 assert.equal(query.sql,'SELECT COUNT(*) FROM "APP"."ORDERS" WHERE ("CUST_ID" = :r0k0) OR ("CUST_ID" = :r1k0)');assert.deepEqual(query.parameters.map(item=>[item.type,item.value]),[['NUMBER','1'],['NUMBER','2']]);assert.deepEqual([query.covered,query.total],[2,3]);
 assert.match(childCountQuery({...relation,pairs:[{child:'C',parent:'MISSING'}]},[['1']],columns).error,/MISSING is not in the result/);
 assert.match(childCountQuery(relation,[[null,'x']],columns).error,/no key values/);
 assert.equal(childCountQuery(relation,Array.from({length:60},(_,i)=>[String(i),'x']),columns).covered,50);
});
test('counts are explained by the foreign key delete rule and carry the concurrency caveat',()=>{
 assert.equal(interpretCount(relation,0).status,'ok');assert.match(interpretCount(relation,3).message,/3 rows reference these rows and would block the delete \(ORA-02292\)/);
 assert.match(interpretCount({...relation,deleteRule:'CASCADE'},1).message,/1 row would also be deleted by the database \(ON DELETE CASCADE\)/);
 assert.match(interpretCount({...relation,deleteRule:'SET NULL'},2).message,/CUST_ID set to NULL/);
 assert.match(interpretCount(relation,0,{covered:50,total:80}).message,/Only 50 of 80 deleted rows were checked/);assert.match(interpretCount(relation,1).message,/Another session may change this/);
});
