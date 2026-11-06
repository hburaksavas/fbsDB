// Which grid edit actions sit on the bar and which live in the "More" menu. The core actions are always on the bar; the rest are
// in the menu, and the user can also pin them to the bar (the menu keeps listing them so they can be unpinned). A toggle that is switched on is shown on the bar while it is on, so an active filter
// is never hidden inside a closed menu.
export const pinStorageKey = 'fbsdb.gridEditBar.pinned';
export const menuCatalog = [
  { id: 'descriptions', pinnable: true, editOnly: false },
  { id: 'record', pinnable: true, editOnly: true },
  { id: 'checkboxes', pinnable: true, editOnly: true },
  { id: 'paste', pinnable: true, editOnly: true },
  { id: 'bulk', pinnable: true, editOnly: true },
  { id: 'relatedPick', pinnable: true, editOnly: true },
  { id: 'duplicate', pinnable: true, editOnly: true },
  { id: 'prevEdit', pinnable: true, editOnly: true },
  { id: 'nextEdit', pinnable: true, editOnly: true },
  { id: 'changesOnly', pinnable: true, editOnly: true, toggle: true },
  { id: 'deletionsOnly', pinnable: true, editOnly: true, toggle: true },
  { id: 'checks', pinnable: true, editOnly: true },
  { id: 'tabAdds', pinnable: false, editOnly: true, toggle: true },
  { id: 'template', pinnable: false, editOnly: true }
];
const pinnableIds = menuCatalog.filter(item => item.pinnable).map(item => item.id);

export function loadPinned(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(pinStorageKey) || '[]');
    return Array.isArray(raw) ? pinnableIds.filter(id => raw.includes(id)) : [];
  } catch { return []; }
}

export function togglePinned(pinned, id) {
  if (!pinnableIds.includes(id)) return pinned;
  const next = pinned.includes(id) ? pinned.filter(item => item !== id) : [...pinned, id];
  return pinnableIds.filter(item => next.includes(item));
}

export function savePinned(storage, pinned) {
  try { storage?.setItem(pinStorageKey, JSON.stringify(pinned)); } catch { /* the choice just does not persist */ }
}

// editMode off: only the actions that work outside edit mode exist, and they stay on the bar. `hidden` lists actions that do not
// apply right now (for example the template picker when there are no templates). `active` lists switched-on toggles.
export function layoutActions({ editMode, pinned = [], active = [], hidden = [] }) {
  const available = menuCatalog.filter(item => (editMode || !item.editOnly) && !hidden.includes(item.id));
  const inline = [], menu = [];
  for (const item of available) {
    const show = !editMode || (item.pinnable && (pinned.includes(item.id) || (item.toggle && active.includes(item.id))));
    if (show) inline.push(item.id);
    if (editMode) menu.push(item.id); // the menu lists everything, so a pinned action can be unpinned from it
  }
  return { inline, menu };
}
