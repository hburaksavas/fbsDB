export function resultScopeItems({ options = {}, columns = [], filter = '', sortColumn = -1, sortDirection = 'asc', serverFilter }) {
  const items = [];
  if (filter) items.push({ id: 'search', text: `Search: ${filter}` });
  for (const [index, rule] of (options.filters || []).entries()) items.push({ id: `filter:${index}`, text: `${columns[rule.column]?.name || 'Column'} ${rule.op} ${['null', 'notNull'].includes(rule.op) ? '' : rule.value ?? ''}`.trim() });
  if (sortColumn >= 0) items.push({ id: 'headerSort', text: `Sort: ${columns[sortColumn]?.name || 'Column'} ${sortDirection}` });
  for (const [index, rule] of (options.sorts || []).entries()) items.push({ id: `sort:${index}`, text: `Sort: ${columns[rule.column]?.name || 'Column'} ${rule.direction}` });
  for (const [id, text] of [['markedOnly', 'Marked rows only'], ['duplicatesOnly', 'Duplicate rows only'], ['highlightedOnly', 'Highlight matches only']]) if (options[id]) items.push({ id, text });
  if (serverFilter) items.push({ id: 'server', text: `Server filter: ${serverFilter.ruleCount} rule(s)` });
  return items;
}

export function removeResultScope(options, id) {
  if (id.startsWith('filter:')) return { ...options, filters: (options.filters || []).filter((_, i) => i !== Number(id.split(':')[1])) };
  if (id.startsWith('sort:')) return { ...options, sorts: (options.sorts || []).filter((_, i) => i !== Number(id.split(':')[1])) };
  if (['markedOnly', 'duplicatesOnly', 'highlightedOnly'].includes(id)) return { ...options, [id]: false };
  return options;
}
