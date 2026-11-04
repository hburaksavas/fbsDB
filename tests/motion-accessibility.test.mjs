import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const css=fs.readdirSync(new URL('../src/',import.meta.url)).filter(name=>name.endsWith('.css'));
test('a global reduced-motion rule is loaded after the component styles',()=>{
 const main=read('main.jsx'),imports=[...main.matchAll(/import '\.\/([\w.-]+\.css)';/g)].map(match=>match[1]);
 assert.equal(imports.at(-1),'motion.css','motion.css must be the last stylesheet so its !important rules win');
 const rule=read('motion.css');
 for(const piece of ['prefers-reduced-motion: reduce','animation-duration','animation-iteration-count: 1','transition-duration'])assert.ok(rule.includes(piece),`motion.css lacks ${piece}`);
});
test('every stylesheet that repeats an animation forever has its own reduced-motion rule too',()=>{
 const missing=css.filter(name=>/infinite/.test(read(name))&&!/prefers-reduced-motion/.test(read(name))&&name!=='motion.css');
 assert.deepEqual(missing,[]);
});
test('forced-colors mode keeps keyboard focus visible',()=>{
 assert.ok(css.some(name=>/forced-colors:\s*active/.test(read(name))&&/focus-visible/.test(read(name))));
});
test('a higher-contrast preference strengthens separators and secondary text without touching the tokens',()=>{
 const rule=read('contrast.css');
 for(const piece of ['prefers-contrast: more','--line: var(--line-strong)','--muted: var(--foreground)'])assert.ok(rule.includes(piece),`contrast.css lacks ${piece}`);
 const imports=[...read('main.jsx').matchAll(/import '\.\/([\w.-]+\.css)';/g)].map(match=>match[1]);
 assert.ok(imports.includes('contrast.css')&&imports.indexOf('contrast.css')<imports.indexOf('motion.css'));
});
