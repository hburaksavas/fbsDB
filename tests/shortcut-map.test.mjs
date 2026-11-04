import test from 'node:test';
import assert from 'node:assert/strict';
import {contextOf,filterSections,opensShortcutMap,orderSections,shortcutSections} from '../src/shortcutMap.js';
const closest=match=>({closest:selector=>selector.split(',').some(part=>match.includes(part.trim()))?{}:null});
test('editor shortcuts follow the user bindings and unbound actions are left out',()=>{
 const sections=shortcutSections({run:'F5',find:''});
 const editor=sections.find(section=>section.id==='editor').items;
 assert.deepEqual(editor.find(item=>item.label==='Run SQL'),{label:'Run SQL',keys:'F5'});
 assert.equal(editor.some(item=>item.label==='Find'),false);
 assert.equal(editor.find(item=>item.label==='Format SQL').keys,'Ctrl+Shift+F');
});
test('the grid and global sections list the fixed shortcuts',()=>{
 const sections=shortcutSections();
 assert.ok(sections.find(s=>s.id==='grid').items.some(item=>item.label.startsWith('Edit the selected cell')&&item.keys==='F2'));
 assert.ok(sections.find(s=>s.id==='general').items.some(item=>item.keys==='Ctrl+P'));
});
test('the section where the keyboard is comes first and the search narrows by words in label or keys',()=>{
 const sections=shortcutSections();
 assert.deepEqual(orderSections(sections,'grid').map(s=>s.id),['grid','editor','general']);
 assert.equal(contextOf(closest(['.monaco-editor'])),'editor');assert.equal(contextOf(closest(['.grid-wrap'])),'grid');assert.equal(contextOf(closest([])),'general');
 const found=filterSections(sections,'ctrl z');
 assert.deepEqual(found.map(s=>s.id),['grid','general']);assert.equal(filterSections(sections,'zzzz').length,0);assert.equal(filterSections(sections,'').length,3);
});
test('the question mark opens the map only outside text fields, editors and dialogs',()=>{
 const make=(extra={},match=[])=>({key:'?',target:closest(match),...extra});
 assert.equal(opensShortcutMap(make()),true);
 assert.equal(opensShortcutMap(make({},['input'])),false);assert.equal(opensShortcutMap(make({},['.monaco-editor'])),false);
 assert.equal(opensShortcutMap(make({ctrlKey:true})),false);assert.equal(opensShortcutMap({key:'a',target:closest([])}),false);
});
