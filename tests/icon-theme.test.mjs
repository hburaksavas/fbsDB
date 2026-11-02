import test from 'node:test';
import assert from 'node:assert/strict';
import {addIconPack,getIconTheme,iconFor,loadIconPacks,parseIconPack,resolveIconTheme,saveIconPacks,setIconTheme,subscribeIconTheme} from '../src/iconTheme.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
test('imported packs accept only plain path data for known slots',()=>{
 const good=parseIconPack(JSON.stringify({version:1,name:' Mine ',icons:{table:'M3 3h18v18H3z',FOLDER:'M2 6l4-2h6l2 2h8v14H2z',BOGUS:'M0 0',VIEW:'<script>alert(1)</script>',TRIGGER:'M0 0 L10 10 url(http://x)'}}));
 assert.equal(good.pack.name,'Mine');assert.deepEqual(Object.keys(good.pack.icons),['TABLE','FOLDER']);assert.equal(good.rejected.length,3);
 assert.match(parseIconPack('nope').error,/not valid JSON/);assert.match(parseIconPack('{"version":2}').error,/Expected/);
 assert.match(parseIconPack(JSON.stringify({version:1,name:'x',icons:{TABLE:'<svg/>'}})).error,/No usable icons/);
 assert.match(parseIconPack(JSON.stringify({version:1,name:' ',icons:{TABLE:'M0 0'}})).error,/needs a name/);
});
test('packs persist, replace same-named packs and survive broken storage',()=>{
 const storage=memory(),pack=parseIconPack(JSON.stringify({version:1,name:'P',icons:{TABLE:'M0 0h4v4z'}})).pack;
 let packs=addIconPack([],pack);packs=addIconPack(packs,{...pack,icons:{TABLE:'M1 1h4v4z'}});assert.equal(packs.length,1);
 saveIconPacks(storage,packs);assert.deepEqual(loadIconPacks(storage),packs);
 storage.setItem('fbsdb.iconPacks','{bad');assert.deepEqual(loadIconPacks(storage),[]);assert.deepEqual(loadIconPacks(null),[]);
});
test('themes resolve with a safe fallback and icons follow the theme',()=>{
 const pack={name:'P',icons:{TABLE:'M0 0h4v4z'}};
 assert.equal(resolveIconTheme('pack:Gone',[pack]).id,'default');assert.equal(resolveIconTheme('pack:P',[pack]).kind,'pack');
 assert.deepEqual(iconFor(resolveIconTheme('pack:P',[pack]),'TABLE'),{type:'path',d:'M0 0h4v4z'});
 assert.deepEqual(iconFor(resolveIconTheme('pack:P',[pack]),'VIEW'),{type:'default',mono:false});
 assert.deepEqual(iconFor(resolveIconTheme('letters',[]),'PACKAGE'),{type:'letter',text:'P'});
 assert.deepEqual(iconFor(resolveIconTheme('mono',[]),'TABLE'),{type:'default',mono:true});
});
test('subscribers hear about theme changes only when something changed',()=>{
 let calls=0;const stop=subscribeIconTheme(()=>calls++);
 setIconTheme(resolveIconTheme('letters',[]));assert.equal(getIconTheme().id,'letters');assert.equal(calls,1);
 setIconTheme(getIconTheme());assert.equal(calls,1);stop();setIconTheme(resolveIconTheme('default',[]));assert.equal(calls,1);
});
