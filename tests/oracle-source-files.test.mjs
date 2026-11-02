import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleSourceExtensions, sourceFileName, duplicateSourceFileName } from '../src/oracleSourceFiles.js';

test('workspace names preserve explicit Oracle extensions and keep unsupported names visible for validation', () => {
  assert.equal(sourceFileName(' query '), 'query.sql');
  for (const extension of oracleSourceExtensions) {
    const name = `billing${extension.toUpperCase()}`;
    assert.equal(sourceFileName(name), name);
    assert.equal(duplicateSourceFileName(name), `billing copy${extension.toUpperCase()}`);
  }
  assert.equal(sourceFileName('billing.txt'), 'billing.txt');
});
