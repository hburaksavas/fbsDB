const quote = text => `'${String(text).replace(/'/g, "''")}'`;
const identifier = name => /^[A-Za-z][A-Za-z0-9_$#]{0,127}$/.test(name) ? name.toUpperCase() : `"${String(name).replace(/"/g, '""').slice(0, 128)}"`;
const numeric = text => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
export const inListChunk = 1000;

// Spreadsheet cells arrive as tab/newline separated text; blank cells are ignored and duplicates kept once.
export function pastedValues(text) {
  return [...new Set(String(text || '').split(/\r?\n/).flatMap(line => line.split('\t')).map(cell => cell.trim().replace(/^"(.*)"$/s, '$1')).filter(Boolean))];
}

export function inListSql(text, column = 'column_name') {
  const values = pastedValues(text);
  if (!values.length) return { error: 'The clipboard has no values.' };
  const asNumbers = values.every(numeric), literals = values.map(value => asNumbers ? value : quote(value));
  const chunks = [];
  for (let at = 0; at < literals.length; at += inListChunk) chunks.push(`${column} IN (${literals.slice(at, at + inListChunk).join(', ')})`);
  return { sql: chunks.length > 1 ? `(${chunks.join('\n OR ')})` : chunks[0], count: values.length, numeric: asNumbers };
}

const jsonType = value => typeof value === 'number' ? 'NUMBER' : typeof value === 'boolean' ? 'VARCHAR2(5)' : 'VARCHAR2(4000)';
const jsonPathKey = key => /^[A-Za-z_][\w]*$/.test(key) ? key : `"${key.replace(/"/g, '\\"')}"`;

// Rows come from the top-level array (or the single object); nested values become JSON_QUERY-style FORMAT JSON columns.
export function jsonTableSql(text, { source = ':json_document' } = {}) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { return { error: 'The clipboard does not contain valid JSON.' }; }
  const rows = Array.isArray(data) ? data : [data], sample = rows.find(item => item && typeof item === 'object' && !Array.isArray(item));
  if (!sample) return { error: 'JSON_TABLE drafts need an object or an array of objects.' };
  const keys = [...new Set(rows.filter(item => item && typeof item === 'object' && !Array.isArray(item)).flatMap(Object.keys))].slice(0, 200);
  const columns = keys.map(key => {
    const value = rows.find(item => item?.[key] != null)?.[key], nested = value !== null && typeof value === 'object';
    return `${identifier(key.replace(/[^\w$#]/g, '_'))} ${nested ? 'VARCHAR2(4000) FORMAT JSON' : jsonType(value)} PATH '$.${jsonPathKey(key).replace(/'/g, "''")}'`;
  });
  return { sql: `SELECT jt.*\nFROM JSON_TABLE(${source}, '${Array.isArray(data) ? '$[*]' : '$'}'\n  COLUMNS (\n    ${columns.join(',\n    ')}\n  )) jt;\n`, columns: columns.length };
}

export function insertTemplateSql(text, table = 'table_name') {
  const names = String(text || '').split(/[\t\r\n,]+/).map(name => name.trim()).filter(Boolean);
  const unique = [...new Set(names)];
  if (!unique.length) return { error: 'The clipboard has no column names.' };
  const columns = unique.map(identifier), binds = unique.map(name => `:${name.replace(/[^\w]/g, '_').replace(/^(\d)/, 'c$1').toLowerCase()}`);
  return { sql: `INSERT INTO ${table} (\n  ${columns.join(',\n  ')}\n) VALUES (\n  ${binds.join(',\n  ')}\n);\n`, count: unique.length };
}
