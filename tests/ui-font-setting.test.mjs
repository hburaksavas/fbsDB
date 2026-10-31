import test from 'node:test';
import assert from 'node:assert/strict';
import { changeSetting, loadSettings, resolveSetting, saveSettings } from '../src/settingsModel.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('interface font is saved for the user and leaves the editor font independent', () => {
  const target = storage();
  let settings = loadSettings(target);
  assert.equal(resolveSetting(settings, 'ui.fontFamily').value, 'DM Sans');
  settings = changeSetting(settings, 'ui.fontFamily', 'Verdana');
  saveSettings(target, settings);
  const restored = loadSettings(target);
  assert.equal(resolveSetting(restored, 'ui.fontFamily').value, 'Verdana');
  assert.equal(resolveSetting(restored, 'editor.fontFamily').value, 'Cascadia Code');
  assert.throws(() => changeSetting(restored, 'ui.fontFamily', 'Not installed'), /Invalid setting value/);
  assert.throws(() => changeSetting(restored, 'ui.fontFamily', 'Arial', 'workspace', 'D:\\SQL'), /Unsupported setting scope/);
});
