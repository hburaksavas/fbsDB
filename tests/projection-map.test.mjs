import test from 'node:test';
import assert from 'node:assert/strict';
import {mapProjectionColumns,projectionItems,projectionRanges} from '../src/projectionMap.js';
const text=(sql,item)=>sql.slice(item.start,item.end);
test('projection items keep expression ranges and aliases at the outer level',()=>{
 const sql='WITH x AS (SELECT 1 a FROM dual) SELECT DISTINCT o.id, NVL(o.total, 0) AS "Total", (SELECT max(1) FROM dual) m, o.name customer FROM orders o';
 const items=projectionItems(sql);
 assert.deepEqual(items.map(item=>[text(sql,item),item.alias]),[['o.id',null],['NVL(o.total, 0)','Total'],['(SELECT max(1) FROM dual)','M'],['o.name','CUSTOMER']]);
 assert.equal(projectionItems('UPDATE t SET a=1'),null);
});
test('stars map columns from both ends; mismatched counts are not guessed',()=>{
 const items=projectionItems('SELECT a, t.*, z FROM t');
 assert.equal(items[1].star,true);
 const mapped=mapProjectionColumns(items,5);
 assert.deepEqual(mapped.map(item=>item?.star?'*':item?'item':null),['item',null,null,null,'item']);
 assert.deepEqual(mapProjectionColumns(projectionItems('SELECT a, b FROM t'),3),[null,null,null]);
 assert.deepEqual(mapProjectionColumns(projectionItems('SELECT *, b.*, c FROM t'),4).map(Boolean),[false,false,false,false]);
});
test('ranges translate to document offsets only while the editor matches the executed snapshot',()=>{
 const document='-- report\nSELECT id, name AS n FROM t;\nSELECT 2 FROM dual;';
 const result={executedSql:'SELECT id, name AS n FROM t',statementOffset:10,editorSnapshot:document,columns:[{},{}]};
 const ranges=projectionRanges(result,document);
 assert.deepEqual(ranges.map(range=>document.slice(range.start,range.end)),['id','name']);
 assert.equal(projectionRanges(result,document+' '),null);
 assert.equal(projectionRanges({...result,statementOffset:null},document),null);
});
