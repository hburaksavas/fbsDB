import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisibleResultRows } from '../src/resultRows.js';
test('filter and export share numeric sort with nulls last and stable source indexes', () => {
 const rows = [[10,'match'],[2,'match'],[null,'match'],[1,'other']];
 const visible = getVisibleResultRows(rows,[{type:'NUMBER'}, {type:'VARCHAR2'}],'match',0,'desc');
 assert.deepEqual(visible.map(x=>x.row), [[10,'match'],[2,'match'],[null,'match']]);
 assert.deepEqual(visible.map(x=>x.index), [0,1,2]);
 assert.deepEqual(rows, [[10,'match'],[2,'match'],[null,'match'],[1,'other']]);
});
test('date sorting and NULL search use the same view for export', () => {
 assert.deepEqual(getVisibleResultRows([['2026-02-01'],['2025-12-01']],[{type:'DATE'}],'',0).map(x=>x.row[0]), ['2025-12-01','2026-02-01']);
 assert.equal(getVisibleResultRows([[null],['hello']],[],'NULL').length,1);
});
import { moveResultRow } from '../src/resultRows.js';
test('manual moves preserve source data, filter order, fetched additions and export order', () => {
 const original=[0,1,2,3];
 const moved=moveResultRow(original,0,2,true);
 assert.deepEqual(moved,[1,2,0,3]);assert.deepEqual(original,[0,1,2,3]);
 const rows=[['a'],['b'],['c'],['d'],['e']];
 assert.deepEqual(getVisibleResultRows(rows,[],'',-1,'asc',moved).map(x=>x.index),[1,2,0,3,4]);
 assert.deepEqual(getVisibleResultRows(rows,[],'a',-1,'asc',moved).map(x=>x.index),[0]);
 assert.deepEqual(moveResultRow(moved,0,1),[0,1,2,3]);
 assert.deepEqual(getVisibleResultRows(rows,[{type:'VARCHAR2'}],'',0,'asc',moved).map(x=>x.index),[0,1,2,3,4]);
});
