import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCheck,loadCommitChecks,prepareCheck,saveCommitChecks} from '../src/commitChecks.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
test('a check is one named SELECT without binds and flags calls that may have side effects',()=>{
 const ok=prepareCheck({name:'Orphans',sql:'SELECT id FROM child c WHERE NOT EXISTS (SELECT 1 FROM parent p WHERE p.id = c.pid);'});
 assert.equal(ok.error,undefined);assert.equal(ok.check.sql.endsWith(';'),false);assert.deepEqual(ok.calls,[]);assert.equal(ok.check.expect,'none');
 assert.deepEqual(prepareCheck({name:'F',sql:'SELECT audit_pkg.log(1) FROM dual'}).calls,['audit_pkg.log']);
 for(const bad of [{name:'',sql:'SELECT 1 FROM dual'},{name:'x',sql:'DELETE FROM t'},{name:'x',sql:'SELECT :a FROM dual'},{name:'x',sql:'SELECT 1 FROM dual; SELECT 2 FROM dual'}])assert.ok(prepareCheck(bad).error,JSON.stringify(bad));
 assert.match(prepareCheck({name:'orphans',sql:'SELECT 1 FROM dual'},[{name:'Orphans'}]).error,/already/);
});
test('outcomes follow the expectation but always carry the rows',()=>{
 const rows=[[1],[2]],base={rows,columns:[{name:'ID'}]};
 assert.equal(evaluateCheck({name:'a',expect:'none'},base).status,'attention');assert.equal(evaluateCheck({name:'a',expect:'none'},{rows:[],columns:[]}).status,'ok');
 assert.equal(evaluateCheck({name:'a',expect:'any'},base).status,'ok');assert.equal(evaluateCheck({name:'a',expect:'any'},{rows:[]}).status,'attention');
 assert.equal(evaluateCheck({name:'a',expect:'info'},base).message,'2 rows returned.');assert.equal(evaluateCheck({name:'a',expect:'none'},{rows,truncated:true}).message,'2+ rows returned; expected none.');
 assert.deepEqual(evaluateCheck({name:'a',expect:'none'},{error:'ORA-00942'}),{name:'a',status:'error',message:'ORA-00942',rows:[]});
});
test('checks persist, are bounded and survive broken storage',()=>{
 const storage=memory();saveCommitChecks(storage,[{name:'A',sql:'SELECT 1 FROM dual',expect:'any'}]);
 assert.deepEqual(loadCommitChecks(storage),[{name:'A',sql:'SELECT 1 FROM dual',expect:'any'}]);
 storage.setItem('fbsdb.commitChecks','{bad');assert.deepEqual(loadCommitChecks(storage),[]);assert.deepEqual(loadCommitChecks(null),[]);
 storage.setItem('fbsdb.commitChecks',JSON.stringify([{name:'Z',sql:'SELECT 1 FROM dual',expect:'weird'},{bad:1}]));assert.equal(loadCommitChecks(storage)[0].expect,'none');assert.equal(loadCommitChecks(storage).length,1);
});
