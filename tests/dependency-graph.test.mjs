import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceIndex } from '../src/plsqlReferenceIndex.js';
import { buildDependencyGraph, dependencyNeighbors, dependencyObjectAt } from '../src/dependencyGraph.js';

const ddl = `CREATE TABLE customers (id NUMBER PRIMARY KEY);
CREATE TABLE orders_t (id NUMBER PRIMARY KEY, customer_id NUMBER REFERENCES customers(id));
CREATE SEQUENCE orders_seq;
CREATE OR REPLACE VIEW open_orders AS SELECT o.id FROM orders_t o JOIN customers c ON c.id = o.customer_id;
CREATE SYNONYM ord FOR orders_t;
CREATE OR REPLACE TRIGGER orders_bi BEFORE INSERT ON orders_t FOR EACH ROW
BEGIN
  :NEW.id := orders_seq.NEXTVAL;
  audit_pkg.note('insert');
END;
/`;
const pkg = `CREATE OR REPLACE PACKAGE BODY billing AS
  PROCEDURE close_all IS
  BEGIN
    UPDATE orders_t SET id = id;
    FOR r IN (SELECT id FROM open_orders) LOOP NULL; END LOOP;
    INSERT INTO archive.history (id) VALUES (1);
  END close_all;
END billing;
/`;
const audit = `CREATE OR REPLACE PACKAGE audit_pkg AS
  PROCEDURE note(p VARCHAR2);
END audit_pkg;
/
CREATE OR REPLACE PACKAGE BODY audit_pkg AS
  PROCEDURE note(p VARCHAR2) IS BEGIN NULL; END note;
END audit_pkg;
/`;
const script = `EXEC billing.close_all;
SELECT COUNT(*) FROM orders_t;`;
const index = buildReferenceIndex([{ path: 'ddl.sql', content: ddl }, { path: 'billing.pkb', content: pkg }, { path: 'audit.sql', content: audit }, { path: 'run.sql', content: script }]);
const graph = buildDependencyGraph(index);
const side = (key, which) => dependencyNeighbors(graph, key)[which].map(group => `${group.object.kind} ${group.object.label}${group.object.external ? ' (external)' : ''}: ${group.kinds.join('+')}`);

test('objects come from CREATE statements and PL/SQL units, with their definitions', () => {
  const kinds = Object.fromEntries([...graph.objects.values()].map(object => [object.label, object.kind]));
  assert.deepEqual(kinds, { CUSTOMERS: 'TABLE', ORDERS_T: 'TABLE', ORDERS_SEQ: 'SEQUENCE', OPEN_ORDERS: 'VIEW', ORD: 'SYNONYM', ORDERS_BI: 'TRIGGER', BILLING: 'PACKAGE', AUDIT_PKG: 'PACKAGE', 'run.sql': 'SCRIPT', 'ARCHIVE.HISTORY': 'TABLE' });
  assert.deepEqual(graph.objects.get('.AUDIT_PKG').definitions.map(item => `${item.path}:${item.part}`), ['audit.sql:spec', 'audit.sql:body']);
  assert.equal(graph.objects.get('.OPEN_ORDERS').definitions[0].start, ddl.indexOf('open_orders'));
  assert.equal(graph.objects.get('ARCHIVE.HISTORY').external, true);
});

test('a table shows what reads, writes, references and fires on it', () => {
  assert.deepEqual(side('.ORDERS_T', 'usedBy'), [
    'PACKAGE BILLING: writes',
    'SCRIPT run.sql: reads',
    'SYNONYM ORD: aliases',
    'TRIGGER ORDERS_BI: on',
    'VIEW OPEN_ORDERS: reads',
  ]);
  assert.deepEqual(side('.ORDERS_T', 'uses'), ['TABLE CUSTOMERS: references']);
});

test('packages, triggers and views show what they use', () => {
  assert.deepEqual(side('.BILLING', 'uses'), ['TABLE ARCHIVE.HISTORY (external): writes', 'TABLE ORDERS_T: writes', 'VIEW OPEN_ORDERS: reads']);
  assert.deepEqual(side('.BILLING', 'usedBy'), ['SCRIPT run.sql: calls']);
  assert.deepEqual(side('.ORDERS_BI', 'uses'), ['PACKAGE AUDIT_PKG: calls', 'SEQUENCE ORDERS_SEQ: uses', 'TABLE ORDERS_T: on']);
  assert.deepEqual(side('.OPEN_ORDERS', 'uses'), ['TABLE CUSTOMERS: reads', 'TABLE ORDERS_T: reads']);
});

test('the caret picks a table under it, a called routine, or the object around it', () => {
  assert.equal(dependencyObjectAt(graph, index, 'billing.pkb', pkg.indexOf('open_orders') + 2).label, 'OPEN_ORDERS');
  assert.equal(dependencyObjectAt(graph, index, 'billing.pkb', pkg.indexOf('BEGIN')).label, 'BILLING');
  assert.equal(dependencyObjectAt(graph, index, 'run.sql', 8).label, 'BILLING');
  assert.equal(dependencyObjectAt(graph, index, 'ddl.sql', ddl.indexOf('audit_pkg') + 1).label, 'AUDIT_PKG');
});
