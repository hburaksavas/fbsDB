import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceIndex, routineLabel } from '../src/plsqlReferenceIndex.js';
import { parseStructuralName, structuralSearch } from '../src/structuralSearch.js';

const body = `CREATE OR REPLACE PACKAGE BODY orders AS
  PROCEDURE add_order(p_id NUMBER, status VARCHAR2) IS
  BEGIN
    INSERT INTO sales.orders_t o (id, status, created_at) VALUES (p_id, status, SYSDATE);
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      RAISE;
  END add_order;
  PROCEDURE close_order(p_id NUMBER) IS
    v_total NUMBER;
  BEGIN
    SELECT SUM(l.amount), MAX(note) INTO v_total, v_note FROM order_lines l JOIN orders_t o ON o.id = l.order_id WHERE l.order_id = p_id;
    UPDATE orders_t SET status = 'CLOSED', total = v_total WHERE id = p_id;
    DELETE FROM order_drafts WHERE order_id = p_id;
    EXECUTE IMMEDIATE 'DELETE FROM orders_t';
  EXCEPTION
    WHEN NO_DATA_FOUND OR errors.not_ready THEN
      NULL;
    WHEN OTHERS THEN
      log_error(SQLERRM);
  END close_order;
END orders;
/`;
const script = `BEGIN
  MERGE INTO archive.orders_t a USING orders_t o ON (a.id = o.id)
    WHEN MATCHED THEN UPDATE SET a.status = o.status
    WHEN NOT MATCHED THEN INSERT (id, status) VALUES (o.id, o.status);
  FOR r IN (SELECT id FROM orders_t WHERE status = 'OPEN') LOOP
    NULL;
  END LOOP;
EXCEPTION WHEN OTHERS THEN RAISE_APPLICATION_ERROR(-20001, 'x');
END;
/`;
const index = buildReferenceIndex([{ path: 'orders.pkb', content: body }, { path: 'archive.sql', content: script }]);
const summary = result => result.results.map(group => `${routineLabel(group.routine)}${group.possible ? '?' : ''}: ${group.sites.map(site => `${site.line} ${site.detail}`).join(' | ')}`);

test('names follow Oracle case rules', () => {
  assert.deepEqual(parseStructuralName(' sales.Orders_T '), ['SALES', 'ORDERS_T']);
  assert.deepEqual(parseStructuralName('"Mixed"."Name"'), ['Mixed', 'Name']);
});

test('writes find INSERT, UPDATE, DELETE and MERGE targets, and a schema narrows them', () => {
  assert.deepEqual(summary(structuralSearch(index, 'writes', 'orders_t')), [
    'Anonymous block, line 1: 2 MERGE ARCHIVE.ORDERS_T',
    'ORDERS.ADD_ORDER: 4 INSERT SALES.ORDERS_T',
    'ORDERS.CLOSE_ORDER: 13 UPDATE ORDERS_T',
  ]);
  assert.deepEqual(summary(structuralSearch(index, 'writes', 'sales.orders_t')), [
    'ORDERS.ADD_ORDER: 4 INSERT SALES.ORDERS_T',
    'ORDERS.CLOSE_ORDER?: 13 UPDATE ORDERS_T (schema not written; may be another schema)',
  ]);
  assert.equal(structuralSearch(index, 'writes', 'orders_t').dynamicRoutines.map(routineLabel).join(), 'ORDERS.CLOSE_ORDER');
});

test('reads find FROM, JOIN and MERGE USING sources, including cursor loops', () => {
  assert.deepEqual(summary(structuralSearch(index, 'reads', 'orders_t')), [
    'Anonymous block, line 1: 2 SELECT ORDERS_T | 5 SELECT ORDERS_T',
    'ORDERS.CLOSE_ORDER: 12 SELECT ORDERS_T',
  ]);
  assert.deepEqual(summary(structuralSearch(index, 'reads', 'order_lines')), ['ORDERS.CLOSE_ORDER: 12 SELECT ORDER_LINES']);
});

test('columns resolve through lists, SET clauses and aliases; bare names are possible matches; variables are not columns', () => {
  assert.deepEqual(summary(structuralSearch(index, 'column', 'orders_t.status')), [
    'Anonymous block, line 1: 3 MERGE ARCHIVE.ORDERS_T.STATUS | 3 Used ORDERS_T.STATUS | 4 MERGE ARCHIVE.ORDERS_T.STATUS | 4 Used ORDERS_T.STATUS | 5 Name STATUS without a table, in a statement on ORDERS_T',
    'ORDERS.ADD_ORDER: 4 INSERT SALES.ORDERS_T.STATUS',
    'ORDERS.CLOSE_ORDER: 13 UPDATE ORDERS_T.STATUS',
  ]);
  assert.deepEqual(summary(structuralSearch(index, 'column', 'order_lines.amount')), ['ORDERS.CLOSE_ORDER: 12 Used ORDER_LINES.AMOUNT']);
  assert.deepEqual(summary(structuralSearch(index, 'column', 'note')), ['ORDERS.CLOSE_ORDER?: 12 Name NOTE without a table, in a statement on ORDER_LINES, ORDERS_T']);
  assert.deepEqual(structuralSearch(index, 'column', 'v_total').results, []);
  assert.deepEqual(structuralSearch(index, 'column', 'p_id').results, []);
});

test('exception handlers are found by name, and OTHERS handlers that swallow the error can be singled out', () => {
  assert.deepEqual(summary(structuralSearch(index, 'handles', 'others')), [
    'Anonymous block, line 1: 8 WHEN OTHERS · raises again',
    'ORDERS.CLOSE_ORDER: 19 WHEN OTHERS · does not raise again',
  ]);
  assert.deepEqual(summary(structuralSearch(index, 'handles', 'others', { unhandledOnly: true })), ['ORDERS.CLOSE_ORDER: 19 WHEN OTHERS · does not raise again']);
  assert.deepEqual(summary(structuralSearch(index, 'handles', 'not_ready')), ['ORDERS.CLOSE_ORDER: 17 WHEN NO_DATA_FOUND OR ERRORS.NOT_READY · does not raise again']);
  assert.equal(structuralSearch(index, 'handles', '').sites, 4);
});

test('malformed queries explain what to enter', () => {
  assert.match(structuralSearch(index, 'writes', 'a.b.c').error, /table name/);
  assert.match(structuralSearch(index, 'column', '').error, /column name/);
});

test('scripts: SQL statements, SQL*Plus commands and EXEC lines do not stop the blocks after them from being indexed', () => {
  const migration = `SET SERVEROUTPUT ON
PROMPT Loading orders
CREATE TABLE orders_t (id NUMBER, status VARCHAR2(10));
INSERT INTO orders_t (id, status) VALUES (1, 'OPEN');
@other_script.sql
EXEC orders.close_order(1);
BEGIN
  UPDATE orders_t SET status = 'DONE';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
SELECT COUNT(*) FROM orders_t;`;
  const scripted = buildReferenceIndex([{ path: 'orders.pkb', content: body }, { path: 'migrate.sql', content: migration }]);
  assert.deepEqual(scripted.problems, []);
  assert.deepEqual(summary(structuralSearch(scripted, 'writes', 'orders_t')).filter(line => !line.startsWith('ORDERS.')), [
    'Anonymous block, line 7: 8 UPDATE ORDERS_T',
    'SQL statement, line 4: 4 INSERT ORDERS_T',
  ]);
  assert.deepEqual(summary(structuralSearch(scripted, 'column', 'orders_t.status')).filter(line => !line.startsWith('ORDERS.')), [
    'Anonymous block, line 7: 8 UPDATE ORDERS_T.STATUS',
    'SQL statement, line 4: 4 INSERT ORDERS_T.STATUS',
  ]);
  assert.deepEqual(summary(structuralSearch(scripted, 'reads', 'orders_t')).filter(line => !line.startsWith('ORDERS.')), ['SQL statement, line 12: 12 SELECT ORDERS_T']);
  assert.deepEqual(summary(structuralSearch(scripted, 'handles', 'others', { unhandledOnly: true })).map(line => line.split(':')[0]), ['Anonymous block, line 7', 'ORDERS.CLOSE_ORDER']);
  const callers = [...scripted.calls].filter(call => scripted.routines.get(call.callee).label === 'ORDERS.CLOSE_ORDER').map(call => scripted.routines.get(call.caller).label);
  assert.deepEqual(callers, ['EXEC, line 6']);
});