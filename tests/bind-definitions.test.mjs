import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBindDefinitions,saveBindDefinitions,projectBindDefinitions} from '../src/bindDefinitions.js';

test('reusable bind forms never persist values and use case-insensitive Windows file identity',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  saveBindDefinitions(storage,'C:/Workspace/report.sql',[{name:'id',type:'NUMBER',required:true,description:'Customer key',value:'secret',password:'secret'}]);
  assert.ok(![...data.values()][0].includes('secret'));
  assert.deepEqual(loadBindDefinitions(storage,'c:/workspace/REPORT.SQL',['id','new_bind']),[{name:'id',type:'NUMBER',required:true,description:'Customer key',label:'',defaultValue:''},{name:'new_bind',type:'VARCHAR2',label:'',defaultValue:'',required:false,description:''}]);
});


test('project bind definitions seed type/description while file overrides win and values stay absent',()=>{
 const variables=[{name:'CUSTOMER_ID',type:'NUMBER',required:true,description:'Project customer key',value:'secret'}];
 const storage={getItem:()=>null};
 const result=projectBindDefinitions(storage,'C:/report.sql',['customer_id','other'],variables);
 assert.deepEqual(result,[{name:'customer_id',type:'NUMBER',required:true,description:'Project customer key',label:'',defaultValue:''},{name:'other',type:'VARCHAR2',required:false,description:'',label:'',defaultValue:''}]);
 assert.ok(!JSON.stringify(result).includes('secret'));
 assert.equal(projectBindDefinitions({getItem:()=>JSON.stringify([{name:'customer_id',type:'VARCHAR2'}])},'C:/report.sql',['CUSTOMER_ID'],variables)[0].type,'VARCHAR2');
 assert.equal(projectBindDefinitions(storage,null,['CUSTOMER_ID'],variables)[0].type,'NUMBER');
});
test('labels and defaults are normalized; sensitive, CLOB and long defaults are dropped',async()=>{
 const {normalizeBindDefinitions,defaultAllowed}=await import('../src/bindDefinitions.js');
 const result=normalizeBindDefinitions([{name:'ID',type:'NUMBER',label:'Customer id',defaultValue:'42'},{name:'DB_PASSWORD',defaultValue:'x'},{name:'NOTE',type:'CLOB',defaultValue:'y'},{name:'LONG',defaultValue:'z'.repeat(1001)}],['ID','DB_PASSWORD','NOTE','LONG']);
 assert.deepEqual(result.map(item=>[item.label,item.defaultValue]),[['Customer id','42'],['',''],['',''],['','']]);
 assert.equal(defaultAllowed('TOKEN','VARCHAR2','x'),false);assert.equal(defaultAllowed('ID','NUMBER','1'),true);assert.equal(defaultAllowed('ID','NUMBER',''),false);
});
