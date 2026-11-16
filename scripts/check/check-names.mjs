// Fails when App.jsx or a Workbench* module reads a name that is not defined (TS2304, TS2552).
// Only those two codes are counted: the app is JavaScript and is not claimed to be type-checked.
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const src = join(root, 'src')
const files = ['App.jsx', 'ResultsGrid.jsx', ...readdirSync(src).filter(name => /^(Workbench.*\.jsx|ResultsGrid(Commands|Pointer)\.js)$/.test(name))]
  .map(name => relative(root, join(src, name)))

const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const result = spawnSync(process.execPath, [
  tsc, '--noEmit', '--allowJs', '--checkJs', '--jsx', 'react-jsx', '--target', 'ES2022',
  '--module', 'esnext', '--moduleResolution', 'bundler', '--skipLibCheck', '--types', '',
  '--pretty', 'false', ...files,
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

if (result.error) {
  console.error(`check:names: could not run tsc: ${result.error.message}`)
  process.exit(2)
}
const output = `${result.stdout}\n${result.stderr}`
const wanted = new Set(files.map(file => file.replaceAll('\\', '/')))
const found = output.split(/\r?\n/).filter(line => {
  const match = /^(.+?)\(\d+,\d+\): error TS(2304|2552):/.exec(line)
  return match && wanted.has(match[1].replaceAll('\\', '/'))
})
if (!output.includes('error TS') && result.status !== 0) {
  console.error(`check:names: tsc failed without diagnostics.\n${output}`)
  process.exit(2)
}
for (const line of found) console.error(line)
if (found.length) {
  console.error(`check:names: ${found.length} undefined name(s).`)
  process.exit(1)
}
console.log(`check:names: ${files.length} files, 0 undefined names.`)
