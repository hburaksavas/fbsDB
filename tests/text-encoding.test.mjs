import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// UTF-8 text that was decoded as Windows-1252 and saved again ("Editör" -> "EditÃ¶r") is unreadable in the interface.
// This looks for the typical two-character signatures in the shipped sources.
const dir=new URL('../src/',import.meta.url);
const signature=/[Â-Å][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]|â€/;
test('shipped sources contain no double-encoded text',()=>{
 const bad=[];
 for(const name of fs.readdirSync(dir).filter(file=>/\.(jsx?|css)$/.test(file))){
  fs.readFileSync(new URL(name,dir),'utf8').split('\n').forEach((line,index)=>{if(signature.test(line))bad.push(`${name}:${index+1}`)});
 }
 assert.deepEqual(bad,[]);
});
test('the Turkish dictionary reads as Turkish',()=>{
 const text=fs.readFileSync(new URL('localeProfile.js',dir),'utf8');
 for(const word of ['Ayarlar','Bağlantılar','Çalıştır','Sonuçlar','Editör / SQL'])assert.ok(text.includes(word),`missing ${word}`);
});
