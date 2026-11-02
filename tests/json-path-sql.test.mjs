import test from 'node:test';
import assert from 'node:assert/strict';
import {jsonFieldAlias,jsonFieldSql,oracleJsonPath} from '../src/jsonPathSql.js';
test('tree paths convert to Oracle SQL/JSON path syntax',()=>{
 assert.equal(oracleJsonPath('$.order.lines[0].sku'),'$.order.lines[0].sku');
 assert.equal(oracleJsonPath('$["odd key"].x'),'$."odd key".x');
 assert.equal(oracleJsonPath('$["say \\"hi\\""]'),'$."say \\"hi\\""');
});
test('aliases come from the last key and stay valid identifiers',()=>{
 assert.equal(jsonFieldAlias('$.order.lines[0].sku'),'SKU');
 assert.equal(jsonFieldAlias('$["2nd value"]'),'ND_VALUE');
 assert.equal(jsonFieldAlias('$[3]'),'VALUE');
});
test('scalar and container drafts choose JSON_VALUE or JSON_QUERY with escaped literals',()=>{
 const scalar=jsonFieldSql({column:{name:'BODY',sourceTable:'EVENTS'},path:"$.o'k",type:'number',sourceTable:'EVENTS',sourceSchema:'APP'});
 assert.match(scalar,/SELECT JSON_VALUE\(t\.BODY, '\$\.o''k' RETURNING NUMBER NULL ON ERROR\) AS O\nFROM APP\.EVENTS t;/);
 const container=jsonFieldSql({column:{name:'Body'},path:'$.order.lines',type:'array'});
 assert.match(container,/JSON_QUERY\(t\."Body", '\$\.order\.lines' RETURNING CLOB\) AS LINES\nFROM \/\* source table \*\/ your_table t;/);
 assert.match(jsonFieldSql({column:{name:'B'},path:'$.flag',type:'boolean'}),/RETURNING VARCHAR2\(5\)/);
});
