import test from 'node:test';
import assert from 'node:assert/strict';
import {booleanColumnKey,booleanPresets,booleanState,loadBooleanColumns,presetFor,saveBooleanColumn,toggledValue} from '../src/booleanColumns.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
test('mappings are keyed by source column and persisted only for known presets',()=>{
 const storage=memory(),key=booleanColumnKey({sourceSchema:'app',sourceTable:'t',sourceColumn:'active'});
 assert.equal(key,'APP.T.ACTIVE');assert.equal(booleanColumnKey({name:'X'}),null);
 saveBooleanColumn(storage,key,'yn');assert.deepEqual(loadBooleanColumns(storage),{'APP.T.ACTIVE':'yn'});
 saveBooleanColumn(storage,'A.B.C','bogus');assert.deepEqual(loadBooleanColumns(storage),{'APP.T.ACTIVE':'yn'});
 saveBooleanColumn(storage,key,'none');assert.deepEqual(loadBooleanColumns(storage),{});
 storage.setItem('fbsdb.booleanColumns','{bad');assert.deepEqual(loadBooleanColumns(storage),{});assert.equal(presetFor('none'),null);
});
test('values map to on, off, NULL or other and toggling never invents a third value',()=>{
 const yn=presetFor('yn');
 assert.deepEqual(['Y','y','N',null,'maybe'].map(value=>booleanState(yn,value)),['on','on','off','null','other']);
 assert.equal(toggledValue(yn,'Y'),'N');assert.equal(toggledValue(yn,'N'),'Y');assert.equal(toggledValue(yn,null),'Y');assert.equal(toggledValue(yn,'maybe'),'Y');
 assert.equal(booleanPresets.length,5);assert.equal(toggledValue(presetFor('10'),'1'),'0');
});
