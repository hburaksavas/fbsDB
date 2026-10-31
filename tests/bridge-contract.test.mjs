import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { validateNativeCommand, validateNativeReply } from '../src/bridge/validation.js';

const fixtures = JSON.parse(await readFile(new URL('../contracts/bridge-fixtures.json', import.meta.url), 'utf8'));
for (const fixture of fixtures) test(`shared bridge contract: ${fixture.name}`, () => {
  const validate = fixture.direction === 'command' ? validateNativeCommand : validateNativeReply;
  if (fixture.valid) assert.equal(validate(fixture.message), fixture.message);
  else assert.throws(() => validate(fixture.message), TypeError);
});

test('generated JavaScript, TypeScript and C# contracts match the source schema', () => {
  execFileSync(process.execPath, ['scripts/generate-bridge-contract.mjs', '--check']);
});
