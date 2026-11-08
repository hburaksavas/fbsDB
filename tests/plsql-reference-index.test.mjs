import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceIndex, callHierarchyLevel, dynamicSitesOf, mergeIndexSources, routineAt, routineLabel } from '../src/plsqlReferenceIndex.js';

const spec = `CREATE OR REPLACE PACKAGE billing AS
  PROCEDURE post(p_id NUMBER);
  FUNCTION total(p_id NUMBER) RETURN NUMBER;
END billing;
/`;
const body = `CREATE OR REPLACE PACKAGE BODY billing AS
  g_rate NUMBER := 1;
  FUNCTION total(p_id NUMBER) RETURN NUMBER IS
  BEGIN
    RETURN audit_log.amount(p_id) * g_rate;
  END total;
  PROCEDURE post(p_id NUMBER) IS
    v_sum NUMBER;
    PROCEDURE note(p_text VARCHAR2) IS BEGIN audit_log.write(p_text); END note;
  BEGIN
    v_sum := total(p_id => p_id);
    note('posted');
    EXECUTE IMMEDIATE 'DELETE FROM tmp';
    notify;
  END post;
BEGIN
  post(0);
END billing;
/`;
const audit = `CREATE OR REPLACE PACKAGE BODY audit_log AS
  PROCEDURE write(p_text VARCHAR2) IS BEGIN NULL; END write;
  FUNCTION amount(p_id NUMBER) RETURN NUMBER IS BEGIN RETURN 1; END amount;
END audit_log;
/`;
const standalone = `CREATE OR REPLACE PROCEDURE hr.notify IS
  total NUMBER := 0;
BEGIN
  total := total + 1;
  billing.post(total);
  DBMS_SQL.PARSE(1, 'x', 1);
END notify;
/
CREATE OR REPLACE PROCEDURE app.notify IS BEGIN NULL; END notify;
/
BEGIN
  billing.post(1);
END;
/`;
const files = [
  { path: 'src/billing.pks', content: spec }, { path: 'src/billing.pkb', content: body },
  { path: 'src/audit_log.pkb', content: audit }, { path: 'scripts/notify.sql', content: standalone },
];
const index = buildReferenceIndex(files, { skipped: ['big.sql'], truncated: false });
const id = label => [...index.routines.values()].find(routine => routine.label === label)?.id;
const names = (routineId, direction) => callHierarchyLevel(index, routineId, direction).map(group => `${routineLabel(group.routine)}×${group.sites.length}${group.ambiguous ? '?' : ''}`);

test('specification and body declarations of a package routine are one routine', () => {
  const post = index.routines.get(id('billing.post'.toUpperCase()));
  assert.deepEqual(post.declarations.map(item => `${item.path}:${item.part}`), ['src/billing.pks:spec', 'src/billing.pkb:body']);
  assert.equal(index.routines.get(id('BILLING')).declarations.length, 2);
});

test('outgoing calls resolve siblings, other packages, local subprograms and named notation', () => {
  assert.deepEqual(names(id('BILLING.POST'), 'outgoing'), ['APP.NOTIFY×1?', 'BILLING.POST › NOTE×1', 'BILLING.TOTAL×1', 'HR.NOTIFY×1?']);
  assert.deepEqual(names(id('BILLING.TOTAL'), 'outgoing'), ['AUDIT_LOG.AMOUNT×1']);
  assert.deepEqual(names(id('BILLING.POST › NOTE'), 'outgoing'), ['AUDIT_LOG.WRITE×1']);
});

test('incoming calls include package initialization, other schemas and anonymous blocks', () => {
  assert.deepEqual(names(id('BILLING.POST'), 'incoming'), ['Anonymous block, line 11×1', 'BILLING×1', 'HR.NOTIFY×1']);
  assert.deepEqual(names(id('AUDIT_LOG.WRITE'), 'incoming'), ['BILLING.POST › NOTE×1']);
});

test('variables hide routines of the same name and END labels are not calls', () => {
  assert.deepEqual(names(id('BILLING.TOTAL'), 'incoming'), ['BILLING.POST×1']);
  assert.deepEqual(names(id('HR.NOTIFY'), 'outgoing'), ['BILLING.POST×1']);
});

test('dynamic SQL sites are listed per routine without being analysed', () => {
  assert.deepEqual(dynamicSitesOf(index, id('BILLING.POST')).map(site => `${site.kind}@${site.line}`), ['EXECUTE IMMEDIATE@13']);
  assert.deepEqual(dynamicSitesOf(index, id('HR.NOTIFY')).map(site => site.kind), ['DBMS_SQL']);
});

test('the caret selects the called routine or the routine around it', () => {
  const at = body.indexOf('total(p_id =>') + 2;
  assert.equal(routineLabel(routineAt(index, 'src/billing.pkb', at)), 'BILLING.TOTAL');
  assert.equal(routineLabel(routineAt(index, 'SRC/BILLING.PKB', body.indexOf('v_sum NUMBER'))), 'BILLING.POST');
  assert.equal(routineAt(index, 'src/billing.pkb', 0)?.label, 'BILLING');
});

test('index scope is reported with the result', () => {
  assert.equal(index.fileCount, 4);
  assert.deepEqual(index.skipped, ['big.sql']);
  assert.deepEqual(index.problems, []);
});

test('open editors replace disk text, and open PL/SQL files outside the workspace sources are added', () => {
  const merged = mergeIndexSources([{ path: 'C:\\w\\a.sql', content: 'disk' }, { path: 'C:/w/b.sql', content: 'b' }], [{ path: 'c:/W/A.sql', content: 'edited', dirty: true }, { path: 'C:/w/c.pkb', content: 'c' }, { path: 'C:/w/notes.txt', content: 'x' }, { title: 'untitled', content: 'y' }]);
  assert.deepEqual(merged, [{ path: 'C:\\w\\a.sql', content: 'edited', unsaved: true }, { path: 'C:/w/b.sql', content: 'b' }, { path: 'C:/w/c.pkb', content: 'c', unsaved: false }]);
});