import { oracleTemporalText } from './oracleTemporal.js';

const quote = name => `"${String(name).replaceAll('"', '""')}"`;
const upper = value => String(value ?? '').toUpperCase();
export const pickerRowLimit = 50;
const searchableLimit = 8;

// The foreign keys a value can be picked for: every column of the key must be in the result and editable, because a composite key is changed as a whole.
export function foreignKeyTargets(columns, parents, editable) {
  const targets = new Map();
  for (const relation of parents) {
    const pairs = relation.pairs.map(pair => ({ ...pair, col: columns.findIndex(column => upper(column.sourceColumn || column.name) === upper(pair.child)) }));
    if (!pairs.length || pairs.some(pair => pair.col < 0 || !editable[pair.col]?.editable)) continue;
    const target = { owner: relation.owner, table: relation.table, constraint: relation.constraint, pairs };
    for (const pair of pairs) if (!targets.has(pair.col)) targets.set(pair.col, target);
  }
  return targets;
}

// Reads the parent table with the search text as a bind. Before the first answer only the key columns are known; afterwards text columns are searched as well.
export function pickerQuery(target, search = '', knownColumns = []) {
  const source = `${target.owner ? `${quote(target.owner)}.` : ''}${quote(target.table)}`, order = target.pairs.map(pair => quote(pair.parent)).join(', ');
  const text = String(search).trim();
  if (!text) return { sql: `SELECT * FROM ${source} ORDER BY ${order}`, parameters: [] };
  const keys = new Set(target.pairs.map(pair => upper(pair.parent)));
  const charColumns = knownColumns.filter(column => /CHAR/i.test(column.type || '') && !keys.has(upper(column.name))).slice(0, searchableLimit);
  const conditions = [...target.pairs.map(pair => `TO_CHAR(${quote(pair.parent)}) LIKE :search ESCAPE '\\'`), ...charColumns.map(column => `UPPER(${quote(column.name)}) LIKE UPPER(:search) ESCAPE '\\'`)];
  const escaped = text.replace(/[\\%_]/g, match => `\\${match}`);
  return { sql: `SELECT * FROM ${source} WHERE ${conditions.join(' OR ')} ORDER BY ${order}`, parameters: [{ name: 'search', type: 'VARCHAR2', value: `%${escaped}%`, direction: 'IN' }] };
}

export const pickerCellText = value => value == null ? 'NULL' : value?.kind === 'temporal' ? oracleTemporalText(value) : typeof value === 'object' ? '(not shown)' : String(value);

// The values to stage for a chosen parent row, or why they cannot be taken from it.
export function pickedCells(target, parentColumns, row) {
  const cells = [];
  for (const pair of target.pairs) {
    const at = parentColumns.findIndex(column => upper(column.name) === upper(pair.parent));
    if (at < 0) return { error: `The parent column ${pair.parent} is not in the answer.` };
    const value = row[at];
    if (value != null && typeof value === 'object' && value.kind !== 'temporal') return { error: `The value of ${pair.parent} cannot be used as text.` };
    cells.push({ col: pair.col, value: value == null ? null : value.kind === 'temporal' ? oracleTemporalText(value) : String(value) });
  }
  return { cells };
}
