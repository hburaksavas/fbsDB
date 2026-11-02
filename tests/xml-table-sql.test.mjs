import test from 'node:test';
import assert from 'node:assert/strict';
import {namespacePrefixes,xmlElementPath,xmlTableSql} from '../src/xmlTableSql.js';
const el=(local,uri,attributes=[],children=[])=>{const node={local,uri,attributes,children,parent:null};children.forEach(child=>child.parent=node);return node};
const ns='urn:orders',ext='urn:ext';
const item=el('item',ns,[{local:'id',uri:null},{local:'flag',uri:ext}],[el('sku',ns),el('qty',ns),el('sku',ns),el('meta',ns,[],[el('x',ns)])]);
const root=el('orders',ns,[],[el('items',ns,[],[item])]);
test('namespaces get stable prefixes and element paths use them',()=>{
 const prefixes=namespacePrefixes(root);
 assert.deepEqual([...prefixes],[[ns,'ns1'],[ext,'ns2']]);
 assert.equal(xmlElementPath(item,prefixes),'/ns1:orders/ns1:items/ns1:item');
});
test('XMLTABLE draft declares namespaces and maps attributes and unique leaf children',()=>{
 const sql=xmlTableSql({element:item,root,column:{name:'DOC'},sourceTable:'ORDERS_XML',sourceSchema:'APP'});
 assert.match(sql,/XMLTABLE\(XMLNAMESPACES\('urn:orders' AS "ns1", 'urn:ext' AS "ns2"\),/);
 assert.match(sql,/'\/ns1:orders\/ns1:items\/ns1:item'\n\s+PASSING t\.DOC/);
 assert.match(sql,/ID VARCHAR2\(4000\) PATH '@id',\n\s+FLAG VARCHAR2\(4000\) PATH '@ns2:flag',\n\s+SKU VARCHAR2\(4000\) PATH 'ns1:sku',\n\s+QTY VARCHAR2\(4000\) PATH 'ns1:qty'\) x;/);
 assert.match(sql,/FROM APP\.ORDERS_XML t,/);
});
test('namespace-free leaf elements use the element value and escape quotes',()=>{
 const plain=el("o'k",null);
 const sql=xmlTableSql({element:plain,root:plain,column:{name:'Doc'}});
 assert.doesNotMatch(sql,/XMLNAMESPACES/);assert.match(sql,/'\/o''k'/);assert.match(sql,/O_K VARCHAR2\(4000\) PATH '\.'/);assert.match(sql,/PASSING t\."Doc"/);
});
