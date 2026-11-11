import {createContext} from 'react';
import {toolbarItems} from './editorToolbarModel.js';

// Result actions in toolbar order; "view" always stays a button because the column and display options open from it.
export const resultToolItems = [
  ['view', 'Table view options'], ['edit', 'Edit rows of this result'], ['descriptions', 'Show descriptions beside key values'], ['pivot', 'Pivot options'], ['filter', 'Filters'], ['sort', 'Sorting'],
  ['find', 'Find in results'], ['navigation', 'Navigate to row or column'], ['copy', 'Copy selection formats'], ['marks', 'Marks'], ['highlights', 'Highlights'],
  ['load', 'Load result rows'], ['export', 'Export results'], ['sql', 'SQL generation'], ['pin', 'Pin result'], ['memory', 'Result memory'], ['explain', 'Generate execution plan'], ['commands', 'Result commands'], ['clear', 'Reset result view'],
].map(([id, label]) => ({ id, label, fixed: id === 'view' }));

export const editorToolItems = toolbarItems.map(({ id, label }) => ({ id, label }));
// Out of the box the result toolbar shows the everyday actions; the others wait in its overflow menu and in the command palette
// ("Result: ..."). Toolbar settings can bring any of them back.
export const defaultHiddenResultTools = Object.freeze(['descriptions', 'pivot', 'navigation', 'marks', 'highlights', 'sql', 'pin', 'memory', 'explain', 'commands']);
export const defaultToolbarPrefs = Object.freeze({ editor: [], result: defaultHiddenResultTools });

const known = { editor: new Set(editorToolItems.map(item => item.id)), result: new Set(resultToolItems.filter(item => !item.fixed).map(item => item.id)) };

// Stored as { editor: [ids], result: [ids] } of controls moved out of the inline toolbar; they remain in the overflow menu.
export function normalizeToolbarPrefs(value) {
  const list = key => Array.isArray(value?.[key]) ? [...new Set(value[key].filter(id => known[key].has(id)))] : [];
  return { editor: list('editor'), result: list('result') };
}

export function toggleToolbarItem(current, bar, id) {
  const prefs = normalizeToolbarPrefs(current);
  if (!known[bar]?.has(id)) return prefs;
  return { ...prefs, [bar]: prefs[bar].includes(id) ? prefs[bar].filter(item => item !== id) : [...prefs[bar], id] };
}

export const ToolbarPrefsContext = createContext(defaultToolbarPrefs);
