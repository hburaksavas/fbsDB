// Turns rows read from real Oracle into the statements the grid would send, using
// the grid's own draft and DML code. Reads a request as JSON on stdin.
import { buildDml } from '../../src/dmlPreview.js';
import { editCell, editInserted, emptyDrafts, insertRow, toggleDeleted } from '../../src/gridDrafts.js';
import { reviveOracleTemporal } from '../../src/oracleTemporal.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { table, columns, identity, rows, edits = [], deletes = [], inserts = [] } = JSON.parse(input);
const revived = rows.map(row => row.map(reviveOracleTemporal));
const indexOf = name => {
  const index = columns.findIndex(column => column.name === name);
  if (index < 0) throw new Error(`Unknown column ${name}`);
  return index;
};
// The text ResultsGrid edits for a stored value.
const editedText = value => value?.kind === 'temporal' ? String(value.value) : value ?? null;

let drafts = emptyDrafts();
for (const edit of edits) {
  const col = indexOf(edit.column);
  drafts = editCell(drafts, edit.row, col, editedText(revived[edit.row][col]), edit.value == null ? { isNull: true } : { value: edit.value });
}
for (const row of deletes) drafts = toggleDeleted(drafts, row);
for (const values of inserts) {
  drafts = insertRow(drafts);
  const id = drafts.inserted.at(-1).id;
  for (const [name, value] of Object.entries(values)) drafts = editInserted(drafts, id, indexOf(name), value === null ? { isNull: true } : { value });
}
const built = buildDml({ table, columns, identity: identity.map(indexOf), rowAt: index => revived[index], drafts });
if (built.problems.length) throw new Error(built.problems.join(' '));
process.stdout.write(JSON.stringify(built.statements));
