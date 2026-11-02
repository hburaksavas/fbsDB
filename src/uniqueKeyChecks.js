// Duplicate primary-key values among the loaded rows and the staged new rows, using the values the drafts would leave behind.
// A key containing NULL never collides (Oracle NULL semantics), a new row that omits a key column is unknown (default/identity), and rows
// that are not loaded cannot be checked: the database constraint stays the final authority.
export function findDuplicateKeys({ columns, identity, rows, drafts }) {
  if (!identity?.length) return [];
  const groups = new Map();
  const add = (label, parts) => {
    if (parts.some(part => part == null)) return;
    const key = JSON.stringify(parts);
    groups.set(key, [...(groups.get(key) || []), { label, parts }]);
  };
  for (const item of rows) {
    if (drafts.deleted.includes(item.index)) continue;
    const parts = identity.map(col => {
      const draft = drafts.cells[`${item.index}:${col}`];
      if (draft) return draft.isNull ? null : String(draft.value).trim();
      return item.row[col] == null ? null : String(item.row[col]).trim();
    });
    add(`Row ${item.index + 1}`, parts);
  }
  for (const row of drafts.inserted) {
    const parts = identity.map(col => { const entry = row.values[col]; return entry == null ? undefined : entry.isNull ? null : String(entry.value).trim(); });
    if (parts.some(part => part === undefined)) continue;
    add(`New row ${row.id}`, parts);
  }
  return [...groups.values()].filter(group => group.length > 1).map(group => ({
    rows: group.map(item => item.label),
    message: `${group.map(item => item.label).join(' and ')} would share the key ${identity.map((col, at) => `${columns[col].name} = ${group[0].parts[at]}`).join(', ')}. Only loaded rows are compared; Oracle enforces the final rule.`,
  }));
}
