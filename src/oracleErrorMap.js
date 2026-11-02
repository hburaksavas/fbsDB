// Reads the Oracle error text for what it names (column, constraint) so the failure can be shown on the cell or row instead of only in a list.
export function parseOracleError(message) {
  const text = String(message || '');
  const code = /ORA-(\d{5})/.exec(text)?.[1] || null;
  const result = { code, column: null, constraint: null, kind: 'other', text: text.replace(/^[\s\S]*?(ORA-\d{5}:?)/, '$1').split('\n')[0].trim() || text.trim() };
  const column = /"([^"]+)"\."([^"]+)"\."([^"]+)"/.exec(text)?.[3] || null;
  const constraint = /\(([^)]+)\)\s+violated/.exec(text)?.[1] || null;
  if (code === '12899') { result.kind = 'too-long'; result.column = column; }
  else if (code === '01400' || code === '01407') { result.kind = 'not-null'; result.column = column; }
  else if (code === '00001') { result.kind = 'unique'; result.constraint = constraint; }
  else if (code === '02290') { result.kind = 'check'; result.constraint = constraint; }
  else if (code === '02291' || code === '02292') { result.kind = 'foreign-key'; result.constraint = constraint; }
  else if (['01722', '01858', '01861', '01843'].includes(code)) result.kind = 'format';
  return result;
}

// Maps failed outcomes to places in the grid: a cell when Oracle names a column of the result, otherwise the row.
export function mapApplyErrors(statements, outcomes, columns) {
  const errors = [];
  outcomes.forEach(outcome => {
    if (outcome.status !== 'failed') return;
    const statement = statements[outcome.index];
    if (!statement) return;
    const parsed = parseOracleError(outcome.error);
    const col = parsed.column ? columns.findIndex(column => String(column.sourceColumn || column.name).toUpperCase() === parsed.column.toUpperCase()) : -1;
    errors.push({ statementIndex: outcome.index, kind: statement.kind, row: statement.kind === 'insert' ? null : statement.row, insertId: statement.kind === 'insert' ? statement.id : null, col: col >= 0 ? col : null, constraint: parsed.constraint, code: parsed.code, message: parsed.text });
  });
  return errors;
}

export const splitConstraint = (text, defaultOwner = '') => { const parts = String(text || '').split('.'); return parts.length > 1 ? { owner: parts[0], name: parts.slice(1).join('.') } : { owner: defaultOwner, name: parts[0] }; };

// One plain sentence about what a constraint requires, from the database's own definition.
export function constraintGuidance(info) {
  if (!info?.found) return null;
  const columns = (info.columns || []).join(', ');
  switch (info.constraintType) {
    case 'C': return info.condition ? `${info.name} requires: ${info.condition}` : `${info.name} is a column rule${columns ? ` on ${columns}` : ''}.`;
    case 'U': return `${info.name} requires unique values in (${columns}).`;
    case 'P': return `${info.name} is the primary key (${columns}); it must be unique and not NULL.`;
    case 'R': return `${info.name} requires (${columns}) to match an existing parent row${info.referenced ? ` (${info.referenced})` : ''}.`;
    default: return `${info.name}${columns ? ` covers ${columns}` : ''}.`;
  }
}
