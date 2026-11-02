import test from 'node:test';
import assert from 'node:assert/strict';
import {extractCteSnippet,postfixContext,postfixSuggestions} from '../src/postfixCompletion.js';
const plain=snippet=>snippet.replace(/\$\{\d+:([^}]*)\}/g,'$1').replace(/\\([\\$}])/g,'$1');
test('postfix receivers must be complete expressions so alias completion stays intact',()=>{
 assert.deepEqual(postfixContext('WHERE o.status.i'),{start:6,receiver:'o.status',fragment:'i'});
 assert.equal(postfixContext('WHERE o.'),null);
 assert.equal(postfixContext('WHERE o.sta'),null);
 assert.equal(postfixContext("WHERE NVL(a.x, 'y').").receiver,"NVL(a.x, 'y')");
 assert.equal(postfixContext("WHERE 'abc'.").receiver,"'abc'");
 assert.equal(postfixContext('WHERE (a + b).').receiver,'(a + b)');
});
test('postfix templates filter by the typed suffix and wrap the receiver',()=>{
 const items=postfixSuggestions('WHERE t.code.n');
 assert.deepEqual(items.map(item=>item.id),['notin','notnull','nvl']);
 assert.equal(plain(postfixSuggestions('WHERE t.code.in')[0].snippet),'t.code IN (values)');
 assert.equal(plain(postfixSuggestions('SELECT t.total.nvl')[0].snippet),'NVL(t.total, default_value)');
 assert.equal(postfixSuggestions('SELECT x.').length,0);
});
test('extract CTE moves a derived table into a new or existing WITH clause',()=>{
 const sql='SELECT * FROM (SELECT id FROM orders WHERE total > 10) o';
 const inner=sql.indexOf('SELECT id'),end=sql.indexOf(') o');
 assert.equal(plain(extractCteSnippet(sql,inner,end).snippet),'WITH cte_name AS (\n    SELECT id FROM orders WHERE total > 10\n)\nSELECT * FROM cte_name o');
 const withSql='WITH a AS (SELECT 1 x FROM dual) SELECT * FROM a, (SELECT 2 y FROM dual) b';
 const start=withSql.indexOf('(SELECT 2'),stop=withSql.indexOf(' b');
 assert.equal(plain(extractCteSnippet(withSql,start,stop).snippet),'WITH a AS (SELECT 1 x FROM dual),\ncte_name AS (\n    SELECT 2 y FROM dual\n)\nSELECT * FROM a, cte_name b');
 assert.match(extractCteSnippet(sql,0,sql.length).error,/inside a larger statement/);
 assert.match(extractCteSnippet(sql,sql.indexOf('orders'),sql.indexOf(' WHERE')).error,/SELECT/);
});
