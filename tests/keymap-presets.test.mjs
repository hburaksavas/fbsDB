import test from 'node:test';
import assert from 'node:assert/strict';
import {activePreset,defaultEditorShortcuts,editorShortcutActions,keymapPresets,presetShortcuts,shortcutProblem} from '../src/editorShortcuts.js';
test('every preset is a complete, valid mapping without duplicate keys',()=>{
 for(const preset of keymapPresets){
  const mapped=presetShortcuts(preset.id);assert.ok(mapped,preset.id);
  const keys=editorShortcutActions.map(action=>mapped[action.id]).filter(Boolean);assert.equal(new Set(keys).size,keys.length,`${preset.id} has duplicate keys`);
  for(const action of editorShortcutActions)assert.equal(shortcutProblem(mapped,action.id,mapped[action.id]),'',`${preset.id}: ${action.id}`);
 }
});
test('presets override only what they name and Format SQL stays on its reserved key',()=>{
 assert.deepEqual(presetShortcuts('default'),{...defaultEditorShortcuts});
 const vs=presetShortcuts('visual-studio'),jb=presetShortcuts('jetbrains');
 assert.equal(vs.run,'F5');assert.equal(jb.run,defaultEditorShortcuts.run);assert.equal(vs.format,'Ctrl+Shift+F');assert.equal(jb.format,'Ctrl+Shift+F');
 assert.equal(jb.moveLineUp,'Alt+Shift+ArrowUp');assert.equal(presetShortcuts('nope'),undefined);
});
test('the active preset is recognized and edits make it custom',()=>{
 assert.equal(activePreset(defaultEditorShortcuts),'default');assert.equal(activePreset(presetShortcuts('jetbrains')),'jetbrains');
 assert.equal(activePreset({...presetShortcuts('jetbrains'),find:'Ctrl+Alt+F'}),null);assert.equal(activePreset(undefined),null);
});
