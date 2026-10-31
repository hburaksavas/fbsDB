import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const tests = (await readdir('tests')).filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...tests], { stdio: 'inherit' });
process.exit(result.status ?? 1);
