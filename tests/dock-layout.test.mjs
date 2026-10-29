import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDockLayout, normalizeDockLayout, moveDockPanel, PANEL_IDS } from '../src/dockLayout.js';
import { loadSettings, saveSettings, changeSetting, resolveSetting, SETTINGS_KEY } from '../src/settingsModel.js';

test('panels move, merge and separate without changing unrelated layout or dropping panels', () => {
  const original = defaultDockLayout();
  let next = moveDockPanel(original, 'objects', 'right');
  assert.equal(next.groups.find(group => group.panels.includes('objects')).side, 'right');
  assert.equal(original.groups.at(-1).side, 'left');
  next = moveDockPanel(next, 'files', 'right', next.groups.find(group => group.side === 'right').id, 'merge');
  const merged = next.groups.find(group => group.side === 'right');
  assert.deepEqual(merged.panels, ['objects', 'files']); assert.equal(merged.active, 'files');
  next = moveDockPanel(next, 'files', 'left', next.groups[0].id, 'before');
  assert.equal(next.groups[0].active, 'files');
  assert.deepEqual(next.groups.flatMap(group => group.panels).sort(), [...PANEL_IDS].sort());
  assert.equal(next.resultsHeight, original.resultsHeight);
});

test('corrupt layouts recover missing panels, exclude duplicates and clamp sizes', () => {
  const next = normalizeDockLayout({ version: 1, widths: { left: 90000, right: -1 }, groups: [{ id: 'duplicate', side: 'left', panels: ['files', 'files', 'unknown'], active: 'unknown', height: -5 }, { id: 'duplicate', side: 'right', panels: ['files', 'objects'] }] });
  assert.deepEqual(next.groups.flatMap(group => group.panels).sort(), [...PANEL_IDS].sort());
  assert.equal(new Set(next.groups.map(group => group.id)).size, next.groups.length);
  assert.equal(next.widths.left, 520); assert.equal(next.widths.right, 180);
  assert.equal(next.groups[0].active, 'files'); assert.equal(next.groups[0].height, 70);
  assert.deepEqual(normalizeDockLayout({ version: 99 }), defaultDockLayout());
});

test('layout migration is global, preserves old sizes once and survives workspace switches and restart', () => {
  const entries = new Map([['fbsdb.sidebarWidth', '320'], ['fbsdb.resultsHeight', '42'], ['fbsdb.explorerSectionHeights', '{"connections":300}']]);
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  let settings = loadSettings(storage);
  assert.equal(resolveSetting(settings, 'ui.layout').value.widths.left, 320);
  assert.equal(resolveSetting(settings, 'ui.layout').value.resultsHeight, 42);
  assert.equal(resolveSetting(settings, 'ui.layout').value.groups.find(group => group.active === 'connections').height, 300);
  settings = changeSetting(settings, 'ui.layout', moveDockPanel(resolveSetting(settings, 'ui.layout').value, 'objects', 'right'));
  saveSettings(storage, settings); settings = loadSettings(storage);
  assert.deepEqual(resolveSetting(settings, 'ui.layout', 'a:/workspace').value, resolveSetting(settings, 'ui.layout', 'b:/other').value);
  assert.throws(() => changeSetting(settings, 'ui.layout', defaultDockLayout(), 'workspace', 'a:/workspace'), /scope/);
  settings = changeSetting(settings, 'ui.layout', undefined); saveSettings(storage, settings);
  assert.equal(resolveSetting(loadSettings(storage), 'ui.layout').value.widths.left, 258);
  assert.ok(entries.get(SETTINGS_KEY).includes('dockLayout'));
});

test('resetting panel layout leaves appearance and editor options unchanged', () => {
  const storage = { getItem: () => null };
  let settings = loadSettings(storage);
  for (const [id, value] of [['ui.theme', 'light'], ['editor.fontSize', 17], ['editor.wordWrap', true], ['ui.scale', 125]]) settings = changeSetting(settings, id, value);
  settings = changeSetting(settings, 'ui.layout', defaultDockLayout());
  assert.equal(resolveSetting(settings, 'ui.theme').value, 'light');
  assert.equal(resolveSetting(settings, 'editor.fontSize').value, 17);
  assert.equal(resolveSetting(settings, 'editor.wordWrap').value, true);
  assert.equal(resolveSetting(settings, 'ui.scale').value, 125);
});

test('panel visibility replaces legacy collapsed headings while retaining group membership', () => {
  const original = defaultDockLayout();
  original.groups[0].collapsed = true;
  original.hidden = ['editors', 'editors', 'invalid'];
  const layout = normalizeDockLayout(original);
  assert.deepEqual(layout.hidden, ['editors']);
  assert.ok(layout.groups.every(group => !Object.hasOwn(group, 'collapsed')));
  assert.equal(layout.groups.flatMap(group => group.panels).length, 4);
  const moved = moveDockPanel(layout, 'editors', 'right');
  assert.deepEqual(moved.hidden, []);
});

test('earlier docking settings retain separately stored folder expansions and inspector width once', () => {
  const earlier = defaultDockLayout(); delete earlier.expandedPaths; delete earlier.inspectorWidth;
  const data = new Map([[SETTINGS_KEY, JSON.stringify({version:1,migrations:{legacyPreferences:1,dockLayout:1},user:{'ui.layout':earlier},workspaces:{}})],['fbsdb.explorerExpandedPaths','{"D:/SQL/queries":true}'],['fbsdb.resultsInspectorWidth','360']]);
  const storage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  let settings=loadSettings(storage);
  assert.deepEqual(resolveSetting(settings,'ui.layout').value.expandedPaths,{'D:/SQL/queries':true});
  assert.equal(resolveSetting(settings,'ui.layout').value.inspectorWidth,360);
  settings=changeSetting(settings,'ui.layout',defaultDockLayout());saveSettings(storage,settings);
  assert.deepEqual(resolveSetting(loadSettings(storage),'ui.layout').value.expandedPaths,{});
});
