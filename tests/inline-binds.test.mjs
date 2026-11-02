import test from 'node:test';
import assert from 'node:assert/strict';
import {InlineBindStore,bindOccurrences,datetimeBindText,inlineBindParameters,inputKind} from '../src/inlineBinds.js';
test('occurrences list every use, skipping strings, comments and ::',()=>{
 const sql="SELECT :id, ':no' FROM t WHERE a = :id AND b = :Name -- :comment\nAND x::y";
 assert.deepEqual(bindOccurrences(sql).map(item=>item.name),['ID','ID','NAME']);
 const first=bindOccurrences(sql)[0];assert.equal(sql.slice(first.start,first.end),':id');
});
test('controls follow Oracle types and flag-like names',()=>{
 assert.equal(inputKind('D','DATE'),'datetime');assert.equal(inputKind('T','TIMESTAMP'),'datetime');assert.equal(inputKind('N','NUMBER'),'number');
 assert.equal(inputKind('IS_ACTIVE','VARCHAR2'),'choice');assert.equal(inputKind('NAME','VARCHAR2'),'text');assert.equal(inputKind('IS_ACTIVE','NUMBER'),'number');
});
test('calendar values become parseable bind text',()=>{
 assert.equal(datetimeBindText('2026-11-02'),'2026-11-02 00:00:00');assert.equal(datetimeBindText('2026-11-02T10:30'),'2026-11-02 10:30:00');assert.equal(datetimeBindText('2026-11-02T10:30:15'),'2026-11-02 10:30:15');assert.equal(datetimeBindText(''),'');
});
test('NULL, empty and untouched binds are distinct and repeated binds share one entry',()=>{
 const store=new InlineBindStore(),key='tab-1|DEV';
 store.set(key,'a',{type:'NUMBER',value:'5'});store.set(key,'b',{isNull:true});
 let result=inlineBindParameters(['A','B','C'],name=>store.get(key,name));
 assert.deepEqual(result.parameters,[{name:'A',type:'NUMBER',value:'5'},{name:'B',type:'VARCHAR2',value:null}]);assert.deepEqual(result.missing,['C']);
 store.set(key,'c',{type:'DATE',value:'2026-11-02T08:00'});result=inlineBindParameters(['C'],name=>store.get(key,name));assert.equal(result.parameters[0].value,'2026-11-02 08:00:00');
 store.set(key,'b',{value:'x'});assert.equal(store.get(key,'B').isNull,false);store.set(key,'b',{isNull:true});assert.equal(store.get(key,'B').value,'');
 assert.equal(store.get('tab-2|DEV','A'),undefined);store.clear(key);assert.equal(store.get(key,'A'),undefined);
});
