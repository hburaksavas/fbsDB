import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalShortcut,shortcutFromEvent,matchesShortcut,normalizeEditorShortcuts,defaultEditorShortcuts,shortcutProblem} from '../src/editorShortcuts.js';
import {loadSettings,changeSetting,resolveSetting,settingDefinitions,saveSettings} from '../src/settingsModel.js';
import {formatOracleDocument} from '../src/sqlFormatter.js';
import {sqlFormatterStyle,sqlFormatterPresets} from '../src/sqlFormatterSettings.js';
import {lexOracle} from '../src/oracleLexer.js';

test('shortcut migration preserves old custom bindings and avoids new default collisions',()=>{
 const shortcuts=normalizeEditorShortcuts({run:'Ctrl+F',deleteLine:'Ctrl+D',format:'Ctrl+Shift+I'});
 assert.equal(shortcuts.run,'Ctrl+F');assert.equal(shortcuts.find,'');
 assert.equal(shortcuts.format,'Ctrl+Shift+I');assert.equal(shortcuts.commentLine,'Ctrl+/');
 assert.equal(normalizeEditorShortcuts({...defaultEditorShortcuts,run:'Ctrl+D'}),undefined);
 assert.equal(normalizeEditorShortcuts({...defaultEditorShortcuts,run:'Ctrl+S'}),undefined);
 assert.match(shortcutProblem(defaultEditorShortcuts,'commentLine','Ctrl+D'),/Delete line/i);
 assert.match(shortcutProblem(defaultEditorShortcuts,'run','Ctrl+Shift+F'),/reserved/);
 assert.match(shortcutProblem(defaultEditorShortcuts,'run','Ctrl+P'),/workbench/);
});

test('shortcut capture and matching canonicalize modifiers, arrow/function keys and whitespace',()=>{
 assert.equal(canonicalShortcut('shift+ctrl+f'),'Ctrl+Shift+F');
 assert.equal(canonicalShortcut('Ctrl+Ctrl+F'),undefined);
 assert.equal(canonicalShortcut('A'),undefined);
 assert.equal(canonicalShortcut('F6'),'F6');
 assert.equal(shortcutFromEvent({key:' ',ctrlKey:true}),'Ctrl+Space');
 assert.equal(shortcutFromEvent({key:'Control',ctrlKey:true}),undefined);
 assert.equal(shortcutFromEvent({key:'A',ctrlKey:true,altKey:true,getModifierState:()=>true}),undefined);
 assert.equal(matchesShortcut({key:'ArrowDown',altKey:true,shiftKey:true},'Alt+Shift+ArrowDown'),true);
 assert.equal(matchesShortcut({key:'f',ctrlKey:true,shiftKey:true},'Ctrl+F'),false);
 assert.equal(shortcutProblem(defaultEditorShortcuts,'run',''),'');
});

test('style, formatter and shortcut categories reset independently and persist advanced settings',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let settings=loadSettings(storage);
 settings=changeSetting(settings,'editor.cursorStyle','block');
 settings=changeSetting(settings,'editor.folding',false);
 settings=changeSetting(settings,'editor.sqlFormatter',{...sqlFormatterPresets.Compact});
 settings=changeSetting(settings,'editor.shortcuts',{...defaultEditorShortcuts,run:'F6'});
 for(const [id,definition] of Object.entries(settingDefinitions).filter(([,d])=>d.category==='formatter'))settings=changeSetting(settings,id,undefined);
 saveSettings(storage,settings);const restored=loadSettings(storage);
 assert.equal(resolveSetting(restored,'editor.cursorStyle').value,'block');
 assert.equal(resolveSetting(restored,'editor.folding').value,false);
 assert.equal(resolveSetting(restored,'editor.shortcuts').value.run,'F6');
 assert.equal(resolveSetting(restored,'editor.sqlFormatter').value.newlineAfterClause,true);
 assert.equal(settingDefinitions['editor.shortcuts'].category,'shortcuts');
 assert.throws(()=>changeSetting(restored,'editor.cursorStyle','invalid'),/Invalid/);
});

test('formatter presets keep Oracle tokens intact and are idempotent',()=>{
 const source="select a.id, q'[a;B]' value from invoices a left join customers c on c.id = a.id where a.status = 'OPEN' and c.id > :id;\nselect 2 from dual;";
 const significant=source=>lexOracle(source).map(t=>t.kind==='identifier'&&!t.quoted?t.value.toUpperCase():source.slice(t.start,t.end));
 for(const preset of Object.values(sqlFormatterPresets)){
  const style=sqlFormatterStyle({...preset,finalNewline:false});
  const formatted=formatOracleDocument(source,style).formatted;
  assert.deepEqual(significant(formatted),significant(source));
  assert.equal(formatOracleDocument(formatted,style).formatted,formatted);
  assert.ok(!formatted.endsWith('\n'));
 }
 const leading=formatOracleDocument(source,sqlFormatterStyle(sqlFormatterPresets['Leading commas'])).formatted;
 assert.match(leading,/\n\s+, q'\[a;B\]'/);
 const compact=formatOracleDocument(source,sqlFormatterStyle(sqlFormatterPresets.Compact)).formatted;
 assert.match(compact,/FROM invoices a LEFT JOIN customers c ON c.id = a.id/);
});

test('adding File outline preserves legacy shortcuts which already use its suggested binding',()=>{
 const value=normalizeEditorShortcuts({run:'Ctrl+Alt+O',format:'Ctrl+Shift+I'});
 assert.equal(value.run,'Ctrl+Alt+O');assert.equal(value.format,'Ctrl+Shift+I');assert.equal(value.outline,'');
 assert.equal(defaultEditorShortcuts.outline,'Ctrl+Alt+O');
});
