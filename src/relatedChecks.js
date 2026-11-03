const quote = name => `"${String(name).replaceAll('"', '""')}"`;
const bindType = type => /NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(type || '') ? 'NUMBER' : /TIMESTAMP/i.test(type || '') ? 'TIMESTAMP' : /DATE/i.test(type || '') ? 'DATE' : 'VARCHAR2';
const pick = (item, ...names) => { for (const name of names) if (item?.[name] !== undefined) return item[name]; return undefined; };
export const relatedKeyLimit = 50;

export function normalizeRelations(reply) {
  const relation = item => ({ owner: pick(item, 'owner', 'Owner'), table: pick(item, 'table', 'Table'), constraint: pick(item, 'constraint', 'Constraint'), deleteRule: String(pick(item, 'deleteRule', 'DeleteRule') || 'NO ACTION').toUpperCase(), pairs: (pick(item, 'pairs', 'Pairs') || []).map(pair => ({ child: pick(pair, 'child', 'Child'), parent: pick(pair, 'parent', 'Parent') })) });
  return { children: (reply?.children || []).map(relation), parents: (reply?.parents || []).map(relation) };
}

export const relationLabel = relation => `${relation.owner}.${relation.table} (${relation.pairs.map(pair => pair.child).join(', ')}) · ${relation.deleteRule}`;

// One COUNT query for a child relation over the deleted parent rows, with the parent key values as binds. A row whose key value is
// missing from the result cannot be checked and is reported instead of being guessed.
export function childCountQuery(relation, deletedRows, columns) {
  const index = pair => columns.findIndex(column => String(column.sourceColumn || column.name).toUpperCase() === String(pair.parent).toUpperCase());
  const missing = relation.pairs.filter(pair => index(pair) < 0).map(pair => pair.parent);
  if (missing.length) return { error: `The key column${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in the result, so this relationship cannot be checked.` };
  const rows = deletedRows.slice(0, relatedKeyLimit), parameters = [], conditions = [];
  rows.forEach((values, at) => {
    const parts = relation.pairs.map((pair, k) => {
      const col = index(pair), value = values[col];
      if (value == null) return null;
      const name = `r${at}k${k}`;
      parameters.push({ name, type: bindType(columns[col].type), value: String(value), direction: 'IN' });
      return `${quote(pair.child)} = :${name}`;
    });
    if (parts.every(Boolean)) conditions.push(`(${parts.join(' AND ')})`);
  });
  if (!conditions.length) return { error: 'The deleted rows have no key values to look up.' };
  return { sql: `SELECT COUNT(*) FROM ${quote(relation.owner)}.${quote(relation.table)} WHERE ${conditions.join(' OR ')}`, parameters, covered: conditions.length, total: deletedRows.length };
}

// What a count means for the delete, from the foreign key's own delete rule.
export function interpretCount(relation, count, { covered, total } = {}) {
  const partial = covered != null && total != null && covered < total ? ` Only ${covered} of ${total} deleted rows were checked.` : '';
  const n = Number(count) || 0, rows = `${n.toLocaleString('en-US')} row${n === 1 ? '' : 's'}`;
  const note = ' Another session may change this before you apply.';
  if (n === 0) return { status: 'ok', message: `${relation.owner}.${relation.table}: no referencing rows.${partial}${note}` };
  if (relation.deleteRule === 'CASCADE') return { status: 'cascade', message: `${relation.owner}.${relation.table}: ${rows} would also be deleted by the database (ON DELETE CASCADE).${partial}${note}` };
  if (relation.deleteRule === 'SET NULL') return { status: 'setnull', message: `${relation.owner}.${relation.table}: ${rows} would have ${relation.pairs.map(pair => pair.child).join(', ')} set to NULL (ON DELETE SET NULL).${partial}${note}` };
  return { status: 'blocked', message: `${relation.owner}.${relation.table}: ${rows} reference these rows and would block the delete (ORA-02292).${partial}${note}` };
}
