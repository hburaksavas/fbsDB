import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBindDefinitions,saveBindDefinitions} from '../src/bindDefinitions.js';

test('reusable bind forms never persist values and use case-insensitive Windows file identity',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  saveBindDefinitions(storage,'C:/Workspace/report.sql',[{name:'id',type:'NUMBER',required:true,description:'Customer key',value:'secret',password:'secret'}]);
  assert.ok(![...data.values()][0].includes('secret'));
  assert.deepEqual(loadBindDefinitions(storage,'c:/workspace/REPORT.SQL',['id','new_bind']),[{name:'id',type:'NUMBER',required:true,description:'Customer key'},{name:'new_bind',type:'VARCHAR2',required:false,description:''}]);
});
