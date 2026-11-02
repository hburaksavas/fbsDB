import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleSourceDeclaration, describeOracleSource, relatedPackageDocument } from '../src/oracleSourceIdentity.js';
import { createDocumentSessions } from '../src/documentSessions.js';

const source = (id, type, name = 'billing', extra = {}) => ({ id, path: `C:/work/${id}.sql`, content: `CREATE OR REPLACE ${type} ${name} AS\nEND;\n/`, ...extra });
const spec = source('spec', 'PACKAGE');
const body = source('body', 'PACKAGE BODY');
const context = { root: 'C:/work' };
const pair = (a = spec, b = body, options = context) => relatedPackageDocument(a, [a, b], options);

test('Oracle declarations retain original source offsets, qualified quoted identity and edition clauses', () => {
  const sql = '-- comment\nCREATE /* preserved */ OR REPLACE NONEDITIONABLE PACKAGE BODY "App"."Bill""ing" AS\nEND;\n/';
  const { declaration } = oracleSourceDeclaration(sql);
  assert.equal(declaration.type, 'PACKAGE BODY');
  assert.equal(declaration.ownerKey, 'App');
  assert.equal(declaration.nameKey, 'Bill"ing');
  assert.ok(sql.slice(declaration.nameStart).startsWith('"Bill""ing" AS'));
  assert.ok(sql.slice(declaration.start).startsWith('PACKAGE BODY'));
});

test('file types are checked against declarations, never inferred as object identity', () => {
  for (const [extension, type] of [['pks', 'PACKAGE'], ['pkb', 'PACKAGE BODY'], ['prc', 'PROCEDURE'], ['fnc', 'FUNCTION'], ['trg', 'TRIGGER']]) {
    const content = type === 'FUNCTION' ? 'CREATE FUNCTION actual RETURN NUMBER AS BEGIN RETURN NULL; END;\n/' : type === 'TRIGGER' ? 'CREATE TRIGGER actual BEFORE INSERT ON t BEGIN NULL; END;\n/' : source('x', type, 'actual').content;
    const result = describeOracleSource({ name: `unrelated.${extension.toUpperCase()}`, content });
    assert.equal(result.declaration.nameKey, 'ACTUAL');
    assert.equal(result.warning, null);
  }
  assert.match(describeOracleSource({ path: 'x.pks', content: body.content }).warning, /declares PACKAGE BODY/);
  assert.ok(describeOracleSource({ name: 'x.pkb', content: 'select 1 from dual;' }).warning);
  assert.equal(describeOracleSource({ name: 'x.sql', content: 'select 1 from dual;' }).warning, undefined);
});

test('unsupported, unfinished and multiple sources cannot establish identity', () => {
  for (const content of ['CREATE OR PACKAGE p AS END;', 'CREATE PACKAGE', 'CREATE PACKAGE AS END;', 'CREATE PACKAGE app.', 'CREATE PACKAGE p.q.r AS END;', "SELECT 'PACKAGE fake' FROM dual;", 'BEGIN pkg.run; END;', 'CREATE PACKAGE p AS /* unfinished', 'CREATE PACKAGE "broken AS END;', spec.content + '\n' + body.content, 'SELECT 1 FROM dual;\n' + spec.content])
    assert.equal(oracleSourceDeclaration(content).declaration, null, content);
  assert.ok(oracleSourceDeclaration(spec.content + '\n-- trailing comment').declaration);
});

test('pairing uses declarations and Oracle case rules rather than filename similarity', () => {
  assert.equal(pair().target, body);
  assert.equal(pair(body, spec).target, spec);
  assert.equal(pair(spec, source('other', 'PACKAGE BODY', 'BILLING')).target.id, 'other');
  assert.equal(pair(spec, source('other', 'PACKAGE BODY', '"billing"')).target, null);
  assert.equal(pair(spec, source('other', 'PACKAGE BODY', '"BILLING"')).target.id, 'other');
  assert.equal(pair(spec, source('spec-copy', 'PACKAGE')).target, null);
  assert.equal(pair(spec, source('body', 'PACKAGE BODY', 'different')).target, null);
});

test('package matching isolates workspace, profile and schema and refuses ambiguous sources', () => {
  assert.equal(pair(spec, { ...body, path: 'C:/work-other/body.sql' }).target, null);
  assert.equal(pair(spec, { ...body, connectionProfileId: 'prod' }).target, null);
  assert.equal(pair(source('spec', 'PACKAGE', 'APP.billing'), source('body', 'PACKAGE BODY', 'OTHER.billing')).target, null);
  const sessions = { spec: { activeConnection: {id: 'dev'}, schemaOwner: 'APP' }, body: { activeConnection: {id: 'dev'}, schemaOwner: 'APP' } };
  assert.ok(pair(spec, source('body', 'PACKAGE BODY', 'APP.billing'), { ...context, sessions }).target);
  assert.equal(pair(spec, body, { ...context, sessions: { ...sessions, body: { ...sessions.body, schemaOwner: 'OTHER' } } }).target, null);
  assert.equal(pair(spec, { ...body, path: 'C:/work/nested/body.sql' }).target, null);
  assert.equal(relatedPackageDocument(spec, [spec, body, { ...body, id: 'copy' }], context).target, null);
  assert.equal(pair(spec, { ...body, readOnly: true }).target, null);
  assert.equal(pair(spec, { ...body, path: 'C:/work/body.pks' }).target, null);
});

test('switching package documents preserves independent text, dirty state and disk identity', () => {
  const documents = createDocumentSessions([{ ...spec, dirty: true, diskVersion: 'spec-v1' }, { ...body, dirty: false, diskVersion: 'body-v1' }]);
  const original = structuredClone(documents.tabs);
  const target = relatedPackageDocument(documents.active, documents.tabs, context).target;
  documents.activate(target.id);
  assert.equal(documents.active.id, body.id);
  assert.deepEqual(documents.tabs, original);
  documents.edit(source('body', 'PACKAGE BODY', 'different').content);
  assert.equal(relatedPackageDocument(documents.active, documents.tabs, context).target, null);
});
