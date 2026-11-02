import test from 'node:test';
import assert from 'node:assert/strict';
import {inListSql,insertTemplateSql,jsonTableSql,pastedValues} from '../src/pasteToCode.js';
test('spreadsheet values become a deduplicated IN list with quoting chosen for the whole list',()=>{
 assert.deepEqual(pastedValues('A\tB\r\nA\n\n"C"\n'),['A','B','C']);
 assert.equal(inListSql("O'Brien\nSmith",'last_name').sql,"last_name IN ('O''Brien', 'Smith')");
 assert.equal(inListSql('10\n-2.5\n1e3').sql,'column_name IN (10, -2.5, 1e3)');
 assert.equal(inListSql('10\nx').sql,"column_name IN ('10', 'x')");
 const many=inListSql(Array.from({length:1001},(_,i)=>i).join('\n'),'id');
 assert.match(many.sql,/^\(id IN \(0, .*\)\n OR id IN \(1000\)\)$/s);assert.equal(many.count,1001);
 assert.match(inListSql('  ').error,/no values/);
});
test('JSON becomes a JSON_TABLE draft with typed columns and quoted paths',()=>{
 const draft=jsonTableSql('[{"id":1,"name":"A","tags":["x"],"odd key":true},{"id":2,"extra":null}]');
 assert.match(draft.sql,/FROM JSON_TABLE\(:json_document, '\$\[\*\]'/);
 assert.match(draft.sql,/ID NUMBER PATH '\$\.id',\n    NAME VARCHAR2\(4000\) PATH '\$\.name',\n    TAGS VARCHAR2\(4000\) FORMAT JSON PATH '\$\.tags',\n    ODD_KEY VARCHAR2\(5\) PATH '\$\."odd key"'/);
 assert.match(jsonTableSql('{"a":1}').sql,/'\$'\n/);
 assert.match(jsonTableSql('[1,2]').error,/object/);assert.match(jsonTableSql('{').error,/valid JSON/);
});
test('column names become an INSERT template with matching binds',()=>{
 assert.equal(insertTemplateSql('ID\tNAME\nCreated At','orders').sql,'INSERT INTO orders (\n  ID,\n  NAME,\n  "Created At"\n) VALUES (\n  :id,\n  :name,\n  :created_at\n);\n');
 assert.match(insertTemplateSql('').error,/no column names/);
});
