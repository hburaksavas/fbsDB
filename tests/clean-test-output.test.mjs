import test from 'node:test';
import assert from 'node:assert/strict';
import { REMOVABLE, runsToClean } from '../scripts/clean-test-output.mjs';

const older = '20261104-233611-60000dae';
const middle = '20261105-001722-1b7a15d1';
const newest = '20261105-002626-2ab44048';

test('the newest runs are kept whatever order they are listed in', () => {
  assert.deepEqual(runsToClean([newest, older, middle], 1), [older, middle]);
  assert.deepEqual(runsToClean([newest, older, middle], 3), []);
  assert.deepEqual(runsToClean([newest, older], 5), []);
});

test('anything not named like a run is left alone', () => {
  assert.deepEqual(runsToClean(['release-record', '2026', older, newest], 1), [older]);
});

test('reports are never among the removable contents of a run', () => {
  assert.deepEqual(REMOVABLE.filter(name => /report|\.json$/.test(name)), []);
});
