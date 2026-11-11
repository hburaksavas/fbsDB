import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { profiles, scenarios } from '../../tests/load/scenarios.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = { profile: 'standard', duration: '0', timeout: '120', output: '.artifacts/load/latest.json' };
const flags = new Set(['--enforce-budgets']);
try {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (flags.has(args[i])) { options.enforceBudgets = true; continue; }
    const key = args[i].replace(/^--/, '');
    if (!['profile', 'duration', 'timeout', 'output', 'iterations', 'scenario'].includes(key) || !args[i].startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Invalid argument: ${args[i]}`);
    options[key] = args[++i];
  }
  if (!Object.hasOwn(profiles, options.profile)) throw new Error('Profile must be smoke, standard or stress.');
  options.iterations = Number(options.iterations ?? profiles[options.profile].iterations);
  options.duration = Number(options.duration);
  options.timeout = Number(options.timeout);
  if (!Number.isSafeInteger(options.iterations) || options.iterations < 1 || options.iterations > 100000) throw new Error('Iterations must be 1..100000.');
  if (!Number.isFinite(options.duration) || options.duration < 0 || options.duration > 3600) throw new Error('Duration must be 0..3600 seconds per scenario.');
  if (!Number.isFinite(options.timeout) || options.timeout <= options.duration || options.timeout > 7200) throw new Error('Timeout must exceed duration and be at most 7200 seconds.');
  if (options.scenario && !Object.hasOwn(scenarios, options.scenario)) throw new Error('Unknown scenario.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const startedAt = new Date().toISOString();
const results = [];
for (const name of options.scenario ? [options.scenario] : Object.keys(scenarios)) {
  // Sequential isolated processes keep scenario memory and CPU contention separate.
  const result = await new Promise(resolveResult => {
    const child = fork(new URL('./load-worker.mjs', import.meta.url), [options.profile, name, String(options.iterations), String(options.duration)], {
      cwd: root, execArgv: ['--expose-gc'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    let message;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeout * 1000);
    child.on('message', value => { message = value; });
    child.on('error', error => { message = { status: 'failed', error: error.message }; });
    child.on('close', code => {
      clearTimeout(timer);
      resolveResult(timedOut ? { status: 'failed', error: `Scenario exceeded ${options.timeout}s timeout` }
        : code !== 0 ? { status: 'failed', error: message?.error || `Worker exited with code ${code}` }
          : message || { status: 'failed', error: 'Worker returned no report' });
    });
  });
  const budgetMs = scenarios[name].budgetMs;
  const budgetExceeded = result.status === 'passed' && result.p95Ms > budgetMs;
  if (budgetExceeded && options.enforceBudgets) result.status = 'failed';
  results.push({ name, ...result, budgetMs, budgetExceeded });
  console.log(`${result.status.toUpperCase()} ${name}: ${result.p95Ms === undefined ? result.error : `p95 ${result.p95Ms.toFixed(1)} ms, max ${result.maxMs.toFixed(1)} ms, ${result.iterations} iterations`}${budgetExceeded ? ' (budget exceeded)' : ''}`);
}
const report = {
  startedAt, completedAt: new Date().toISOString(),
  status: results.every(result => result.status === 'passed') ? 'passed' : 'failed',
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model },
  options, workload: profiles[options.profile], results,
};
const output = resolve(root, options.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Report: ${output}`);
if (report.status === 'failed') process.exitCode = 1;
