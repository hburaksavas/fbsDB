import test from 'node:test';
import assert from 'node:assert/strict';
import { dynamicSqlAt, dynamicSqlMarkdown, dynamicSqlSites } from '../src/dynamicSqlPreview.js';

const source = `CREATE OR REPLACE PROCEDURE purge(p_table VARCHAR2, p_days NUMBER) IS
  c_prefix CONSTANT VARCHAR2(10) := 'APP_';
  v_where VARCHAR2(200) := ' WHERE created_at < SYSDATE - :days';
  v_sql VARCHAR2(4000);
  v_count NUMBER;
  rc SYS_REFCURSOR;
BEGIN
  v_sql := 'DELETE FROM ' || c_prefix || 'LOG' || v_where;
  EXECUTE IMMEDIATE v_sql USING p_days;
  EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM ' || DBMS_ASSERT.SQL_OBJECT_NAME(p_table) || ' WHERE id = :1 OR parent = :2' INTO v_count USING 1;
  OPEN rc FOR 'SELECT * FROM ' || p_table || CHR(10) || q'[WHERE note = 'it''s']';
  v_sql := 'BEGIN refresh(:a, :a); END;';
  EXECUTE IMMEDIATE v_sql USING 7;
  EXECUTE IMMEDIATE unknown_text;
END;`;
const sites = dynamicSqlSites(source);

test('every dynamic SQL statement is found with its kind and line', () => {
  assert.deepEqual(sites.map(site => `${site.kind}@${site.line}`), ['EXECUTE IMMEDIATE@9', 'EXECUTE IMMEDIATE@10', 'OPEN FOR@11', 'EXECUTE IMMEDIATE@13', 'EXECUTE IMMEDIATE@14']);
});

test('literals, constants, initializers and the last assignment are joined into the text', () => {
  const [purge] = sites;
  assert.equal(purge.sql, 'DELETE FROM APP_LOG WHERE created_at < SYSDATE - :days');
  assert.equal(purge.complete, true);
  assert.deepEqual(purge.placeholders, ['DAYS']);
  assert.deepEqual(purge.binds, ['p_days']);
  assert.equal(purge.bindMismatch, false);
  assert.match(dynamicSqlMarkdown(purge), /v_sql \(assignment, line 8\)/);
  assert.equal(sites[3].sql, 'BEGIN refresh(:a, :a); END;', 'A later assignment replaces the earlier one.');
  assert.equal(sites[3].bindMismatch, false, 'One value per name is enough in a PL/SQL block.');
});

test('function results, parameters and unknown names stay marked, and CHR and q-quotes are decoded', () => {
  const count = sites[1];
  assert.equal(count.sql, 'SELECT COUNT(*) FROM «DBMS_ASSERT.SQL_OBJECT_NAME(p_table)» WHERE id = :1 OR parent = :2');
  assert.deepEqual(count.unresolved.map(piece => piece.reason), ['function result']);
  assert.deepEqual(count.binds, ['1']);
  const cursor = sites[2];
  assert.equal(cursor.sql, "SELECT * FROM «p_table»\nWHERE note = 'it''s'");
  assert.equal(cursor.unresolved[0].reason, 'parameter');
  assert.equal(sites[4].sql, '«unknown_text»');
  assert.equal(sites[4].unresolved[0].reason, 'not declared here');
});

test('a resolved text whose binds do not match USING is flagged', () => {
  const site = dynamicSqlSites(`BEGIN EXECUTE IMMEDIATE 'UPDATE t SET a = :1 WHERE b = :2' USING 5; END;`)[0];
  assert.equal(site.bindMismatch, true);
  assert.match(dynamicSqlMarkdown(site), /does not match the placeholders/);
});

test('DBMS_SQL.PARSE uses its second argument and the caret finds the statement', () => {
  const text = `DECLARE c INTEGER := DBMS_SQL.OPEN_CURSOR; BEGIN DBMS_SQL.PARSE(c, 'SELECT ' || 1 || ' FROM dual', DBMS_SQL.NATIVE); END;`;
  const [parse] = dynamicSqlSites(text);
  assert.equal(parse.kind, 'DBMS_SQL.PARSE');
  assert.equal(parse.sql, 'SELECT 1 FROM dual');
  assert.equal(dynamicSqlAt(text, text.indexOf('PARSE') + 2)?.sql, 'SELECT 1 FROM dual');
  assert.equal(dynamicSqlAt(text, text.indexOf('dual')), null);
});

test('static OPEN FOR SELECT and plain text are not dynamic SQL', () => {
  assert.deepEqual(dynamicSqlSites(`DECLARE rc SYS_REFCURSOR; BEGIN OPEN rc FOR SELECT 1 FROM dual; END;`), []);
  assert.deepEqual(dynamicSqlSites(`SELECT 'EXECUTE IMMEDIATE x' FROM dual`), []);
});
