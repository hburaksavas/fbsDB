import test from 'node:test';
import assert from 'node:assert/strict';
import {columnAliasKey,columnAliasStorageKey,loadTemplateAliases,normalizeAliasLabel,queryTemplateFingerprint,resolveColumnAliases,saveTemplateAlias} from '../src/columnAliases.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values}};
test('alias keys stay stable for duplicate names and reordered projections',()=>{
 const columns=[{name:'ID'},{name:'NAME'},{name:'ID'}];
 assert.deepEqual(columns.map((_,i)=>columnAliasKey(columns,i)),['ID#1','NAME#1','ID#2']);
 const aliases={'NAME#1':'Customer','ID#2':'Parent id','GONE#1':'Old'};
 assert.deepEqual(resolveColumnAliases([{name:'NAME'},{name:'ID'},{name:'ID'}],aliases),{labels:['Customer',null,'Parent id'],stale:['GONE#1']});
});
test('template fingerprint ignores comments, whitespace and unquoted case but not binds or quoted names',()=>{
 const base=queryTemplateFingerprint('select id from orders where id = :id');
 assert.equal(queryTemplateFingerprint('SELECT  id -- note\nFROM Orders WHERE id = :ID'),base);
 assert.notEqual(queryTemplateFingerprint('select id from orders where id = :other'),base);
 assert.notEqual(queryTemplateFingerprint('select "id" from orders where id = :id'),base);
 assert.match(base,/^[0-9a-f]{16}$/);assert.equal(queryTemplateFingerprint(''),'');
});
test('aliases persist per template without SQL text, clear on empty labels and tolerate storage failures',()=>{
 const storage=memory(),fingerprint=queryTemplateFingerprint('select secret_value from t');
 saveTemplateAlias(storage,fingerprint,'SECRET_VALUE#1','  Visible   value ');
 assert.deepEqual(loadTemplateAliases(storage,fingerprint),{'SECRET_VALUE#1':'Visible value'});
 assert.doesNotMatch(storage.values.get(columnAliasStorageKey),/select|from t/i);
 saveTemplateAlias(storage,fingerprint,'SECRET_VALUE#1','');assert.deepEqual(loadTemplateAliases(storage,fingerprint),{});
 assert.equal(normalizeAliasLabel('x'.repeat(200)).length,128);
 const broken={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};
 assert.deepEqual(saveTemplateAlias(broken,fingerprint,'A#1','Label'),{'A#1':'Label'});assert.deepEqual(loadTemplateAliases(broken,fingerprint),{});
});
test('template store keeps the most recently updated templates',()=>{
 const storage=memory();
 for(let i=0;i<205;i++)saveTemplateAlias(storage,`f${i}`,'A#1','L',i);
 const kept=JSON.parse(storage.values.get(columnAliasStorageKey));
 assert.equal(Object.keys(kept).length,200);assert.ok(kept.f204&&!kept.f0);
});
