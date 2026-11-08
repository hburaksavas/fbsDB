import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceIndex } from '../src/plsqlReferenceIndex.js';
import { callText, usageByRoutine, usageExamples, usageFor, usageMarkdown } from '../src/projectUsage.js';

const pkg = `CREATE OR REPLACE PACKAGE BODY billing AS
  PROCEDURE post(p_id NUMBER, p_note VARCHAR2) IS BEGIN NULL; END post;
END billing;
/`;
const jobs = `BEGIN
  billing.post(1, 'nightly');
  billing.post(
    p_id   => 2,
    p_note => 'it''s (fine)'
  );
  log_line('x');
END;
/`;
const ui = `BEGIN
  billing.post(3, 'manual');
END;
/`;
const util = `CREATE OR REPLACE PROCEDURE log_line(p VARCHAR2) IS BEGIN NULL; END;
/
CREATE OR REPLACE PROCEDURE hr.notify IS BEGIN NULL; END;
/
CREATE OR REPLACE PROCEDURE app.notify IS BEGIN NULL; END;
/
BEGIN notify; END;
/`;
const files = [{ path: 'src/billing.pkb', content: pkg }, { path: 'jobs/nightly.sql', content: jobs }, { path: 'ui/manual.sql', content: ui }, { path: 'src/util.sql', content: util }];
const usage = usageByRoutine(buildReferenceIndex(files), files);

test('call text keeps the whole argument list on one line, past quotes and nested parentheses', () => {
  const at = jobs.indexOf('billing.post(\n');
  assert.equal(callText(jobs, at, at + 'billing.post'.length), "billing.post( p_id => 2, p_note => 'it''s (fine)' )");
  assert.equal(callText('x := f(' + 'a, '.repeat(100) + 'b);', 5, 6, 30).length, 30);
  assert.equal(callText('notify;', 0, 6), 'notify');
});

test('a package member is found by package and name, a standalone routine by name', () => {
  const post = usageFor(usage, { name: 'post', container: 'billing' });
  assert.equal(post.count, 3);
  assert.equal(post.files, 2);
  assert.deepEqual(post.labels, ['BILLING.POST']);
  assert.equal(usageFor(usage, { name: 'post', container: 'other_pkg' }), null);
  // Without a package only standalone routines match, unless the routine is declared in the file being edited.
  assert.equal(usageFor(usage, { name: 'post' }), null);
  assert.equal(usageFor(usage, { name: 'post', declaredIn: 'SRC/billing.pkb' }).count, 3);
  assert.equal(usageFor(usage, { name: 'post', declaredIn: 'ui/manual.sql' }), null);
  assert.equal(usageFor(usage, { name: 'LOG_LINE' }).count, 1);
  assert.equal(usageFor(usage, { name: 'missing' }), null);
});

test('calls that match several routines are not counted as examples of one of them', () => {
  assert.equal(usageFor(usage, { name: 'notify' }), null);
});

test('examples come from different files first and skip the file being edited when others exist', () => {
  const post = usageFor(usage, { name: 'POST', container: 'BILLING' });
  assert.deepEqual(usageExamples(post).map(site => `${site.path}:${site.line}`), ['jobs/nightly.sql:2', 'ui/manual.sql:2', 'jobs/nightly.sql:3']);
  assert.deepEqual(usageExamples(post, { limit: 2, excludePath: 'JOBS/nightly.sql' }).map(site => site.path), ['ui/manual.sql', 'jobs/nightly.sql']);
  const text = usageMarkdown(post, usageExamples(post, { limit: 1 }));
  assert.match(text, /^\*\*Used in the project:\*\* 3 calls in 2 files/);
  assert.match(text, /```sql\nbilling\.post\(1, 'nightly'\)\n```\njobs\/nightly\.sql, line 2/);
});
