import test from 'node:test';
import assert from 'node:assert/strict';
import { explainExpressionAt } from '../src/expressionExplain.js';

const at = (marked) => explainExpressionAt(marked.replace('|', ''), marked.indexOf('|'));
const table = sample => sample.rows.map(row => sample.columns.map(column => row[column.key]).join(' '));

test('a simple CASE lists its branches and evaluates each WHEN value, another value and NULL', () => {
  const result = at("SELECT CASE status WHEN 'A' THEN 'Active' WHEN 'C' THEN| 'Closed' END AS label FROM t");
  assert.equal(result.title, 'Simple CASE expression');
  assert.equal(result.subject, 'status');
  assert.deepEqual(result.branches, [{ when: "'A'", then: "'Active'" }, { when: "'C'", then: "'Closed'" }]);
  assert.deepEqual(result.samples.rows.map(row => `${row.input}→${row.output}`), ["A→'Active'", "C→'Closed'", 'something else→NULL', 'null→NULL']);
  assert.ok(result.notes.some(note => /no ELSE: a value that matches no branch gives NULL/.test(note)));
  assert.ok(result.notes.some(note => /never matches, not even WHEN NULL/.test(note)));
  assert.equal(result.text, "CASE status WHEN 'A' THEN 'Active' WHEN 'C' THEN 'Closed' END");
});

test('a searched CASE on one number is shown on values around each limit, first match winning', () => {
  const result = at("SELECT CASE WHEN amount >= 1000 THEN 'big' WHEN amount > 0 THEN 'small' |ELSE 'none' END FROM t");
  assert.equal(result.title, 'Searched CASE expression');
  assert.deepEqual(result.samples.rows.map(row => `${row.input}→${row.output}`), ["-1→'none'", "0→'none'", "1→'small'", "999→'small'", "1000→'big'", "1001→'big'", "null→'none'"]);
  assert.equal(at("SELECT CASE WHEN a > 1 AND b < 2 THEN 'x' END| FROM t").samples, null);
});

test('a CASE statement without ELSE raises CASE_NOT_FOUND, and the innermost CASE is chosen', () => {
  const statement = at(`BEGIN
  CASE v_kind
    WHEN 1 THEN p_one;
    WHEN 2 THEN| p_two;
  END CASE;
END;`);
  assert.equal(statement.title, 'CASE statement');
  assert.ok(statement.notes.some(note => /CASE_NOT_FOUND/.test(note)));
  assert.equal(statement.samples.rows.at(-1).output, 'CASE_NOT_FOUND');
  const inner = at("SELECT CASE WHEN x > 0 THEN CASE y WHEN 1 THEN| 'one' ELSE 'many' END ELSE 'none' END FROM t");
  assert.equal(inner.subject, 'y');
});

test('ROW_NUMBER, RANK and DENSE_RANK are evaluated on sample rows with a tie and two partitions', () => {
  const rowNumber = at('SELECT ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary| DESC) FROM emp');
  assert.deepEqual(rowNumber.sample.columns.map(column => column.label), ['dept', 'salary', 'ROW_NUMBER()']);
  assert.deepEqual(table(rowNumber.sample), ['A 30 1', 'A 20 2', 'A 20 3', 'A 10 4', 'B 15 1', 'B 5 2']);
  assert.equal(rowNumber.frame, null);
  assert.deepEqual(table(at('SELECT RANK() OVER (ORDER BY| salary) FROM emp').sample).map(row => row.split(' ').at(-1)), ['1', '2', '3', '4', '4', '6']);
  assert.deepEqual(table(at('SELECT DENSE_RANK() OVER (ORDER BY| salary) FROM emp').sample).map(row => row.split(' ').at(-1)), ['1', '2', '3', '4', '4', '5']);
});

test('a running SUM uses the default RANGE frame, so ties are added together, and the frame of one row is marked', () => {
  const result = at('SELECT SUM(amount) OVER (PARTITION BY dept ORDER BY day|) FROM t');
  assert.deepEqual(result.sample.columns.map(column => column.label), ['dept', 'day', 'amount', 'SUM(amount)']);
  assert.deepEqual(table(result.sample), ['A 10 3 3', 'A 20 1 8', 'A 20 4 8', 'A 30 1 9', 'B 5 5 5', 'B 15 9 14']);
  assert.deepEqual(result.sample.rows.map(row => row.inFrame), [true, true, true, false, false, false]);
  assert.ok(result.notes.some(note => /Default window frame: RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW \(with ORDER BY, rows that tie/.test(note)));
});

test('explicit ROWS frames, LAG with a default and LAST_VALUE are evaluated', () => {
  const moving = at('SELECT AVG(x) OVER (PARTITION BY g ORDER BY d ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING|) FROM t');
  assert.deepEqual(moving.sample.rows.filter(row => row.p === 'A').map(row => row.result), [2, 2.67, 2, 2.5]);
  assert.ok(moving.notes.some(note => /^Window frame: ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING/.test(note)));
  const lag = at('SELECT LAG(amount, 1, 0) OVER (ORDER| BY day) FROM t');
  assert.deepEqual(lag.sample.rows.map(row => row.result), ['0', 5, 3, 9, 1, 4]);
  const last = at('SELECT LAST_VALUE(x) OVER (ORDER BY d|) FROM t');
  assert.match(last.description, /not the end of the partition/);
  assert.deepEqual(last.sample.rows.map(row => row.result), [5, 3, 9, 4, 4, 1]);
});

test('nothing to explain outside CASE and analytic functions', () => {
  assert.equal(at('SELECT a + b| FROM t'), null);
  assert.equal(at('SELECT COUNT(*)| FROM t'), null);
});
