import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleInlineCompletion as inline } from '../src/oracleInlineCompletion.js';
test('single character and SELECT continuations preserve text and SQL context',()=>{
 assert.equal(inline('s',1).insertText,'select');
 assert.equal(inline('SELECT',6).insertText,' * FROM ');
 assert.equal(inline('SELECT ',7).insertText,'* FROM ');
 assert.equal(inline('SELECT *',8).insertText,' FROM ');
 assert.equal(inline('select ',7).insertText,'* from ');
 for(const sql of ['', '   ', "SELECT 's", '-- s', 'SELECT * FROM x;\n', 'SELECT salary FROM x'])assert.equal(inline(sql,sql.length),null,sql);
 assert.equal(inline('SELECT FROM x',6),null);
});
