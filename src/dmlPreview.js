import { pendingChanges } from './gridDrafts.js';

const quote = name => `"${String(name).replaceAll('"', '""')}"`;
// Zoned columns get a zoned bind: as plain TIMESTAMP, Oracle would silently apply the session's time zone.
export const bindType = type => /NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(type || '') ? 'NUMBER' : /TIME ZONE/i.test(type || '') ? 'TIMESTAMPTZ' : /TIMESTAMP/i.test(type || '') ? 'TIMESTAMP' : /DATE/i.test(type || '') ? 'DATE' : 'VARCHAR2';
const notReadable = /CLOB|BLOB|BFILE|LONG|RAW|XMLTYPE|JSON|SDO_|OBJECT|REF|ARRAY|TABLE|CURSOR/i;
const tableSql = table => `${table.schema ? `${quote(table.schema)}.` : ''}${quote(table.name)}`;

// Parameterized INSERT/UPDATE/DELETE statements for the staged changes. Values are always binds, never literals in the text.
// An UPDATE finds its row by the ORIGINAL key values (so editing a key column still targets the row that was read) and also requires the
// edited columns to still hold the values that were read, so a change made by another session is reported instead of overwritten.
// With `rowIds` (row index -> ROWID) a row is found by its ROWID instead of key columns.
export function buildDml({ table, columns, identity, rowAt, drafts, rowIds = null }) {
  const statements = [], problems = [];
  // Columns of the source table to read back after a change, in result order. Large and structured values are left out.
  const readable = columns.map((column, index) => ({ column, index })).filter(({ column }) => column.sourceColumn && !notReadable.test(column.type || ''));
  const readPlan = readable.length ? { readColumns: readable.map(({ column }) => quote(column.sourceColumn)), readIndexes: readable.map(({ index }) => index), readNames: readable.map(({ column }) => column.name) } : {};
  const keyWhere = (row, prefix) => {
    const binds = [], conditions = [];
    if (rowIds) {
      const id = rowIds.get(row);
      if (!id) { problems.push(`Row ${row + 1}: it changed in the database since it was read, so it cannot be identified. Run the query again.`); return { conditions, binds, ok: false }; }
      return { conditions: [`ROWID = :${prefix}k1`], binds: [{ name: `${prefix}k1`, type: 'VARCHAR2', value: id }], ok: true };
    }
    identity.forEach((index, at) => {
      const original = rowAt(row)?.[index];
      if (original == null) { problems.push(`Row ${row + 1}: key column ${columns[index].name} is NULL, so the row cannot be identified.`); return; }
      if (/LOCAL TIME ZONE/i.test(columns[index].type || '')) { problems.push(`Row ${row + 1}: key column ${columns[index].name} is shown in the session's time zone, so the row cannot be identified exactly.`); return; }
      const name = `${prefix}k${at + 1}`;
      conditions.push(`${quote(columns[index].sourceColumn || columns[index].name)} = :${name}`);
      binds.push({ name, type: bindType(columns[index].type), value: String(original) });
    });
    return { conditions, binds, ok: conditions.length === identity.length };
  };
  for (const change of pendingChanges(drafts)) {
    if (change.kind === 'delete') {
      const where = keyWhere(change.row, 'd');
      if (where.ok) statements.push({ kind: 'delete', table: tableSql(table), row: change.row, expectRows: 1, sql: `DELETE FROM ${tableSql(table)} WHERE ${where.conditions.join(' AND ')}`, binds: where.binds });
    }
  }
  const updates = new Map();
  for (const change of pendingChanges(drafts)) if (change.kind === 'update') updates.set(change.row, [...(updates.get(change.row) || []), change]);
  for (const [row, cells] of updates) {
    const where = keyWhere(row, 'u');
    if (!where.ok) continue;
    const binds = [], guards = [], guardBinds = [], sets = cells.map((cell, at) => {
      const name = `c${at + 1}`, column = quote(columns[cell.col].sourceColumn || columns[cell.col].name);
      binds.push({ name, type: bindType(columns[cell.col].type), value: cell.isNull ? null : cell.value });
      // Optimistic concurrency: the row must still hold the value that was read, otherwise another session changed it.
      if (cell.original == null) guards.push(`${column} IS NULL`);
      else { guards.push(`${column} = :ok${at + 1}`); guardBinds.push({ name: `ok${at + 1}`, type: bindType(columns[cell.col].type), value: String(cell.original) }); }
      return `${column} = :${name}`;
    });
    statements.push({ kind: 'update', table: tableSql(table), row, expectRows: 1, sql: `UPDATE ${tableSql(table)} SET ${sets.join(', ')} WHERE ${[...where.conditions, ...guards].join(' AND ')}`, binds: [...binds, ...where.binds, ...guardBinds], ...readPlan, sent: Object.fromEntries(cells.map(cell => [cell.col, cell.isNull ? null : cell.value])), before: readable.map(({ index }) => rowAt(row)?.[index] ?? null) });
  }
  for (const change of pendingChanges(drafts)) {
    if (change.kind !== 'insert') continue;
    const entries = Object.entries(change.values).filter(([, value]) => value != null);
    if (!entries.length) { problems.push(`New row ${change.id}: enter at least one value (omitted columns use their database defaults).`); continue; }
    const binds = entries.map(([col, value], at) => ({ name: `i${at + 1}`, type: bindType(columns[col].type), value: value.isNull ? null : value.value }));
    statements.push({ kind: 'insert', table: tableSql(table), id: change.id, expectRows: 1, sql: `INSERT INTO ${tableSql(table)} (${entries.map(([col]) => quote(columns[col].sourceColumn || columns[col].name)).join(', ')}) VALUES (${binds.map(bind => `:${bind.name}`).join(', ')})`, binds, ...readPlan, sent: Object.fromEntries(entries.map(([col, value]) => [col, value.isNull ? null : value.value])) });
  }
  return { statements, problems };
}

// Reviewable text: the statement and each bind with its type and value (NULL shown explicitly).
export function dmlPreviewText(statements) {
  return statements.map(statement => `${statement.sql};\n${statement.binds.map(bind => `  -- :${bind.name} ${bind.type} = ${bind.value === null ? 'NULL' : JSON.stringify(bind.value)}`).join('\n')}`).join('\n\n');
}

export const statementKey = statement => statement.kind === 'insert' ? `i:${statement.id}` : `${statement.kind[0]}:${statement.row}`;

// "APP"."T": 2 updates, 1 delete - what an Apply would do, grouped by the table it touches.
export function impactSummary(statements) {
  const byTable = new Map();
  for (const statement of statements) {
    const counts = byTable.get(statement.table) || { update: 0, insert: 0, delete: 0 };
    counts[statement.kind]++;
    byTable.set(statement.table, counts);
  }
  return [...byTable].map(([table, counts]) => ({ table, counts, text: `${table}: ${[counts.update && `${counts.update} update${counts.update === 1 ? '' : 's'}`, counts.insert && `${counts.insert} insert${counts.insert === 1 ? '' : 's'}`, counts.delete && `${counts.delete} delete${counts.delete === 1 ? '' : 's'}`].filter(Boolean).join(', ')}` }));
}
