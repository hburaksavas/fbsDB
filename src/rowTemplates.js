import { sensitiveBindName } from './bindDefinitions.js';

export const rowTemplatesStorageKey = 'fbsdb.rowTemplates';
const maxTemplates = 20;

export const templateTableKey = column => column?.sourceTable ? `${column.sourceSchema || ''}.${column.sourceTable}`.toUpperCase() : null;

export function loadRowTemplates(storage) {
  try {
    const data = JSON.parse(storage?.getItem(rowTemplatesStorageKey) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).map(([key, list]) => [key, (Array.isArray(list) ? list : []).filter(item => item && typeof item.name === 'string' && item.values && typeof item.values === 'object').slice(0, maxTemplates)]));
  } catch { return {}; }
}
export function saveRowTemplate(storage, tableKey, template) {
  const all = loadRowTemplates(storage);
  all[tableKey] = [...(all[tableKey] || []).filter(item => item.name.toLowerCase() !== template.name.toLowerCase()), template].slice(-maxTemplates);
  try { storage?.setItem(rowTemplatesStorageKey, JSON.stringify(all)); } catch { /* the template stays for this session only */ }
  return all;
}
export function removeRowTemplate(storage, tableKey, name) {
  const all = loadRowTemplates(storage);
  all[tableKey] = (all[tableKey] || []).filter(item => item.name !== name);
  try { storage?.setItem(rowTemplatesStorageKey, JSON.stringify(all)); } catch { /* ignore */ }
  return all;
}

// A template keeps field presets by column NAME. Key, identity, locked and secret-looking columns are never stored, so a template cannot
// carry a row's identity or a password into another record.
export function templateFromRow(values, columns, editable, identity, name) {
  const kept = {}, left = [];
  for (const [col, entry] of Object.entries(values)) {
    const index = Number(col), column = columns[index];
    if (!column) continue;
    if (identity.includes(index) || !editable[index]?.editable || sensitiveBindName(column.name)) { left.push(column.name); continue; }
    kept[column.sourceColumn || column.name] = entry;
  }
  return { template: { name: String(name || '').trim().slice(0, 60), values: kept }, left };
}

// Template values as new-row values for the current result's column order; columns the result does not have are reported.
export function valuesFromTemplate(template, columns, editable) {
  const values = {}, missing = [];
  for (const [name, entry] of Object.entries(template.values)) {
    const index = columns.findIndex(column => String(column.sourceColumn || column.name).toUpperCase() === name.toUpperCase());
    if (index < 0 || !editable[index]?.editable) missing.push(name); else values[index] = entry;
  }
  return { values, missing };
}
