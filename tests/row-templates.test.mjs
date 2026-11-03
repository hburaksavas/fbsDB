import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRowTemplates,removeRowTemplate,saveRowTemplate,templateFromRow,templateTableKey,valuesFromTemplate} from '../src/rowTemplates.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
const columns=[{name:'ID',sourceColumn:'ID'},{name:'STATUS',sourceColumn:'STATUS'},{name:'API_TOKEN',sourceColumn:'API_TOKEN'},{name:'DOC',sourceColumn:'DOC'},{name:'NOTE',sourceColumn:'NOTE'}];
const editable=[{editable:true},{editable:true},{editable:true},{editable:false},{editable:true}];
test('templates keep field presets by name and leave out keys, locked and secret-looking columns',()=>{
 const {template,left}=templateFromRow({0:{value:'7'},1:{value:'NEW'},2:{value:'abc'},3:{value:'x'},4:{isNull:true}},columns,editable,[0],'  Open item ');
 assert.deepEqual(template,{name:'Open item',values:{STATUS:{value:'NEW'},NOTE:{isNull:true}}});assert.deepEqual(left,['ID','API_TOKEN','DOC']);
});
test('a template becomes new-row values for the result in hand and reports columns it cannot fill',()=>{
 const {values,missing}=valuesFromTemplate({name:'t',values:{STATUS:{value:'NEW'},GONE:{value:'x'},DOC:{value:'y'}}},columns,editable);
 assert.deepEqual(values,{1:{value:'NEW'}});assert.deepEqual(missing,['GONE','DOC']);
});
test('templates persist per table, replace same-named ones and survive broken storage',()=>{
 const storage=memory(),key=templateTableKey({sourceSchema:'app',sourceTable:'t'});assert.equal(key,'APP.T');assert.equal(templateTableKey({name:'X'}),null);
 saveRowTemplate(storage,key,{name:'A',values:{X:{value:'1'}}});saveRowTemplate(storage,key,{name:'a',values:{X:{value:'2'}}});
 assert.deepEqual(loadRowTemplates(storage)[key].map(item=>item.values.X.value),['2']);
 assert.deepEqual(removeRowTemplate(storage,key,'a')[key],[]);
 storage.setItem('fbsdb.rowTemplates','{bad');assert.deepEqual(loadRowTemplates(storage),{});assert.deepEqual(loadRowTemplates(null),{});
});
