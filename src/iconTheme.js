export const iconPacksStorageKey = 'fbsdb.iconPacks';
export const builtInIconThemes = Object.freeze([
  { id: 'default', label: 'Default (colored line icons)' },
  { id: 'mono', label: 'Monochrome line icons' },
  { id: 'letters', label: 'Letter badges for objects' },
]);
export const iconSlots = Object.freeze(['TABLE', 'VIEW', 'MATERIALIZED VIEW', 'SYNONYM', 'PACKAGE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'SEQUENCE', 'INDEX', 'CONSTRAINT', 'TYPE', 'DATABASE LINK', 'FILE', 'FOLDER', 'FOLDER_OPEN']);
export const objectLetters = Object.freeze({ TABLE: 'T', VIEW: 'V', 'MATERIALIZED VIEW': 'MV', SYNONYM: 'Sy', PACKAGE: 'P', PROCEDURE: 'Pr', FUNCTION: 'Fn', TRIGGER: 'Tg', SEQUENCE: 'Sq', INDEX: 'Ix', CONSTRAINT: 'C', TYPE: 'Ty', 'DATABASE LINK': 'L' });

const maxPacks = 10, maxIcons = 20, maxPath = 2000, maxName = 40;
const pathData = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;

// An imported pack is data only: a name and SVG path strings for known slots. No markup, scripts or URLs are ever accepted.
export function parseIconPack(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'The icon pack is not valid JSON.' }; }
  if (!data || data.version !== 1 || typeof data.name !== 'string') return { error: 'Expected {"version":1,"name":"…","icons":{…}}.' };
  const name = data.name.trim().slice(0, maxName);
  if (!name) return { error: 'The icon pack needs a name.' };
  const icons = {}, rejected = [];
  for (const [slot, value] of Object.entries(data.icons && typeof data.icons === 'object' ? data.icons : {}).slice(0, maxIcons * 2)) {
    const key = slot.toUpperCase();
    if (!iconSlots.includes(key)) { rejected.push(`${slot}: unknown icon`); continue; }
    if (typeof value !== 'string' || !value.trim() || value.length > maxPath || !pathData.test(value)) { rejected.push(`${slot}: not plain SVG path data`); continue; }
    if (Object.keys(icons).length < maxIcons) icons[key] = value.trim();
  }
  if (!Object.keys(icons).length) return { error: `No usable icons.${rejected.length ? ` ${rejected.join('; ')}.` : ''}` };
  return { pack: { name, icons }, rejected };
}

export function loadIconPacks(storage) {
  try {
    const list = JSON.parse(storage?.getItem(iconPacksStorageKey) || '[]');
    return (Array.isArray(list) ? list : []).map(item => parseIconPack(JSON.stringify({ version: 1, ...item })).pack).filter(Boolean).slice(0, maxPacks);
  } catch { return []; }
}
export function saveIconPacks(storage, packs) {
  try { storage?.setItem(iconPacksStorageKey, JSON.stringify(packs.slice(0, maxPacks))); } catch { /* the pack stays available for this session */ }
}
export function addIconPack(packs, pack) {
  return [...packs.filter(item => item.name.toLowerCase() !== pack.name.toLowerCase()), pack].slice(-maxPacks);
}

export const packThemeId = name => `pack:${name}`;
export function resolveIconTheme(id, packs) {
  if (builtInIconThemes.some(item => item.id === id)) return { id, kind: id, icons: {} };
  const pack = String(id).startsWith('pack:') ? packs.find(item => packThemeId(item.name) === id) : null;
  return pack ? { id, kind: 'pack', icons: pack.icons, name: pack.name } : { id: 'default', kind: 'default', icons: {} };
}

// What one icon looks like in the active theme.
export function iconFor(theme, slot) {
  if (theme.kind === 'pack' && theme.icons[slot]) return { type: 'path', d: theme.icons[slot] };
  if (theme.kind === 'letters' && objectLetters[slot]) return { type: 'letter', text: objectLetters[slot] };
  return { type: 'default', mono: theme.kind === 'mono' };
}

// Tiny external store so icons in any component follow the setting without prop drilling.
let current = resolveIconTheme('default', []);
const listeners = new Set();
export const getIconTheme = () => current;
export function setIconTheme(theme) { if (theme.id === current.id && theme.icons === current.icons) return; current = theme; listeners.forEach(listener => listener()); }
export function subscribeIconTheme(listener) { listeners.add(listener); return () => listeners.delete(listener); }
