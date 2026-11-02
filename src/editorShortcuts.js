export const editorShortcutActions = [
  { id:'run', label:'Run SQL', shortcut:'Ctrl+Enter' },
  {id:'bookmark',label:'Source bookmarks',shortcut:'Ctrl+Alt+B'},
  {id:'nextBookmark',label:'Next source bookmark',shortcut:'Ctrl+Alt+J'},
  {id:'previousBookmark',label:'Previous source bookmark',shortcut:'Ctrl+Alt+Shift+J'},
  {id:'lastEdit',label:'Return to last edit',shortcut:'Ctrl+Alt+Home'},
  {id:'previousEdit',label:'Previous edit location',shortcut:'Ctrl+Alt+PageUp'},
  {id:'nextEdit',label:'Next edit location',shortcut:'Ctrl+Alt+PageDown'},
  {id:'lastExecution',label:'Return to latest executed SQL',shortcut:'Ctrl+Alt+End'},
  { id:'outline', label:'File outline', shortcut:'Ctrl+Alt+O' },
  { id:'format', label:'Format SQL', shortcut:'Ctrl+Shift+F' },
  { id:'deleteLine', label:'Delete line', shortcut:'Ctrl+D', command:'editor.action.deleteLines', edits:true },
  { id:'commentLine', label:'Toggle comment', shortcut:'Ctrl+/', command:'editor.action.commentLine', edits:true },
  { id:'duplicateLine', label:'Duplicate line', shortcut:'Alt+Shift+ArrowDown', command:'editor.action.copyLinesDownAction', edits:true },
  { id:'moveLineUp', label:'Move line up', shortcut:'Alt+ArrowUp', command:'editor.action.moveLinesUpAction', edits:true },
  { id:'moveLineDown', label:'Move line down', shortcut:'Alt+ArrowDown', command:'editor.action.moveLinesDownAction', edits:true },
  { id:'find', label:'Find', shortcut:'Ctrl+F', command:'actions.find' },
  { id:'replace', label:'Replace', shortcut:'Ctrl+H', command:'editor.action.startFindReplaceAction' },
  { id:'suggest', label:'Suggestions', shortcut:'Ctrl+Space', command:'editor.action.triggerSuggest' },
  { id:'smartEnter', label:'Complete statement (Smart Enter)', shortcut:'Ctrl+Shift+Enter', command:'fbsdb.smartEnter', edits:true },
];
export const defaultEditorShortcuts = Object.freeze(Object.fromEntries(editorShortcutActions.map(a=>[a.id,a.shortcut])));
const reserved = new Set(['Ctrl+P','Ctrl+Shift+P','Ctrl+S','Ctrl+O','Ctrl+Shift+O','Ctrl+N','Ctrl+Tab','Ctrl+Shift+Tab','Ctrl+Alt+Z','Ctrl+Z','Ctrl+Shift+Z','Ctrl+Y','Ctrl+C','Ctrl+V','Ctrl+X','Ctrl+A','Alt+ArrowLeft','Alt+ArrowRight','F8','Shift+F8']);
export function canonicalShortcut(value) {
  if(value==='')return '';
  if(typeof value!=='string')return undefined;
  const parts=value.split('+'), key=parts.pop(), modifiers=parts.map(s=>s.toLowerCase());
  if(new Set(modifiers).size!==modifiers.length||modifiers.some(s=>!['ctrl','alt','shift','meta'].includes(s)))return undefined;
  const named=['Enter','Space','Backspace','Delete','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Tab'];
  const normalizedKey=named.find(s=>s.toLowerCase()===key.toLowerCase())||(/^(?:[a-z0-9/.,;]|F(?:[1-9]|1[0-2]))$/i.test(key)?key.toUpperCase():undefined);
  if(!normalizedKey||!modifiers.length&&!/^F\d+$/.test(normalizedKey))return undefined;
  return [...['Ctrl','Alt','Shift','Meta'].filter(s=>modifiers.includes(s.toLowerCase())),normalizedKey].join('+');
}
export function shortcutProblem(shortcuts,action,value) {
  const key=canonicalShortcut(value);
  if(key===undefined)return 'Use a modifier and a key, or a function key.';
  if(!key)return '';
  if(reserved.has(key))return 'This shortcut is used by the workbench.';
  if(key==='Ctrl+Shift+F'&&action!=='format')return 'Ctrl+Shift+F is reserved for Format SQL.';
  const duplicate=editorShortcutActions.find(a=>a.id!==action&&canonicalShortcut(shortcuts[a.id])===key);
  return duplicate?`Already used by ${duplicate.label}.`:'';
}
export function normalizeEditorShortcuts(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const result={}, used=new Set();
  // Preserve existing customized actions before filling newly introduced defaults.
  for(const action of editorShortcutActions.filter(a=>Object.hasOwn(value,a.id))){
    const key=canonicalShortcut(value[action.id]);
    if(key===undefined||key&&used.has(key)||key&&reserved.has(key)||key==='Ctrl+Shift+F'&&action.id!=='format')return undefined;
    result[action.id]=key;if(key)used.add(key);
  }
  for(const action of editorShortcutActions.filter(a=>!Object.hasOwn(value,a.id))){result[action.id]=used.has(action.shortcut)?'':action.shortcut;used.add(action.shortcut)}
  return result;
}
export function shortcutFromEvent(event) {
  if(['Control','Alt','Shift','Meta','AltGraph'].includes(event.key)||event.isComposing||event.getModifierState?.('AltGraph'))return undefined;
  return canonicalShortcut([...['Ctrl','Alt','Shift','Meta'].filter((_,i)=>[event.ctrlKey,event.altKey,event.shiftKey,event.metaKey][i]),event.key===' '?'Space':event.key].join('+'));
}
export function matchesShortcut(event,shortcut) {
  return Boolean(shortcut)&&shortcutFromEvent(event)===canonicalShortcut(shortcut);
}

// Preset keymaps override only the actions they name; everything else keeps the default. Single chords only, never the workbench-reserved keys.
export const keymapPresets = Object.freeze([
  { id: 'default', label: 'fbsDB default', overrides: {} },
  { id: 'visual-studio', label: 'Visual Studio style', overrides: { run: 'F5', deleteLine: 'Ctrl+Shift+L', duplicateLine: 'Ctrl+D', moveLineUp: 'Alt+ArrowUp', moveLineDown: 'Alt+ArrowDown', outline: 'Ctrl+Alt+O', suggest: 'Ctrl+Space' } },
  { id: 'jetbrains', label: 'JetBrains style', overrides: { deleteLine: 'Ctrl+Shift+Delete', duplicateLine: 'Ctrl+D', moveLineUp: 'Alt+Shift+ArrowUp', moveLineDown: 'Alt+Shift+ArrowDown', replace: 'Ctrl+R', outline: 'Ctrl+F12', suggest: 'Ctrl+Space' } },
]);

export function presetShortcuts(id) {
  const preset = keymapPresets.find(item => item.id === id);
  return preset ? normalizeEditorShortcuts({ ...defaultEditorShortcuts, ...preset.overrides }) : undefined;
}

// The preset whose mapping the current shortcuts equal exactly, or null when they are customized.
export function activePreset(shortcuts) {
  return keymapPresets.find(preset => { const mapped = presetShortcuts(preset.id); return mapped && editorShortcutActions.every(action => mapped[action.id] === shortcuts?.[action.id]); })?.id ?? null;
}
