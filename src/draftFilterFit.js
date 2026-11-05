import { rowMatchesValueFilters } from './resultFeatures.js';
import { rowMatchesSearch } from './resultRows.js';

// Filters run on the stored values, so an edited row stays where it is even when its edited values would no longer match. This says so.
export const rowLeavesFilters = (row, search, options) => !rowMatchesSearch(row, search, options) || !rowMatchesValueFilters(row, options);

export function outsideFilterNote(count) {
  if (!count) return '';
  const rows = count === 1 ? '1 edited row no longer matches' : `${count} edited rows no longer match`;
  return `${rows} the current filter. ${count === 1 ? 'It stays' : 'They stay'} visible so you can review the change; the filter still uses the stored values until the result is read again.`;
}
