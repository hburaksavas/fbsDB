import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlsql, plsqlVisibleSymbols } from '../src/plsqlStructure.js';
import { oracleLanguageCompletions, oracleSignatureHelp } from '../src/oracleLanguageService.js';
import { formatOraclePlsql } from '../src/plsqlFormatter.js';
import { formatOracleDocument } from '../src/sqlFormatter.js';
import { lexOracle } from '../src/oracleLexer.js';
import { getOracleBindNames } from '../src/oracleBinds.js';

const objects = [{ owner: 'APP', name: 'ORDERS', type: 'TABLE', columns: [{ name: 'ID', type: 'NUMBER' }, { name: 'TOTAL', type: 'NUMBER' }] }, { owner: 'APP', name: 'TYPES', type: 'PACKAGE', types: [{ name: 'ADDRESS_REC', kind: 'record', fields: [{ name: 'CITY', type: 'VARCHAR2' }] }] }];
const at = (source, method = oracleLanguageCompletions) => { const cursor = source.indexOf('|'); return method(source.replace('|', ''), cursor, { objects, currentSchema: 'APP', settings: {} }); };

test('nested records, aliases and collection elements resolve within their block', () => {
  const declarations = 'DECLARE TYPE address_t IS RECORD (city VARCHAR2(20)); TYPE customer_t IS RECORD (address address_t); SUBTYPE customer_alias IS customer_t; TYPE customers_t IS TABLE OF customer_alias INDEX BY PLS_INTEGER; rows customers_t; BEGIN ';
  assert.ok(at(declarations + 'rows(1).address.ci|; END;').candidates.some(item => item.label === 'city'));
  assert.equal(at(declarations + 'rows(1).address.|; END;').candidates.some(item => item.kind === 'keyword'), false);
});

test('routine parameters and local variables respect scope and exact type names', () => {
  const source = 'CREATE OR REPLACE PROCEDURE demo(p_invoice IN INVOICE_REC, p_count OUT NUMBER) IS v_count NUMBER; BEGIN p_|; END;';
  const result = at(source);
  assert.ok(result.candidates.some(item => item.label === 'p_invoice' && item.detail.includes('INVOICE_REC')));
  assert.ok(result.candidates.some(item => item.label === 'p_count'));
  assert.ok(at(source.replace('p_|', 'v_|')).candidates.some(item => item.label === 'v_count'));
  const shadows = 'DECLARE value NUMBER; BEGIN DECLARE value VARCHAR2(10); BEGIN va|; END; END;';
  assert.equal(at(shadows).candidates.filter(item => item.label === 'value').length, 1);
  assert.ok(at(shadows).candidates.find(item => item.label === 'value').detail.includes('VARCHAR2'));
});

test('ROWTYPE, cursor rows and package record types expose available fields', () => {
  assert.ok(at('DECLARE r APP.ORDERS%ROWTYPE; BEGIN r.to|; END;').candidates.some(item => item.label === 'TOTAL'));
  assert.ok(at('DECLARE CURSOR orders_cur IS SELECT id,total FROM app.orders; r orders_cur%ROWTYPE; BEGIN r.to|; END;').candidates.some(item => item.label === 'total'));
  assert.ok(at('BEGIN FOR r IN (SELECT id,total FROM app.orders) LOOP r.to|; END LOOP; END;').candidates.some(item => item.label === 'total'));
  assert.ok(at('DECLARE r APP.TYPES.ADDRESS_REC; BEGIN r.ci|; END;').candidates.some(item => item.label === 'CITY'));
});

test('stored package source and labelled outer scopes keep local record visibility', () => {
  assert.ok(at('PACKAGE BODY demo IS PROCEDURE run(p IN NUMBER) IS TYPE rec_t IS RECORD (id NUMBER); r rec_t; BEGIN r.i|; END; END;').candidates.some(item => item.label === 'id'));
  assert.ok(at('<<outer_block>> DECLARE TYPE rec_t IS RECORD (id NUMBER); r rec_t; BEGIN DECLARE r NUMBER; BEGIN outer_block.r.i|; END; END outer_block;').candidates.some(item => item.label === 'id'));
  const source = '<<outer_block>> DECLARE x NUMBER; BEGIN x:=1; END outer_block;';
  assert.equal(formatOraclePlsql(source).supported, true);
});

test('local overloaded routines are completed and hints prefer matching scalar input types', () => {
  const source = 'DECLARE FUNCTION convert_value(p NUMBER) RETURN NUMBER IS BEGIN RETURN p; END; FUNCTION convert_value(p VARCHAR2) RETURN VARCHAR2 IS BEGIN RETURN p; END; BEGIN ';
  assert.equal(at(source + 'convert_value(|); END;', oracleSignatureHelp).signatures.length, 2);
  const numeric = at(source + 'convert_value(123|); END;', oracleSignatureHelp);
  assert.ok(numeric.signatures[numeric.activeSignature].label.includes('NUMBER'));
  const text = at(source + "convert_value('abc'|); END;", oracleSignatureHelp);
  assert.ok(text.signatures[text.activeSignature].label.includes('VARCHAR2'));
  assert.ok(at(source + 'conv|; END;').candidates.some(item => item.kind === 'function' && item.insertText === 'convert_value($0)'));
  assert.ok(at('DECLARE TYPE rec_t IS RECORD (id NUMBER); FUNCTION get_rec RETURN rec_t DETERMINISTIC IS r rec_t; BEGIN RETURN r; END; BEGIN get_rec().i|; END;').candidates.some(item => item.label === 'id'));
});

test('AST formatter handles package routines, loops, branches, exceptions and record declarations', () => {
  const source = "CREATE OR REPLACE PACKAGE BODY demo IS TYPE rec_t IS RECORD (id NUMBER, label VARCHAR2(10)); PROCEDURE run(p NUMBER) IS r rec_t; BEGIN FOR i IN 1 .. 3 LOOP IF i > p THEN NULL; ELSIF i = p THEN r.label := q'[a;''b]'; ELSE CASE i WHEN 1 THEN NULL; ELSE NULL; END CASE; END IF; END LOOP; EXCEPTION WHEN OTHERS THEN RAISE; END run; END demo;\n/";
  assert.deepEqual(parsePlsql(source).errors, []);
  const result = formatOraclePlsql(source, { tabSize: 2 });
  assert.equal(result.supported, true); assert.ok(result.formatted.includes('\n  PROCEDURE run'));
  assert.ok(result.formatted.includes('\n      IF i > p THEN\n        NULL;'));
  assert.deepEqual(lexOracle(result.formatted).map(token => result.formatted.slice(token.start, token.end)), lexOracle(source).map(token => source.slice(token.start, token.end)));
  assert.equal(formatOraclePlsql(result.formatted, { tabSize: 2 }).formatted, result.formatted);
});

test('formatter preserves comments and refuses incomplete or conditional compilation units', () => {
  const source = "-- lead\nDECLARE x VARCHAR2(20); -- retained\nBEGIN x := q'[multi\nline]'; /* comment */ NULL; END;";
  const result = formatOraclePlsql(source);
  assert.equal(result.supported, true);
  assert.deepEqual(lexOracle(result.formatted).map(token => result.formatted.slice(token.start, token.end)), lexOracle(source).map(token => source.slice(token.start, token.end)));
  for (const text of ['BEGIN IF x THEN NULL;', 'DECLARE x NUMBER BEGIN NULL; END;', 'BEGIN $IF $$flag $THEN NULL; $END END;']) assert.equal(formatOraclePlsql(text).formatted, text);
});

test('mixed SQL and PL/SQL document formatting keeps statement boundaries and slash delimiters', () => {
  const source = 'SELECT 1 FROM dual;\nBEGIN NULL; END;\n/\nSELECT 2 FROM dual;';
  const formatted = formatOracleDocument(source).formatted;
  assert.ok(formatted.includes('BEGIN\n    NULL;\nEND;'));
  assert.ok(formatted.includes('\n/\n'));
  assert.equal(formatOracleDocument(formatted).formatted, formatted);
});

test('numeric FOR iterator exists only inside its loop', () => {
  const source = 'BEGIN FOR ix IN 1 .. 10 LOOP NULL; END LOOP; NULL; END;';
  assert.ok(plsqlVisibleSymbols(source, source.indexOf('NULL;')).some(symbol => symbol.name === 'ix' && symbol.type === 'PLS_INTEGER'));
  assert.ok(!plsqlVisibleSymbols(source, source.lastIndexOf('NULL;')).some(symbol => symbol.name === 'ix'));
});

test('SQL formatting preserves Oracle bind names, alternative quotes, national strings and precise numeric literals', () => {
  const sql = "select q'[a';:not_a_bind]', N'İstanbul', 123456789012345678901234567890.12, 1e-10 from dual where x=:value;";
  const formatted = formatOracleDocument(sql).formatted;
  for (const value of ["q'[a';:not_a_bind]'", "N'İstanbul'", '123456789012345678901234567890.12', '1e-10', ':value']) assert.ok(formatted.includes(value), value);
  assert.deepEqual(getOracleBindNames(sql), ['VALUE']);
  assert.deepEqual(getOracleBindNames('CREATE OR REPLACE TRIGGER t BEFORE INSERT ON orders FOR EACH ROW BEGIN :NEW.id := 1; END;'), []);
  assert.deepEqual(getOracleBindNames('BEGIN do_work(:value); END;'), ['VALUE']);
  assert.equal(formatOraclePlsql('BEGIN NULL; END; -- retained').supported, true);
});
