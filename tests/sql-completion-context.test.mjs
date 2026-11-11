import test from 'node:test';
import assert from 'node:assert/strict';
import { getOracleCompletionContext } from '../src/oracleCompletionContext.js';
// The relation-completion view of the context: owner and typed fragment, or null outside FROM/JOIN.
function context(before) {
 const found = getOracleCompletionContext(before, before.length);
 if (found.blocked || !found.relation) return null;
 return { owner: found.qualifier || null, fragment: found.fragment, ...(found.needsLeadingSpace ? { needsLeadingSpace: true } : {}) };
}
test('FROM and JOIN retain context over newline and indentation', () => {
 for (const text of ['select * from\n', 'select * from\r\n    ', 'select * from t inner join\n  ']) assert.deepEqual(context(text), {owner:null, fragment:''});
 assert.deepEqual(context('select * from\n  inv'), {owner:null, fragment:'inv'});
 assert.deepEqual(context('select * from\n finance.in'), {owner:'finance', fragment:'in'});
 assert.deepEqual(context('select * from finance.\n in'), {owner:'finance', fragment:'in'});
});
test('comments are ignored and literals and later clauses do not trigger tables', () => {
 assert.deepEqual(context('select * from -- choose table\n  '), {owner:null, fragment:''});
 assert.deepEqual(context('select * from /* choose */\n inv'), {owner:null, fragment:'inv'});
 for (const text of ["select 'from\n", 'select * from -- comment', 'select * from /* comment', "select q'[from\n", 'select * from t where\n', 'select * from t;\n', "select 'from ' ", 'select "from " ']) assert.equal(context(text),null,text);
});
