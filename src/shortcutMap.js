import { editorShortcutActions } from './editorShortcuts.js';

// The keyboard map: editor shortcuts follow the user's own bindings, the others are fixed in the app.
const general = [
  ['Search files, objects, commands and settings', 'Ctrl+P'], ['Save SQL file', 'Ctrl+S'], ['New SQL file', 'Ctrl+N'], ['Open SQL file', 'Ctrl+Shift+O'],
  ['Switch connection', 'Ctrl+O'], ['Next / previous tab', 'Ctrl+Tab / Ctrl+Shift+Tab'], ['Editor focus mode', 'Ctrl+Alt+Z'],
  ['Show keys on controls (tap, then press the letter)', 'Alt'], ['This shortcut map', '?']
];
const grid = [
  ['Edit the selected cell', 'F2'], ['Start editing by typing (edit mode)', 'Any character'], ['Keep the edit / cancel it', 'Enter / Escape'], ['Keep the edit and move to the next cell', 'Tab / Shift+Tab'], ['Clear the selected cell to NULL (edit mode)', 'Delete'],
  ['Undo / redo an unapplied change (edit mode)', 'Ctrl+Z / Ctrl+Y'], ['Go to row', 'Ctrl+G'],
  ['Next / previous marked row', 'Ctrl+Alt+ArrowDown / Ctrl+Alt+ArrowUp'], ['Result commands', 'Ctrl+Shift+P'], ['Next / previous record (record view)', 'Alt+PageDown / Alt+PageUp']
];

export function shortcutSections(userShortcuts = {}) {
  const editor = editorShortcutActions.map(action => [action.label, userShortcuts[action.id] ?? action.shortcut]).filter(([, keys]) => keys);
  return [
    { id: 'editor', title: 'Editor', items: editor },
    { id: 'grid', title: 'Results grid', items: grid },
    { id: 'general', title: 'Anywhere', items: general }
  ].map(section => ({ ...section, items: section.items.map(([label, keys]) => ({ label, keys })) }));
}

// Where the keyboard is right now decides which section comes first.
export function contextOf(element) {
  if (element?.closest?.('.monaco-editor')) return 'editor';
  if (element?.closest?.('.grid-wrap, .results-toolbar, .grid-edit-bar, .result-presentation-layout')) return 'grid';
  return 'general';
}

export function orderSections(sections, context) {
  return [...sections].sort((a, b) => (a.id === context ? -1 : 0) - (b.id === context ? -1 : 0));
}

export function filterSections(sections, query) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return sections;
  return sections.map(section => ({ ...section, items: section.items.filter(item => words.every(word => `${item.label} ${item.keys}`.toLowerCase().includes(word))) })).filter(section => section.items.length);
}

// "?" opens the map only when it is not being typed into a field or editor.
export function opensShortcutMap(event) {
  if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
  const target = event.target;
  if (target?.closest?.('input, textarea, select, [contenteditable="true"], .monaco-editor, .cell-editor')) return false;
  if (typeof document !== 'undefined' && document.querySelector?.('.modal-backdrop')) return false;
  return true;
}
