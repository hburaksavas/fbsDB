import test from 'node:test';
import assert from 'node:assert/strict';
import {serverSourceTree,virtualSourceName} from '../src/serverSources.js';
const objects=[{owner:'APP',name:'PKG_A',type:'PACKAGE'},{owner:'APP',name:'PKG_A',type:'PACKAGE BODY'},{owner:'APP',name:'PKG_B',type:'PACKAGE'},{owner:'APP',name:'P1',type:'PROCEDURE'},{owner:'APP',name:'T',type:'TABLE'},{name:'F1',type:'FUNCTION'}];
test('only source-bearing objects appear, grouped by kind with packages split into specification and body',()=>{
 const tree=serverSourceTree(objects,{defaultOwner:'APP'});
 assert.deepEqual(tree.groups.map(group=>group.label),['Packages','Procedures','Functions']);assert.equal(tree.count,4);
 const [a,b]=tree.groups[0].items;assert.deepEqual(a.parts.map(part=>part.label),['Specification','Body']);assert.deepEqual(b.parts.map(part=>part.label),['Specification']);
 assert.deepEqual(a.parts[1].target,{owner:'APP',name:'PKG_A',type:'PACKAGE',body:true});
 assert.equal(tree.groups[2].items[0].owner,'APP');
});
test('queries filter by owner and name and virtual names carry the source extension',()=>{
 assert.equal(serverSourceTree(objects,{query:'pkg_b'}).count,1);assert.equal(serverSourceTree(objects,{query:'zzz'}).groups.length,0);
 assert.equal(virtualSourceName('APP','PKG_A','PACKAGE BODY'),'APP.PKG_A.pkb');assert.equal(virtualSourceName('A','B','TABLE'),'A.B.sql');
 assert.deepEqual(serverSourceTree(null),{groups:[],count:0});
});
