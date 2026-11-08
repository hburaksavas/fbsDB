import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleLanguageCompletions } from '../src/oracleLanguageService.js';
import { typeClass } from '../src/expectedType.js';

const objects = [{ owner: 'APP', name: 'ORDERS', type: 'TABLE', columns: [{ name: 'ID', type: 'NUMBER' }, { name: 'NOTE', type: 'VARCHAR2' }, { name: 'CREATED_AT', type: 'DATE' }] }];
function complete(marked) {
  const cursor = marked.indexOf('|'), source = marked.replace('|', '');
  return oracleLanguageCompletions(source, cursor, { objects, currentSchema: 'APP', manual: true, settings: {} });
}
const labels = result => result.candidates.map(item => item.label);
const before = (result, first, second) => { const all = labels(result); assert.ok(all.indexOf(first) >= 0 && all.indexOf(second) >= 0, `${first} or ${second} missing`); assert.ok(all.indexOf(first) < all.indexOf(second), `${first} should come before ${second}: ${all.slice(0, 12).join(', ')}`); };
const matched = result => result.candidates.filter(item => item.expectedMatch).map(item => item.label);
const block = body => `DECLARE
  v_due DATE;
  v_start TIMESTAMP;
  v_count NUMBER;
  v_name VARCHAR2(30);
  v_copy v_due%TYPE;
  v_created orders.created_at%TYPE;
  rc SYS_REFCURSOR;
  CURSOR c_orders IS SELECT id FROM orders;
  PROCEDURE plan(p_when DATE, p_qty NUMBER) IS BEGIN NULL; END;
  FUNCTION weight RETURN NUMBER IS BEGIN RETURN 1; END;
BEGIN
  ${body}
END;`;

test('type classes group compatible Oracle types', () => {
  assert.deepEqual(['DATE', 'TIMESTAMP(6) WITH TIME ZONE', 'NUMBER(10,2)', 'PLS_INTEGER', 'VARCHAR2(30)', 'CLOB', 'SYS_REFCURSOR', 'BOOLEAN', 'LONG RAW', 'INTERVAL DAY TO SECOND', 'XMLTYPE'].map(typeClass),
    ['DATE', 'DATE', 'NUMBER', 'NUMBER', 'TEXT', 'TEXT', 'CURSOR', 'BOOLEAN', 'BINARY', 'INTERVAL', null]);
});

test('an assignment to a DATE puts dates first, through %TYPE anchors and built-in functions', () => {
  const result = complete(block('v_due := |'));
  assert.equal(result.context.expectedType.kind, 'DATE');
  assert.deepEqual(matched(result).sort(), ['v_copy', 'v_created', 'v_due', 'v_start']);
  before(result, 'v_start', 'v_count');
  // Built-in functions appear once a prefix is typed.
  const typed = complete(block('v_due := SY|'));
  assert.ok(matched(typed).includes('SYSDATE') && matched(typed).includes('SYSTIMESTAMP') && !matched(typed).includes('SYS_CONTEXT'), matched(typed).join());
  before(typed, 'SYSDATE', 'SYS_CONTEXT');
  assert.match(result.candidates.find(item => item.label === 'v_start').detail, /date expected$/);
});

test('RETURN, comparisons and arguments take the type they need', () => {
  const returned = complete(`DECLARE
  FUNCTION total RETURN NUMBER IS
    v_n NUMBER; v_d DATE;
  BEGIN
    RETURN |
  END;
BEGIN NULL; END;`);
  assert.equal(returned.context.expectedType.kind, 'NUMBER');
  before(returned, 'v_n', 'v_d');
  assert.equal(complete(block('IF v_count > |')).context.expectedType.kind, 'NUMBER');
  assert.equal(complete(block('IF v_due BETWEEN v_start AND |')).context.expectedType.kind, 'DATE');
  assert.equal(complete(block('plan(|')).context.expectedType.kind, 'DATE');
  assert.equal(complete(block('plan(SYSDATE, |')).context.expectedType.kind, 'NUMBER');
  assert.equal(complete(block('plan(p_qty => |')).context.expectedType.kind, 'NUMBER');
  before(complete(block('plan(SYSDATE, |')), 'weight', 'v_name');
});

test('cursor statements put cursors and cursor variables first', () => {
  const result = complete(block('OPEN |'));
  assert.equal(result.context.expectedType.kind, 'CURSOR');
  assert.deepEqual(matched(result).sort(), ['c_orders', 'rc']);
  before(result, 'c_orders', 'v_due');
});

test('a SQL comparison uses the column type of its left side', () => {
  const result = complete('SELECT * FROM orders o WHERE o.created_at > |');
  assert.equal(result.context.expectedType.kind, 'DATE');
  before(result, 'SYSDATE', 'TO_CHAR');
});

test('without an expected type nothing is reordered or marked', () => {
  const result = complete(block('|'));
  assert.equal(result.context.expectedType, undefined);
  assert.deepEqual(matched(result), []);
  assert.equal(complete(block('v_due := v_due + |')).context.expectedType, undefined);
});

test('a cursor query declared earlier in the block does not turn later code into its FROM clause', () => {
  const result = complete(block('plan(SYSDATE, |'));
  assert.equal(result.context.relation, false);
  assert.ok(!labels(result).includes('ORDERS'), labels(result).slice(0, 10).join());
  assert.ok(labels(result).includes('v_name'));
  assert.ok(!labels(complete(block('v_due := |'))).includes('CREATED_AT'), 'Columns of the cursor query leaked into the block body.');
});
