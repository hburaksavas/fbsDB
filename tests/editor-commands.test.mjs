import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editorCommands, menuEditorCommand, paletteEditorCommand } from '../src/editorCommands.js';

test('the palette entry carries the full label, the shortcut and the runner', () => {
  const run = () => 'ran';
  assert.deepEqual(paletteEditorCommand('quickFix', { readOnly: false }, run), { id: 'quickFix', label: 'Quick fixes for compiler diagnostic', detail: 'Alt+Enter', disabled: false, run });
  assert.equal(paletteEditorCommand('localRename', { readOnly: true }, run).disabled, true);
  assert.equal('disabled' in paletteEditorCommand('explainExpression', { readOnly: true }, run), false);
});

test('the palette ignores the selection; the menu needs one for selection commands', () => {
  assert.equal(paletteEditorCommand('extractCte', { readOnly: false }).disabled, false);
  assert.deepEqual(menuEditorCommand('extractCte', { readOnly: false, selected: false }), { id: 'extractCte', label: 'Extract query into CTE', disabled: true });
  assert.equal(menuEditorCommand('extractCte', { readOnly: false, selected: true }).disabled, false);
  assert.equal(menuEditorCommand('extractCte', { readOnly: true, selected: true }).disabled, true);
  assert.equal(menuEditorCommand('moveUp', { readOnly: false, selected: false }).disabled, false);
});

test('workspace commands follow the workspace, not the read-only state', () => {
  assert.equal(menuEditorCommand('deleteReview', { readOnly: true, workspaceReady: true }).disabled, false);
  assert.equal(menuEditorCommand('deleteReview', { readOnly: false, workspaceReady: false }).disabled, true);
  assert.equal(paletteEditorCommand('deleteReview', { workspaceReady: false }).disabled, true);
});

test('a menu label falls back to the palette label and unknown ids are refused', () => {
  assert.equal(menuEditorCommand('moveDown').label, editorCommands.moveDown.label);
  assert.throws(() => menuEditorCommand('nope'), /Unknown editor command/);
});

test('the workbench defines a runner for every shared command and no second definition of it', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const palette = readFileSync(new URL('../src/WorkbenchCommandPalette.jsx', import.meta.url), 'utf8');
  const runners = app.slice(app.indexOf('const editorCommandRunners={'), app.indexOf('const editorCommandState='));
  for (const id of Object.keys(editorCommands)) {
    assert.match(runners, new RegExp(`[{,]\\s*${id}:`), `runner for ${id}`);
    for (const source of [app, palette]) assert.equal(source.includes(`{id:'${id}',label:`), false, `${id} is defined only in editorCommands.js`);
  }
});
