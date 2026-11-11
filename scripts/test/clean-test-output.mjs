// Frees the space old desktop regression runs take. Each run copies the whole app
// and a WebView2 profile; only its reports are worth keeping, and release records
// rely on them. Lists what it would remove unless --apply is given.
import { lstat, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RUN_NAME = /^\d{8}-\d{6}-[0-9a-f]{8}$/;
export const REMOVABLE = ['app', 'webview-profile', 'files'];

// Run names start with their timestamp, so the newest sort last.
export function runsToClean(names, keep) {
  const runs = names.filter(name => RUN_NAME.test(name)).sort();
  return runs.slice(0, Math.max(0, runs.length - keep));
}

async function sizeOf(path) {
  const info = await lstat(path);
  if (!info.isDirectory()) return info.size;
  let total = 0;
  for (const name of await readdir(path)) total += await sizeOf(join(path, name));
  return total;
}

async function exists(path) {
  try { await lstat(path); return true; } catch { return false; }
}

async function main(args) {
  const apply = args.includes('--apply');
  const keepArgument = args.find(arg => arg.startsWith('--keep='));
  const keep = keepArgument ? Number(keepArgument.slice('--keep='.length)) : 5;
  if (!Number.isInteger(keep) || keep < 0) throw new Error('--keep must be a whole number.');

  const root = resolve('.artifacts', 'desktop-regression');
  const entries = await readdir(root, { withFileTypes: true });
  const runs = runsToClean(entries.filter(entry => entry.isDirectory()).map(entry => entry.name), keep);
  let total = 0, cleaned = 0, locked = 0;
  for (const run of runs) {
    let found = false;
    for (const name of REMOVABLE) {
      const path = join(root, run, name);
      if (!await exists(path)) continue;
      try {
        const size = await sizeOf(path);
        if (apply) await rm(path, { recursive: true, force: true });
        total += size;
        found = true;
      } catch { locked++; } // Usually a file still in use. The next cleanup tries again.
    }
    if (found) cleaned++;
  }
  const size = `${(total / 1024 ** 3).toFixed(2)} GB`;
  const skipped = locked ? ` ${locked} folders could not be removed and were left for the next cleanup.` : '';
  console.log(apply
    ? `Removed ${size} from ${cleaned} old runs. Reports were kept.${skipped}`
    : `Would remove ${size} from ${cleaned} old runs and keep every report and the newest ${keep} runs. Run again with --apply to remove it.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
