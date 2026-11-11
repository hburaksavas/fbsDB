// Usage: node scripts/test/measure-startup.mjs <playwright-module-path-or-file-url> <url> [samples]
// Run against a production preview. Each sample uses a fresh browser context.
import { pathToFileURL } from 'node:url';
const [modulePath, url = 'http://127.0.0.1:4173/', count = '5'] = process.argv.slice(2);
if (!modulePath) throw new Error('Pass an installed Playwright module path (for example .../playwright/index.mjs).');
const { chromium } = await import(modulePath.startsWith('file:') ? modulePath : pathToFileURL(modulePath).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const samples = [];
try {
  for (let run = 0; run < Number(count); run++) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.startupDomTiming = {};
        new MutationObserver((_, observer) => {
          const times = window.startupDomTiming;
          if (times.shellMs == null && document.querySelector('.desktop-shell')) times.shellMs = performance.now();
          if (times.editorDomMs == null && document.querySelector('.monaco-editor .view-lines')) {
            times.editorDomMs = performance.now(); observer.disconnect();
          }
        }).observe(document, { childList: true, subtree: true });
      });
      await page.goto(url);
      await page.waitForFunction(() => window.startupDomTiming.editorDomMs != null, {}, { timeout: 30000 });
      const sample = await page.evaluate(() => ({
        ...window.startupDomTiming,
        milestones: performance.getEntriesByType('measure').filter(m => m.name.startsWith('fbsdb:startup:')).map(m => ({ name: m.name, ms: m.duration })),
        javascript: performance.getEntriesByType('resource').filter(r => r.name.includes('/assets/') && r.name.endsWith('.js')).map(r => ({ file: r.name.split('/').at(-1), bytes: r.decodedBodySize })),
      }));
      samples.push({ ...sample, errors });
      if (errors.length) throw new Error(errors.join('\n'));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
const median = key => samples.map(row => row[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
console.log(JSON.stringify({ url, medians: { shellMs: median('shellMs'), editorDomMs: median('editorDomMs') }, samples }, null, 2));
