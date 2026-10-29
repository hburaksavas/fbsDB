import { formatOracleTemporal,compareOracleTemporal,oracleTemporalText,oracleTemporalSqlLiteral } from './oracleTemporal.js';
import { foldResultText,compareResultNumbers } from './resultLocale.js';
import { formatExact,ExactDecimal } from './exactDecimal.js';
import { filterTreeMatches, visibleWhitespace } from './resultAdvanced.js';
export function isExpandableResultValue(column,value){return /\b(CLOB|NCLOB|BLOB|BFILE|LONG(?:\s+RAW)?|XMLTYPE)\b/i.test(String(column?.type||''))||['binary','blob','clob'].includes(String(value?.kind||'').toLowerCase())}
export function matchesCondition(value, rule) {
  if (rule.op === 'null') return value == null;
  if (rule.op === 'notNull') return value != null;
  if (value == null) return false;
  const normalize=v=>foldResultText(v,rule.locale,rule.caseSensitive);
  const text = normalize(value), query = normalize(rule.value??'');
  if(rule.op==='regex'){try{return new RegExp(String(rule.value||''),rule.caseSensitive?'':'i').test(String(value))}catch{return false}}
  const numeric = rule.kind === 'number', date = rule.kind === 'date';
  const comparable = v => date ? Date.parse(v) : normalize(v);
  if(date&&['equals','notEquals','gt','gte','lt','lte','between'].includes(rule.op)){const comparison=compareOracleTemporal(value,rule.value);if(comparison===null)return false;const upper=rule.op==='between'?compareOracleTemporal(value,rule.to):null;return ({equals:comparison===0,notEquals:comparison!==0,gt:comparison>0,gte:comparison>=0,lt:comparison<0,lte:comparison<=0,between:comparison>=0&&upper!==null&&upper<=0})[rule.op];}
  const a = comparable(value), b = comparable(rule.value);
  if(numeric&&['equals','notEquals','gt','gte','lt','lte','between'].includes(rule.op)){try{const c=new ExactDecimal(value).compare(rule.value);return ({equals:c===0,notEquals:c!==0,gt:c>0,gte:c>=0,lt:c<0,lte:c<=0,between:rule.op==='between'&&c>=0&&new ExactDecimal(value).compare(rule.to)<=0})[rule.op]}catch{return false}}
  switch (rule.op) {
    case 'equals': return a === b;
    case 'notEquals': return a !== b;
    case 'starts': return text.startsWith(query);
    case 'ends': return text.endsWith(query);
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'between': return a >= b && a <= comparable(rule.to);
    default: return text.includes(query);
  }
}
export function applyResultFeatures(indexedRows, columns, options = {}) {
  let rows = indexedRows.filter(({ row, index }) => (!options.markedOnly || (options.marks || []).includes(index)) && (!options.highlightedOnly || (options.rules||[]).some(rule=>matchesCondition(row[rule.column],{locale:options.sortLocale,...rule}))) && filterTreeMatches(row,options));
  if (options.sorts?.length) rows = [...rows].sort((a, b) => {
    for (const sort of options.sorts) {
      const x = a.row[sort.column], y = b.row[sort.column];
      if (x == null || y == null) { if (x !== y) return (x == null ? 1 : -1) * ((sort.nulls||options.nulls)==='first'?-1:1); continue; }
      const type = columns[sort.column]?.type || '';
      const numeric = /NUMBER|INTEGER|DECIMAL|FLOAT|DOUBLE|REAL/i.test(type);
      const date = /DATE|TIME/i.test(type);
      const exact=numeric?compareResultNumbers(x,y):date?compareOracleTemporal(x,y):null;
      const comparison = exact!==null ? exact : date && Number.isFinite(Date.parse(x)) && Number.isFinite(Date.parse(y)) ? Date.parse(x) - Date.parse(y) : String(x).localeCompare(String(y), options.columnFormats?.[sort.column]?.sortLocale||options.sortLocale||undefined, { numeric: (options.columnFormats?.[sort.column]?.naturalSort??options.naturalSort)!==false, sensitivity: options.caseSensitive?'variant':'base' });
      if (comparison) return comparison * (sort.direction === 'desc' ? -1 : 1);
    }
    return a.index - b.index;
  });
  if (options.duplicateColumns?.length) {
    const key = row => JSON.stringify(options.duplicateColumns.map(i => row[i] ?? null));
    const counts = new Map(); for (const { row } of rows) counts.set(key(row), (counts.get(key(row)) || 0) + 1);
    rows = rows.map(item => ({ ...item, duplicate: counts.get(key(item.row)) > 1 }));
    if (options.duplicatesOnly) rows = rows.filter(item => item.duplicate);
  }
  return rows;
}
export function uniqueResultValues(rows, column) {
  const values = new Map();
  for (const { row } of rows) { const key = JSON.stringify(row[column] ?? null); const existing = values.get(key); if (existing) existing.count++; else values.set(key, { value: row[column] ?? null, count: 1 }); }
  return [...values.values()].sort((a, b) => b.count - a.count);
}
export function formatResultValue(value, type, options = {}) {
  if(value?.kind==='binary')return `BLOB · ${value.byteLength} bytes`;
  if (value == null) return options.nullLabel??'NULL';
  if (value === '') return options.emptyLabel??'EMPTY';
  if (/NUMBER|INTEGER|DECIMAL|FLOAT|DOUBLE|REAL/i.test(type || '') && Number.isFinite(Number(value)) && (options.decimals !== '' && options.decimals != null || options.grouping)) {
    try{return formatExact(value,options)}catch{return String(value)}
  }
  if(value?.kind==='temporal'||/DATE|TIME/i.test(type||'')){const formatted=formatOracleTemporal(value,type,options);if(formatted!==null)return formatted;}
  return options.showWhitespace ? visibleWhitespace(value) : String(value);
}
export const sqlIdentifier = text => `"${String(text).replaceAll('"', '""')}"`;
export function sqlLiteral(value) { return value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`; }
export function selectionStatistics(values) {
 const numbers=values.filter(v=>typeof v==='number'&&Number.isFinite(v)||v?.exactNumber!=null);
 const exact=numbers.some(v=>v?.exactNumber!=null),decimals=numbers.map(v=>new ExactDecimal(v?.exactNumber??v));
 const sum=decimals.reduce((a,b)=>a.add(b),new ExactDecimal(0)),convert=v=>v==null?null:exact?v.toString():Number(v.toString());
 return {count:values.length,numericCount:numbers.length,sum:convert(sum),average:decimals.length?convert(sum.div(decimals.length)):null,min:decimals.length?convert(decimals.reduce((a,b)=>a.compare(b)<=0?a:b)):null,max:decimals.length?convert(decimals.reduce((a,b)=>a.compare(b)>=0?a:b)):null};
}
export function copyResultData(rows, columns, format = 'tsv', headers = false) {
  rows=rows.map(row=>row.map(value=>value?.kind==='binary'?value.base64:value?.kind==='temporal'?oracleTemporalText(value):value));
  const quote = (value, separator) => { const text = value == null ? 'NULL' : String(value); return text.includes(separator) || /[\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  if (format === 'json') {
    const used = new Set(); const names = columns.map((column, i) => { let name = column.name || `COLUMN_${i + 1}`; while (used.has(name)) name += `_${i + 1}`; used.add(name); return name; });
    return JSON.stringify(rows.map(row => Object.fromEntries(names.map((name, i) => [name, row[i] ?? null]))), null, 2);
  }
  if (format === 'in') return `IN (${[...new Set(rows.flat().filter(value => value != null).map(sqlLiteral))].join(', ')})`;
  if (format === 'vertical') return rows.map(row => columns.map((column, i) => `${column.name} = ${row[i] == null ? 'NULL' : row[i]}`).join('\r\n')).join('\r\n\r\n');
  const separator = format === 'csv' ? ',' : '\t';
  return [...(headers ? [columns.map(column => column.name)] : []), ...rows].map(row => row.map(value => quote(value, separator)).join(separator)).join('\r\n');
}
export function formatStructuredValue(value, format) {
  const text = String(value ?? 'NULL');
  if (format === 'json') return JSON.stringify(JSON.parse(text), null, 2);
  if (format === 'xml') {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Invalid XML');
    let depth = 0;
    return new XMLSerializer().serializeToString(xml).replace(/>\s*</g, '>\n<').split('\n').map(line => { if (/^<\//.test(line)) depth--; const formatted = '  '.repeat(Math.max(0, depth)) + line; if (/^<[^!?/][^>]*>/.test(line) && !/<\/|\/>/.test(line)) depth++; return formatted; }).join('\n');
  }
  return text;
}
