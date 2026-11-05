import { sameCell } from './postCommit.js';
import { oracleTemporalText, reviveOracleTemporal } from './oracleTemporal.js';

const shown = value => value == null ? 'NULL' : value?.kind === 'temporal' ? oracleTemporalText(value) : String(value);

// What Oracle really stored for an applied statement: defaults, identity values, and anything a trigger or a computed column changed.
// `cells` are the values to show in the grid; `note` names only what differs from what was sent. A failed read never changes the fact that the statement applied.
export function readbackDetails(statement, outcome) {
  if (outcome?.readbackError) return { cells: {}, note: `The change applied, but its stored values could not be read back: ${outcome.readbackError}` };
  if (!Array.isArray(outcome?.readback) || !statement?.readIndexes) return { cells: {}, note: '' };
  const cells = {}, set = [];
  statement.readIndexes.forEach((col, at) => {
    const value = reviveOracleTemporal(outcome.readback[at]), name = statement.readNames[at];
    if (Object.hasOwn(statement.sent, col)) {
      cells[col] = value;
      if (!sameCell(statement.sent[col], value)) set.push(`${name} = ${shown(value)} (sent ${shown(statement.sent[col])})`);
    } else if (statement.kind === 'insert' ? value != null : !sameCell(statement.before?.[at] ?? null, value)) {
      cells[col] = value;
      set.push(`${name} = ${shown(value)}`);
    }
  });
  return { cells, note: set.length ? `Oracle set ${set.join(', ')}.` : '' };
}

// The stored values of updated rows, to show in the grid in place of what was typed.
export function appliedReadbackCells(statements, outcomes) {
  const cells = {};
  for (const outcome of outcomes) {
    const statement = statements[outcome.index];
    if (outcome.status !== 'applied' || statement?.kind !== 'update') continue;
    for (const [col, value] of Object.entries(readbackDetails(statement, outcome).cells)) cells[`${statement.row}:${col}`] = value;
  }
  return cells;
}
