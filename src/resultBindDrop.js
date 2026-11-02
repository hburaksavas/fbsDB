import { sensitiveBindName } from './bindDefinitions.js';

export const cellDragType = 'application/x-fbsdb-result-cell';
const maxValue = 1000;

const bindTypeFor = type => /NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(type || '') ? 'NUMBER'
  : /TIMESTAMP/i.test(type || '') ? 'TIMESTAMP' : /DATE/i.test(type || '') ? 'DATE' : 'VARCHAR2';

// Name of the bind created from a column: lower case identifier, made unique among the binds already in the SQL.
export function bindNameFor(columnName, existing = []) {
  const taken = new Set(existing.map(name => String(name).toUpperCase()));
  let base = String(columnName || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  if (!base || !/^[a-z]/.test(base)) base = `p_${base}`.replace(/_$/, '') || 'p_value';
  let name = base, counter = 2;
  while (taken.has(name.toUpperCase())) name = `${base}_${counter++}`;
  return name;
}

// What travels with a dragged cell. The value is only kept when it is a short, non-sensitive scalar.
export function cellDragData(column, value) {
  const text = value == null ? '' : typeof value === 'object' ? '' : String(value);
  const keepValue = value != null && typeof value !== 'object' && text.length > 0 && text.length <= maxValue && !sensitiveBindName(column?.name) && !/CLOB|BLOB|LONG|RAW/i.test(column?.type || '');
  return JSON.stringify({ column: String(column?.name || ''), type: bindTypeFor(column?.type), ...(keepValue ? { value: text } : {}) });
}

export function parseCellDrag(text) {
  try {
    const data = JSON.parse(text);
    if (!data || typeof data.column !== 'string' || !data.column) return null;
    return { column: data.column, type: ['VARCHAR2', 'NUMBER', 'DATE', 'TIMESTAMP'].includes(data.type) ? data.type : 'VARCHAR2', value: typeof data.value === 'string' ? data.value : null };
  } catch { return null; }
}

// Result of dropping a cell on the editor: only the placeholder is inserted, never the value; the value is a session-only suggestion.
export function planBindDrop(payload, existingNames) {
  const drag = typeof payload === 'string' ? parseCellDrag(payload) : payload;
  if (!drag) return null;
  const name = bindNameFor(drag.column, existingNames);
  return { name, insertText: `:${name}`, prefill: drag.value == null ? null : { name: name.toUpperCase(), type: drag.type, value: drag.value }, type: drag.type };
}
