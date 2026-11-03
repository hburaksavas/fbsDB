export const booleanColumnsStorageKey = 'fbsdb.booleanColumns';
export const booleanPresets = Object.freeze([
  { id: 'none', label: 'Normal text', on: null, off: null },
  { id: 'yn', label: 'Y / N', on: 'Y', off: 'N' },
  { id: '10', label: '1 / 0', on: '1', off: '0' },
  { id: 'tf', label: 'T / F', on: 'T', off: 'F' },
  { id: 'truefalse', label: 'TRUE / FALSE', on: 'TRUE', off: 'FALSE' },
]);

export const booleanColumnKey = column => column?.sourceTable ? `${column.sourceSchema || ''}.${column.sourceTable}.${column.sourceColumn || column.name}`.toUpperCase() : null;

export function loadBooleanColumns(storage) {
  try {
    const data = JSON.parse(storage?.getItem(booleanColumnsStorageKey) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, id]) => booleanPresets.some(preset => preset.id === id && preset.id !== 'none')));
  } catch { return {}; }
}
export function saveBooleanColumn(storage, key, presetId) {
  const all = loadBooleanColumns(storage);
  if (!presetId || presetId === 'none') delete all[key]; else if (booleanPresets.some(preset => preset.id === presetId)) all[key] = presetId;
  try { storage?.setItem(booleanColumnsStorageKey, JSON.stringify(all)); } catch { /* the mapping applies to this session only */ }
  return all;
}
export const presetFor = presetId => booleanPresets.find(preset => preset.id === presetId && preset.id !== 'none') || null;

// on / off / null (SQL NULL, shown as the third checkbox state) / other (a value outside the mapping, left as text so nothing is hidden).
export function booleanState(preset, value) {
  if (value == null) return 'null';
  const text = String(value).trim();
  if (text.toUpperCase() === preset.on.toUpperCase()) return 'on';
  if (text.toUpperCase() === preset.off.toUpperCase()) return 'off';
  return 'other';
}
export const toggledValue = (preset, value) => booleanState(preset, value) === 'on' ? preset.off : preset.on;
