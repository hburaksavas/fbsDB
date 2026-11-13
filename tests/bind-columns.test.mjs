import test from 'node:test';
import assert from 'node:assert/strict';
import {getBindColumns,bindLabel} from '../src/bindColumns.js';
import {getOracleBindNames} from '../src/oracleBinds.js';

const labels=sql=>Object.values(getBindColumns(sql)).map(bindLabel);
const columns=sql=>Object.fromEntries(Object.entries(getBindColumns(sql)).map(([name,bind])=>[name,bind.column]));

test('INSERT with a column list names each bind by position',()=>{
 const sql=`INSERT INTO "ACCOUNT_APP"."ACCOUNT_BALANCES" (
  "ACCOUNT_ID",
  "AS_OF_DATE",
  "LEDGER_BALANCE",
  "AVAILABLE_BALANCE"
) VALUES (
  :p1,
  :p2,
  :p3,
  :p4
);`;
 assert.deepEqual(labels(sql),['p1 - ACCOUNT_ID','p2 - AS_OF_DATE','p3 - LEDGER_BALANCE','p4 - AVAILABLE_BALANCE']);
 assert.deepEqual(Object.keys(getBindColumns(sql)),getOracleBindNames(sql));
});

test('INSERT keeps quoted column spelling, upper-cases plain names and skips values that are not a lone bind',()=>{
 assert.deepEqual(columns(`insert into t (id, "Mixed Case", created, note) values (:id, :m, NVL(:c, SYSDATE), 'x' || :n)`),{ID:'ID',M:'Mixed Case',C:'',N:''});
 assert.deepEqual(columns('INSERT INTO t (a, b) VALUES (:a, 1 /* :ignored */, :b)'),{A:'',B:''},'value count differs from column count');
 assert.deepEqual(columns('INSERT INTO t VALUES (:a, :b)'),{A:'',B:''},'no column list');
 assert.deepEqual(columns('INSERT INTO t (a, b) SELECT :a, :b FROM dual'),{A:'',B:''});
 assert.deepEqual(columns('INSERT INTO t (a, b) VALUES (:a, :b) RETURNING id INTO :new_id'),{A:'A',B:'B',NEW_ID:''});
 assert.deepEqual(columns('INSERT INTO t (a, b) VALUES (:a, :b), (:c, :d)'),{A:'A',B:'B',C:'A',D:'B'});
});

test('UPDATE SET and WHERE comparisons name the compared column',()=>{
 assert.deepEqual(columns('UPDATE "LOAN_APP"."LOANS" l SET "STATUS" = :p1, l.rate = :p2 WHERE l."LOAN_ID" = :p3 AND amount >= :p4 AND name LIKE :p5'),{P1:'STATUS',P2:'RATE',P3:'LOAN_ID',P4:'AMOUNT',P5:'NAME'});
 assert.deepEqual(columns('SELECT * FROM t WHERE (a <> :x OR b != :y) AND owner.t.c < :z'),{X:'A',Y:'B',Z:'C'});
 assert.deepEqual(columns('DELETE FROM t WHERE id = :id'),{ID:'ID'});
 assert.deepEqual(columns('MERGE INTO t USING dual ON (t.id = :id) WHEN MATCHED THEN UPDATE SET v = :v WHEN NOT MATCHED THEN INSERT (id, v) VALUES (:id, :v)'),{ID:'ID',V:'V'});
});

test('a bind used for several columns, or once outside a plain comparison, gets no column',()=>{
 assert.deepEqual(columns('UPDATE t SET a = :p WHERE id = :p'),{P:''});
 assert.deepEqual(columns('UPDATE t SET a = :p WHERE a = :p'),{P:'A'});
 assert.deepEqual(columns('SELECT * FROM t WHERE a = :p AND b = UPPER(:p)'),{P:''});
 assert.deepEqual(columns('SELECT * FROM t WHERE (:p IS NULL OR a = :p)'),{P:'A'},'the optional-filter idiom still names the column');
 assert.deepEqual(columns('SELECT * FROM t WHERE :p IS NULL'),{P:''});
});

test('expressions, functions, lists and pseudo-columns fall back to the bare name',()=>{
 const sql=`SELECT :lit FROM t WHERE a = :a + 1 AND UPPER(b) = :b AND c + d = :d AND e IN (:e1, :e2)
  AND f BETWEEN :f1 AND :f2 AND ROWNUM <= :n AND g = :g || '%' AND :h = h AND i = TO_DATE(:i) AND p => :named AND s = ':str'`;
 assert.ok(Object.values(columns(sql)).every(column=>column===''),JSON.stringify(columns(sql)));
 assert.deepEqual(labels('select :Id, :name from dual'),['Id','name']);
});

test('PL/SQL blocks and calls never name a column',()=>{
 assert.deepEqual(columns('BEGIN UPDATE t SET a = :p1 WHERE id = :p2; END;'),{P1:'',P2:''});
 assert.deepEqual(columns('DECLARE v NUMBER; BEGIN INSERT INTO t (a) VALUES (:p1); END;'),{P1:''});
 assert.deepEqual(columns('CALL pkg.proc(:p1)'),{P1:''});
 assert.deepEqual(getBindColumns(''),{});
});

test('comments and strings do not shift positions; the first spelling of a bind is kept',()=>{
 assert.deepEqual(columns(`INSERT INTO t (a, /* , x */ b) VALUES (:a, -- :c,\n :b)`),{A:'A',B:'B'});
 assert.deepEqual(labels('SELECT * FROM t WHERE a = :MyBind OR a = :MYBIND'),['MyBind - A']);
});
