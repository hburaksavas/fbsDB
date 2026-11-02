import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSubqueryTrial,unresolvedReferences} from '../src/subqueryTrial.js';
test('a self-contained subquery is prepared with its binds',()=>{
 const trial=prepareSubqueryTrial('(SELECT o.id FROM orders o WHERE o.status = :status);');
 assert.equal(trial.error,undefined);assert.equal(trial.sql,'SELECT o.id FROM orders o WHERE o.status = :status');assert.deepEqual(trial.binds,['STATUS']);assert.deepEqual(trial.calls,[]);
});
test('qualifiers from FROM lists, joins, aliases, WITH and inline views resolve',()=>{
 assert.deepEqual(unresolvedReferences('SELECT a.x, b.y FROM t1 a JOIN t2 b ON a.id = b.id'),[]);
 assert.deepEqual(unresolvedReferences('SELECT t1.x FROM app.t1 t1, t2 WHERE t2.k = t1.k'),[]);
 assert.deepEqual(unresolvedReferences('WITH w AS (SELECT 1 n FROM dual) SELECT w.n FROM w'),[]);
 assert.deepEqual(unresolvedReferences('SELECT v.n FROM (SELECT 1 n FROM dual) v'),[]);
 assert.deepEqual(unresolvedReferences('SELECT pkg.f(1), app.t.c FROM app.t'),['app']);
});
test('references to the outer query are reported instead of silently changing the query',()=>{
 const trial=prepareSubqueryTrial('SELECT 1 FROM items i WHERE i.order_id = o.id AND i.qty > :min');
 assert.deepEqual(trial.unresolved,['o']);assert.match(trial.error,/outer query/);assert.equal(trial.sql,undefined);
});
test('statements that are not a single SELECT are refused and function calls are flagged',()=>{
 for(const text of ['','DELETE FROM t','SELECT 1 FROM dual; SELECT 2 FROM dual','INSERT INTO t VALUES (1)'])assert.ok(prepareSubqueryTrial(text).error,text);
 assert.deepEqual(prepareSubqueryTrial('SELECT my_pkg.f(x) FROM t').calls,['my_pkg.f']);
});
