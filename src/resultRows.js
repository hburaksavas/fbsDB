import { compareOracleTemporal } from './oracleTemporal.js';
import { foldResultText,compareResultNumbers } from './resultLocale.js';
export function getVisibleResultRows(rows, columns, filter = "", sortColumn = -1, sortDirection = "asc", rowOrder = [], options = {}) {
  const search = foldResultText(filter.trim(), options.sortLocale, options.caseSensitive);
  const visibleRows = (rows ?? []).map((row, index) => ({ row, index })).filter(({ row }) => !search || row.some((cell) => foldResultText(cell??"NULL",options.sortLocale,options.caseSensitive).includes(search)));
  if (sortColumn >= 0) {
    const type = columns?.[sortColumn]?.type ?? "";
    const isNumeric = /NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(type);
    const isDate = /DATE|TIME/i.test(type);
    visibleRows.sort((a, b) => {
      const left = a.row[sortColumn], right = b.row[sortColumn];
      if (left == null || right == null) return left == null ? right == null ? a.index - b.index : (options.nulls==='first'?-1:1) : (options.nulls==='first'?1:-1);
      let comparison = 0;
      const exact=isNumeric?compareResultNumbers(left,right):isDate?compareOracleTemporal(left,right):null;
      if (exact!==null) comparison = exact;
      else if (isDate && Number.isFinite(Date.parse(left)) && Number.isFinite(Date.parse(right))) comparison = Date.parse(left) - Date.parse(right);
      else comparison = String(left).localeCompare(String(right), options.columnFormats?.[sortColumn]?.sortLocale||options.sortLocale||undefined, { numeric:(options.columnFormats?.[sortColumn]?.naturalSort??options.naturalSort)!==false,sensitivity:options.caseSensitive?"variant":"base" });
      return comparison ? comparison * (sortDirection === "asc" ? 1 : -1) : a.index - b.index;
    });
  }
  if (sortColumn < 0 && rowOrder.length) {
    const positions = new Map(rowOrder.map((id, position) => [id, position]));
    visibleRows.sort((a, b) => (positions.get(a.index) ?? rowOrder.length + a.index) - (positions.get(b.index) ?? rowOrder.length + b.index));
  }
  return visibleRows;
}

export function moveResultRow(order, source, target, after = false) {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = order.filter(id => id !== source);
  next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source);
  return next;
}
