// Row numbers are the loaded result order shown in the row-number column; filters, sorts and pages never renumber them.
export function resolveResultRowJump(value, { rows = [], viewRows = rows, loadedCount = viewRows.length, frozenRows = [], pageSize = 0 } = {}) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text) || Number(text) < 1) return { error: 'Enter a row number of 1 or greater.' };
  const number = Number(text), index = number - 1;
  if (!loadedCount) return { error: 'No result rows are loaded.' };
  if (number > loadedCount) return { error: `Only ${loadedCount.toLocaleString('en-US')} rows are loaded. Fetch more rows to reach row ${number.toLocaleString('en-US')}.` };
  if (frozenRows.includes(index)) return { frozen: true, number, index, message: `Row ${number} is frozen above the grid.` };
  const position = rows.findIndex(item => item.index === index);
  if (position >= 0) return { position, number, index };
  const viewPosition = viewRows.findIndex(item => item.index === index);
  if (viewPosition >= 0 && pageSize > 0) return { page: Math.floor(viewPosition / pageSize), number, index };
  return { error: `Row ${number} is hidden by the current filter. Row numbers follow the loaded result order, not filtered positions.` };
}
