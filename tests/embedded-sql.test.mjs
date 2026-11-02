import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedSqlAt,planEmbeddedSqlWrite} from '../src/embeddedSql.js';

test('decodes static Oracle string and escapes edited SQL on write back',()=>{
  const source="BEGIN EXECUTE IMMEDIATE 'SELECT ''old'' FROM dual'; END;";
  const context=embeddedSqlAt(source,source.indexOf('SELECT'));
  assert.equal(context.error,undefined);
  assert.equal(context.sql,"SELECT 'old' FROM dual");
  const plan=planEmbeddedSqlWrite(source,context,"SELECT 'new' FROM dual");
  assert.equal(plan.error,undefined);
  assert.equal(source.slice(0,plan.edit.start)+plan.edit.after+source.slice(plan.edit.end),"BEGIN EXECUTE IMMEDIATE 'SELECT ''new'' FROM dual'; END;");
});

test('rejects dynamic fragments and unsupported quote form',()=>{
  const dynamic="BEGIN EXECUTE IMMEDIATE 'SELECT ' || v_column; END;";
  assert.match(embeddedSqlAt(dynamic,dynamic.indexOf('SELECT')).error,/Concatenated/);
  const variable='BEGIN EXECUTE IMMEDIATE v_sql; END;';
  assert.match(embeddedSqlAt(variable,variable.indexOf('IMMEDIATE')).error,/static/);
  const quoted="BEGIN EXECUTE IMMEDIATE q'[SELECT 'x' FROM dual]'; END;";
  assert.match(embeddedSqlAt(quoted,quoted.indexOf('SELECT')).error,/ordinary/);
});
