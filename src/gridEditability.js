const lobOrBinary = /CLOB|BLOB|BFILE|LONG|RAW|ROWID|XMLTYPE|JSON|SDO_|OBJECT|REF|ARRAY|TABLE|CURSOR/i;
const upper = value => String(value ?? '').toUpperCase();

const tableName = column => column.sourceTable ? `${column.sourceSchema ? `${column.sourceSchema}.` : ''}${column.sourceTable}` : null;

// Why a result can or cannot be edited, and which columns are the row identity. A SELECT is never assumed to be updatable.
// `primaryKey` is the key column names of the single source table (from the database), or null when unknown/absent.
export function explainEditability(columns, { primaryKey = null, readOnly = false } = {}) {
  const reasons = [];
  if (readOnly) reasons.push('This tab is read-only.');
  const tables = [...new Set(columns.map(tableName).filter(Boolean))];
  if (!tables.length) reasons.push('The result has no source table: every column is an expression or computed value.');
  if (tables.length > 1) reasons.push(`The columns come from several tables (${tables.join(', ')}); editing needs exactly one source table.`);
  const table = tables.length === 1 ? { schema: columns.find(tableName)?.sourceSchema || '', name: columns.find(tableName).sourceTable } : null;

  const perColumn = columns.map((column, index) => {
    if (!column.sourceTable || tableName(column) !== tables[0]) return { index, editable: false, reason: 'This column is an expression or comes from another table.' };
    if (column.virtual || column.computed) return { index, editable: false, reason: 'A virtual or computed column is derived by Oracle and cannot be set.' };
    if (column.identityAlways || column.generatedAlways) return { index, editable: false, reason: 'A GENERATED ALWAYS column is set by Oracle.' };
    if (lobOrBinary.test(column.type || '')) return { index, editable: false, reason: `${column.type} values are not edited in the grid.` };
    if (!column.sourceColumn) return { index, editable: false, reason: 'The source column is unknown.' };
    return { index, editable: true, reason: '' };
  });

  let identity = [], keyProblem = null;
  if (table) {
    if (!primaryKey || !primaryKey.length) { reasons.push('The source table has no primary key, so a row cannot be identified reliably.'); keyProblem = 'absent'; }
    else {
      const missing = [], found = [];
      for (const name of primaryKey) {
        const index = columns.findIndex(column => tableName(column) === tables[0] && upper(column.sourceColumn || column.name) === upper(name));
        if (index < 0) missing.push(name); else found.push(index);
      }
      if (missing.length) reasons.push(`The primary key column${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in the result; select ${missing.length > 1 ? 'them' : 'it'} to edit rows.`);
      else identity = found;
    }
  }
  const editable = !reasons.length && perColumn.some(item => item.editable);
  if (!reasons.length && !editable) reasons.push('No column of this result can be edited.');
  return { editable, reasons, table, identity, keyProblem, columns: perColumn };
}

// Which editor a cell gets: a calendar for plain DATE/TIMESTAMP values, a multi-line editor for long or multi-line text, otherwise a line.
export function cellEditorKind(column, originalText) {
  const type = String(column?.type || '').toUpperCase();
  if (/^(DATE|TIMESTAMP(\(\d+\))?)$/.test(type) && (originalText == null || /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(originalText))) return 'datetime';
  if (typeof originalText === 'string' && (originalText.length > 80 || originalText.includes('\n'))) return 'longtext';
  return 'text';
}

// Calendar control text ("2026-11-02T10:30:00") from a stored value ("2026-11-02 10:30:00") and back to bind text.
export const toCalendarValue = text => text ? String(text).replace(' ', 'T').slice(0, 19) : '';
export function fromCalendarValue(text) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?$/.exec(String(text || '').trim());
  return match ? `${match[1]} ${match[2] || '00:00'}:${match[3] || '00'}` : String(text || '');
}

// Columns a user may nominate as the row identity when the table has no primary key: plain source columns of the single table.
export const candidateKeyColumns = columns => columns.map((column, index) => ({ column, index })).filter(({ column }) => column.sourceTable && column.sourceColumn && !lobOrBinary.test(column.type || '') && !column.virtual && !column.computed);

// A chosen key is checked against the LOADED rows only: it must be non-NULL and unique there. That is evidence, never proof of a
// database-wide key, so Apply still verifies that every statement changes exactly one row.
export function validateManualKey(columns, rows, indexes) {
  if (!indexes.length) return { error: 'Choose at least one column.' };
  const seen = new Map();
  for (const item of rows) {
    const parts = indexes.map(index => item.row[index]);
    if (parts.some(part => part == null)) return { error: `Row ${item.index + 1} has NULL in ${indexes.map(index => columns[index].name).join(', ')}; a key cannot contain NULL.` };
    const key = JSON.stringify(parts.map(String));
    if (seen.has(key)) return { error: `Rows ${seen.get(key) + 1} and ${item.index + 1} have the same values in ${indexes.map(index => columns[index].name).join(', ')}.` };
    seen.set(key, item.index);
  }
  return { ok: true, note: `The ${rows.length.toLocaleString('en-US')} loaded row${rows.length === 1 ? '' : 's'} are unique and non-NULL in these columns. That does not prove they are unique in the table.` };
}
