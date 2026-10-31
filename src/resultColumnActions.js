import { ExactDecimal } from './exactDecimal.js';
import { sqlIdentifier } from './resultFeatures.js';
import { oracleTemporalText, parseOracleTemporal } from './oracleTemporal.js';

export function columnKind(column) {
  return /NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(column.type || '') ? 'number' : /DATE|TIME/i.test(column.type || '') ? 'date' : 'text';
}

export function validateColumnRule(column, op, value) {
  if (['null', 'notNull'].includes(op)) return;
  if (value === '') throw new Error('Enter a value.');
  if (columnKind(column) === 'number') {
    try { new ExactDecimal(value); } catch { throw new Error('Enter an invariant decimal, without grouping separators.'); }
  }
  if (columnKind(column) === 'date' && !parseOracleTemporal(value)) throw new Error('Use an ISO date/time: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.');
}

export function columnStatistics(rows, column, index) {
  let nulls = 0, numericCount = 0, sum = new ExactDecimal(0), min = null, max = null;
  const distinct = new Set(), numeric = columnKind(column) === 'number';
  for (const item of rows) {
    const value = item.row[index];
    if (value == null) { nulls++; continue; }
    let decimal;
    if (numeric) { try { decimal = new ExactDecimal(value); } catch { /* Non-finite/provider values are counted without numeric aggregation. */ } }
    distinct.add(decimal ? `number:${decimal.toString()}` : value?.kind === 'temporal' ? `temporal:${oracleTemporalText(value)}` : value?.kind === 'binary' ? `binary:${value.base64}` : `${typeof value}:${String(value)}`);
    if (!decimal) continue;
    numericCount++; sum = sum.add(decimal);
    if (min == null || decimal.compare(min) < 0) min = decimal;
    if (max == null || decimal.compare(max) > 0) max = decimal;
  }
  return { count: rows.length, nulls, nonNulls: rows.length - nulls, distinct: distinct.size, numericCount,
    sum: numericCount ? sum.toString() : null, average: numericCount ? sum.div(numericCount).toString() : null,
    min: min?.toString() ?? null, max: max?.toString() ?? null };
}

export function columnOrder(order, count) {
  return [...new Set([...order.filter(i => Number.isInteger(i) && i >= 0 && i < count), ...Array.from({ length: count }, (_, i) => i)])];
}

export function moveColumn(order, count, column, destination) {
  const next = columnOrder(order, count), from = next.indexOf(column);
  if (from < 0) return next;
  next.splice(from, 1);
  const at = destination === 'first' ? 0 : destination === 'last' ? next.length : Math.max(0, Math.min(next.length, from + (destination === 'left' ? -1 : 1)));
  next.splice(at, 0, column); return next;
}

export function columnSqlDraft(column, kind) {
  const identifier = sqlIdentifier(column.sourceColumn || column.name);
  if (kind === 'identifier') return identifier;
  if (kind === 'where') return `WHERE ${identifier} = :value`;
  if (kind === 'order') return `ORDER BY ${identifier} ASC`;
  const source = column.sourceTable ? [column.sourceSchema, column.sourceTable].filter(Boolean).map(sqlIdentifier).join('.') : '/* source table or query */';
  return `SELECT ${identifier}\nFROM ${source};`;
}

// A single header sort and the multi-column list share one explicit transition.
export function nextColumnSort({ sortColumn = -1, sortDirection = 'asc', sorts = [] }, column, request = {}) {
  if (typeof request === 'boolean') request = { multi: request };
  const current = sorts.find(s => s.column === column), previous = current?.direction || (sortColumn === column ? sortDirection : null);
  const direction = request.direction || (previous === 'asc' ? 'desc' : 'asc');
  if (request.clear) return { sortColumn: sortColumn === column ? -1 : sortColumn, sortDirection, sorts: sorts.filter(s => s.column !== column) };
  if (request.multi) {
    const list = sorts.length ? sorts : sortColumn >= 0 ? [{ column: sortColumn, direction: sortDirection }] : [];
    return { sortColumn: -1, sortDirection: 'asc', sorts: list.some(s => s.column === column) ? list.map(s => s.column === column ? { ...s, direction } : s) : [...list, { column, direction }] };
  }
  return { sortColumn: column, sortDirection: direction, sorts: [] };
}
