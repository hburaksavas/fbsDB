import { performance } from 'node:perf_hooks';
import { profiles, scenarios } from '../../tests/load/scenarios.mjs';

const [profile, name, repetitions, duration] = process.argv.slice(2);
try {
  const run = scenarios[name].setup(profiles[profile]);
  run(); // Untimed warmup, with the same correctness checks.
  global.gc();
  const baseline = process.memoryUsage();
  let observedHeap = baseline.heapUsed;
  const samples = [];
  let units = 0;
  const start = performance.now();
  do {
    const before = performance.now();
    units += run();
    samples.push(performance.now() - before);
    observedHeap = Math.max(observedHeap, process.memoryUsage().heapUsed);
  } while (samples.length < Number(repetitions) || performance.now() - start < Number(duration) * 1000);
  const elapsedMs = performance.now() - start;
  global.gc();
  const retainedHeapDelta = process.memoryUsage().heapUsed - baseline.heapUsed;
  samples.sort((a, b) => a - b);
  const percentile = p => samples[Math.max(0, Math.ceil(samples.length * p) - 1)];
  process.send({
    status: 'passed', iterations: samples.length, elapsedMs, units,
    unitsPerSecond: units / elapsedMs * 1000,
    p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: samples.at(-1),
    baselineHeapBytes: baseline.heapUsed, observedHeapBytes: observedHeap,
    retainedHeapDeltaBytes: retainedHeapDelta,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
  });
} catch (error) {
  process.send({ status: 'failed', error: error.stack });
  process.exitCode = 1;
}
process.disconnect();
