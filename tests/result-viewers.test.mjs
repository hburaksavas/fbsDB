import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultValueViewer,initialJsonExpansion,jsonTreeRows} from '../src/resultViewers.js';
test('viewer selection prefers column metadata, then supported content detection',()=>{
 assert.equal(defaultValueViewer({type:'JSON'},'not parsed'),'jsonTree');
 assert.equal(defaultValueViewer({type:'XMLTYPE'},'x'),'xml');
 assert.equal(defaultValueViewer({type:'CLOB'},'{"a":1}'),'jsonTree');
 assert.equal(defaultValueViewer({type:'VARCHAR2'},'<root/>'),'xml');
 assert.equal(defaultValueViewer({type:'NUMBER'},'{"a":1}'),'raw');
 assert.equal(defaultValueViewer({type:'VARCHAR2'},'plain'),'raw');
 assert.equal(defaultValueViewer({type:'BLOB'},{kind:'binary'}),'raw');
});
test('json tree rows expose paths, types and sizes for expanded containers only',()=>{
 const data={id:1,'odd key':null,tags:['a',{deep:true}]};
 const {rows}=jsonTreeRows(data,new Set(['$','$.tags']));
 assert.deepEqual(rows.map(r=>[r.path,r.type,r.depth]),[['$','object',0],['$.id','number',1],['$["odd key"]','null',1],['$.tags','array',1],['$.tags[0]','string',2],['$.tags[1]','object',2]]);
 assert.equal(rows.find(r=>r.path==='$.tags').size,2);assert.equal(rows.find(r=>r.path==='$.tags[1]').open,false);
 assert.equal(jsonTreeRows(Array.from({length:20},(_,i)=>i),new Set(['$']),5).truncated,true);
});
test('initial expansion opens the first levels only',()=>{
 const open=initialJsonExpansion({a:{b:{c:{}}},list:[{x:1}]});
 assert.deepEqual([...open].sort(),['$','$.a','$.list']);
});
