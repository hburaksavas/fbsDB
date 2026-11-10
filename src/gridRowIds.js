// Rows of a table without a usable primary key are identified by ROWID. The host reads the executed query again with each row's
// ROWID in front (sql.evaluate with withRowIds); this module pairs those ROWIDs with the rows the grid already shows.
export const rowIdColumn = 'FBSDB_ROWID';

// Large and structured values are not compared; they come back as handles, not as values.
const notCompared = /CLOB|BLOB|BFILE|LONG|RAW|XMLTYPE|JSON|SDO_|OBJECT|REF|ARRAY|TABLE|CURSOR/i;
const text = value => value == null ? null : typeof value !== 'object' ? String(value) : value.kind === 'temporal' ? `${value.value}|${value.offset ?? ''}|${value.region ?? ''}` : String(value.value ?? value);

// Pairs by value, not by position: the second read may return rows in another order. Rows that are equal in every compared column
// are interchangeable, so each simply takes one of the matching ROWIDs. A row that is no longer found was changed or deleted since
// it was read and gets no ROWID, which keeps it from being edited.
export function matchRowIds({ columns, rows, reply }) {
  const read = reply.columns || [], count = read.length - 1;
  if (read[0]?.name !== rowIdColumn || count < 1 || count > columns.length || read.slice(1).some((column, index) => column.name !== columns[index].name)) return { error: 'The query returned different columns when it was read again, so its rows cannot be identified.' };
  const compared = [...Array(count).keys()].filter(index => !notCompared.test(columns[index].type || ''));
  const keyOf = (row, offset) => JSON.stringify(compared.map(index => text(row[index + offset])));
  const pool = new Map();
  for (const row of reply.rows || []) {
    const key = keyOf(row, 1);
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(String(row[0]));
  }
  const ids = new Map();
  let missing = 0;
  for (const item of rows) {
    const id = pool.get(keyOf(item.row, 0))?.shift();
    if (id) ids.set(item.index, id); else missing++;
  }
  return { ids, missing };
}

// Why Oracle gave no ROWIDs, in the user's terms. ORA-01445/01446: the query's rows are not single rows of one table.
export function rowIdRefusal(message) {
  const text = String(message || '');
  if (/ORA-0144[56]/.test(text)) return 'This query cannot be edited: the table has no primary key, and Oracle cannot tell which table row each result row is (DISTINCT, GROUP BY, ROWNUM or a join). Use FETCH FIRST n ROWS ONLY instead of ROWNUM, or select the rows without those.';
  return `The rows of this result could not be identified: ${text.replace(/^[\s\S]*?(ORA-\d{5}:?)/, '$1').split('\n')[0].trim() || 'no answer from Oracle.'}`;
}
