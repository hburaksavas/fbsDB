const plural = (count, word) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

// Describes exactly what a copy will contain; it never widens the selection to unfetched rows.
export function copyScopeDescription(summary, { format = 'tsv', headers = false, hasMore = false, pages = 1 } = {}) {
  if (!summary?.cells) return null;
  const size = `${plural(summary.rows, 'row')} × ${plural(summary.columns, 'column')} · ${plural(summary.cells, 'cell')}`;
  const header = format === 'json' ? 'Column names become JSON keys'
    : format === 'vertical' ? 'Each value is prefixed by its column name'
    : format === 'in' ? 'Values only, no column names'
    : headers ? 'Header row included' : 'No header row';
  const notes = [];
  if (summary.scope === 'loaded rows') notes.push(`All ${plural(summary.rows, 'loaded row')} in this view`);
  else { notes.push('Selected cells on the current page'); if (pages > 1) notes.push('other pages are not included'); }
  if (hasMore) notes.push('rows not yet fetched are not included');
  return { size, header, scope: notes.join('; '), text: `${size}. ${header}. ${notes.join('; ')}.` };
}
