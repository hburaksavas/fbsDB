import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function invoke(args, check) {
  const directory = mkdtempSync(join(tmpdir(), 'fbsdb-load-'));
  const output = join(directory, 'report.json');
  try {
    const result = spawnSync(process.execPath, ['scripts/test-load.mjs', '--output', output, ...args], { encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    check(result, existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('load runner validates all workloads and writes measured JSON results', () => {
  invoke(['--profile', 'smoke', '--iterations', '2'], (process, report) => {
    assert.equal(process.status, 0, process.stdout + process.stderr);
    assert.equal(report.status, 'passed');
    assert.equal(report.results.length, 6);
    for (const result of report.results) {
      assert.equal(result.iterations, 2);
      assert.equal(result.status, 'passed');
      assert.ok(result.p95Ms >= result.p50Ms && result.maxMs >= result.p95Ms);
      assert.ok(result.unitsPerSecond > 0);
      assert.ok(result.observedHeapBytes >= result.baselineHeapBytes);
    }
  });
});

test('load runner kills a timed-out workload and still writes a failed report', () => {
  invoke(['--profile', 'stress', '--scenario', 'csv-export', '--timeout', '0.001'], (process, report) => {
    assert.equal(process.status, 1);
    assert.equal(report.status, 'failed');
    assert.match(report.results[0].error, /timeout/);
  });
});

test('load runner rejects unknown profiles before starting work', () => {
  invoke(['--profile', 'missing'], (process, report) => {
    assert.equal(process.status, 1);
    assert.match(process.stderr, /Profile must be/);
    assert.equal(report, undefined);
  });
});
