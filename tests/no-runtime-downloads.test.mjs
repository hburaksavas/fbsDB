import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const sources = readdirSync('src', { recursive: true })
  .filter(name => /\.(js|jsx|css)$/.test(name))
  .map(name => ({ name: name.replaceAll('\\', '/'), text: readFileSync(`src/${name}`, 'utf8') }));

test('Monaco is reached only through the module that binds it to the bundle', () => {
  const direct = sources.filter(file => file.text.includes('@monaco-editor/react')).map(file => file.name);
  assert.deepEqual(direct, ['monacoEditor.js']);
  const entry = sources.find(file => file.name === 'monacoEditor.js').text;
  assert.match(entry, /loader\.config\(\{ monaco \}\)/);
});

test('the application names no CDN or font host', () => {
  const remote = sources.filter(file => /jsdelivr|unpkg\.com|cdnjs|fonts\.(googleapis|gstatic)\.com/.test(file.text)).map(file => file.name);
  assert.deepEqual(remote, []);
});

test('stylesheets and the page load nothing from another host', () => {
  const remote = sources.filter(file => file.name.endsWith('.css') && /(@import|url\()\s*\(?['"]?(https?:)?\/\//.test(file.text)).map(file => file.name);
  assert.deepEqual(remote, []);
  assert.doesNotMatch(readFileSync('index.html', 'utf8'), /(src|href)=["'](https?:)?\/\//);
});

test('runtime packages that replace downloads are pinned', () => {
  const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const name of ['monaco-editor', '@fontsource/dm-sans', '@fontsource/dm-mono']) assert.match(dependencies[name], /^\d+\.\d+\.\d+$/, name);
});
