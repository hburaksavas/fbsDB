import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Spacing ratchet: layout spacing (gap, padding, margin) belongs on an even-pixel scale (2, 4, 6, 8, ...; 1px hairlines are fine).
// Existing odd values are tolerated up to the recorded baseline per file, so new work cannot add more. Lowering a count is welcome:
// run `node tests/design-scale.test.mjs --write` after cleaning a file to record the new baseline.
const dir=new URL('../src/',import.meta.url),baselineUrl=new URL('./design-scale.baseline.json',import.meta.url);
const declaration=/(?:^|[;{\s])(gap|row-gap|column-gap|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?)\s*:\s*([^;}]*)/g;
export function offScaleCounts() {
 const counts={};
 for(const name of fs.readdirSync(dir).filter(file=>file.endsWith('.css')).sort()){
  const text=fs.readFileSync(new URL(name,dir),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');let total=0,match;declaration.lastIndex=0;
  while((match=declaration.exec(text))){
   for(const px of match[2].matchAll(/(?<![\w.-])(\d+)px/g)){const value=Number(px[1]);if(value>1&&value%2===1)total++}
  }
  if(total)counts[name]=total;
 }
 return counts;
}
if(process.argv.includes('--write')){fs.writeFileSync(baselineUrl,JSON.stringify(offScaleCounts(),null,1)+'\n');console.log('Baseline written.');process.exit(0)}
test('no stylesheet adds odd-pixel spacing beyond its recorded baseline',()=>{
 const baseline=JSON.parse(fs.readFileSync(baselineUrl,'utf8')),now=offScaleCounts(),over=[];
 for(const [name,count] of Object.entries(now))if(count>(baseline[name]??0))over.push(`${name}: ${count} odd-pixel spacing values, baseline ${baseline[name]??0}`);
 assert.deepEqual(over,[],'Use even pixel values (2, 4, 6, 8, 10, 12, 16, …) or the --space-* tokens in spacing.css');
});
test('the spacing tokens exist on an even scale',()=>{
 const css=fs.readFileSync(new URL('spacing.css',dir),'utf8');
 const values=[...css.matchAll(/--space-\d+:\s*(\d+)px/g)].map(match=>Number(match[1]));
 assert.ok(values.length>=6);assert.ok(values.every(value=>value%2===0));assert.deepEqual([...values].sort((a,b)=>a-b),values);
});
