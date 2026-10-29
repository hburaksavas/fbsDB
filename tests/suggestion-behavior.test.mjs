import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticCompletionAllowed } from '../src/oracleCompletion.js';
import { oracleLanguageCompletions } from '../src/oracleLanguageService.js';
import { SuggestionLearning, learningScope, rankLearnedCandidates } from '../src/suggestionLearning.js';
import { extractSuggestionUsage } from '../src/suggestionUsage.js';

test('blank lines require a statement expectation, with multiline relations preserved', () => {
  for (const sql of ['', '   ', '\n  ', 'SELECT 1 FROM dual;\n  ', '-- comment\n']) assert.equal(automaticCompletionAllowed(sql,sql.length),false,sql);
  for (const sql of ['SELECT * FROM\n  ', 'SELECT * FROM orders JOIN\n ', 'SELECT\n ', 'SELECT * FROM orders WHERE\n ']) assert.equal(automaticCompletionAllowed(sql,sql.length),true,sql);
  assert.equal(oracleLanguageCompletions('\n',1,{automatic:true}).candidates.length,0);
  assert.ok(oracleLanguageCompletions('\n',1,{manual:true}).candidates.length>0);
});
test('learning is bounded, isolated, persistent and resettable without raw SQL', () => {
  const values = new Map(), storage = {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  let now=100000; const store=new SuggestionLearning(storage,()=>now), a=learningScope('w','a'), b=learningScope('w','b');
  store.observe(a,[{context:'relation',key:'class:APP.ORDERS'}]); store.observe(a,[{context:'relation',key:'class:APP.ORDERS'}]);
  assert.equal(store.snapshot(a)[0].count,0.25); assert.deepEqual(store.snapshot(b),[]);
  store.record(a,'relation','class:APP.ORDERS');
  assert.equal(new SuggestionLearning(storage,()=>now).snapshot(a)[0].count,1.25);
  const candidates=[{key:'other',rank:2},{key:'class:APP.ORDERS',rank:2},{key:'wrong-tier',rank:3}];
  assert.equal(rankLearnedCandidates(candidates,{relation:true},store.snapshot(a),now)[0].key,'class:APP.ORDERS');
  now+=91*86400000; assert.deepEqual(store.snapshot(a),[]); store.clear(); assert.equal(values.size,0);
});
test('usage extraction retains resolved identities and no literal or bind values', () => {
  const sql="SELECT o.ID, LOWER('SECRET') FROM APP.ORDERS o WHERE o.ID = :secret";
  const result=extractSuggestionUsage(sql,[{owner:'APP',name:'ORDERS',type:'TABLE',columns:[{name:'ID'}]}],'APP');
  assert.ok(result.some(e=>e.key==='class:APP.ORDERS'));
  assert.ok(result.some(e=>e.key==='function:LOWER'));
  assert.ok(!JSON.stringify(result).includes('SECRET')); assert.ok(!JSON.stringify(result).includes('secret'));
});
