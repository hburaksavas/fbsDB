import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('desktop web sync replaces obsolete bundles instead of accumulating them', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fbsdb-web-sync-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    await copyFile(new URL('../scripts/sync-webcontent.mjs', import.meta.url), path.join(root, 'scripts/sync-webcontent.mjs'));
    await mkdir(path.join(root, 'dist/client/assets'), { recursive: true });
    await writeFile(path.join(root, 'dist/client/index.html'), '<html>new build</html>');
    await writeFile(path.join(root, 'dist/client/assets/current.js'), 'current');
    await mkdir(path.join(root, 'native/FbsDb/WebContent/assets'), { recursive: true });
    await writeFile(path.join(root, 'native/FbsDb/WebContent/assets/obsolete.js'), 'obsolete');
    await writeFile(path.join(root, 'native/FbsDb/keep.txt'), 'outside generated folder');
    const run = spawnSync(process.execPath, ['scripts/sync-webcontent.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(await readdir(path.join(root, 'native/FbsDb/WebContent/assets')), ['current.js']);
    assert.ok((await readdir(path.join(root, 'native/FbsDb'))).includes('keep.txt'));
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
