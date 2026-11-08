import { ExactDecimal } from './exactDecimal.js';

export const valueListLimit = 200;

// Distinct loaded values for a value-list filter; the list says when it is incomplete.
export function distinctColumnValues(rows, column, limit = valueListLimit) {
  const counts = new Map();
  let nulls = 0;
  for (const item of rows) {
    const value = (item.row ?? item)[column];
    if (value == null) { nulls++; continue; }
    if (typeof value === 'object' && (value.kind === 'binary' || value.kind === 'lob')) continue;
    const text = String(value);
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  const values = [...counts].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).slice(0, limit).map(([value, count]) => ({ value, count }));
  return { values, nulls, truncated: counts.size > limit };
}

const dateText = text => { const value = String(text || '').trim().replace('T', ' '); return !value ? '' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value} 00:00:00` : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value) ? `${value}:00` : value; };

// Builds a rule for the existing loaded-row filter engine; empty bounds become open-ended comparisons.
export function typedFilterRule(kind, column, input) {
  if (kind === 'list') {
    if (!input.values?.length && !input.includeNull) return { error: 'Choose at least one value.' };
    return { rule: { column, op: 'in', kind: 'text', values: [...input.values], includeNull: Boolean(input.includeNull), group: 'root' } };
  }
  const from = kind === 'date' ? dateText(input.from) : String(input.from ?? '').trim(), to = kind === 'date' ? dateText(input.to) : String(input.to ?? '').trim();
  if (!from && !to) return { error: 'Enter a lower or upper bound.' };
  if (kind === 'number') {
    try { if (from) new ExactDecimal(from); if (to) new ExactDecimal(to); } catch { return { error: 'Bounds must be numbers.' }; }
    if (from && to && new ExactDecimal(from).compare(to) > 0) return { error: 'The lower bound is greater than the upper bound.' };
  }
  if (kind === 'date' && from && to && from > to) return { error: 'The start is after the end.' };
  const rule = from && to ? { op: 'between', value: from, to } : from ? { op: 'gte', value: from } : { op: 'lte', value: to };
  return { rule: { column, kind, group: 'root', ...rule } };
}
