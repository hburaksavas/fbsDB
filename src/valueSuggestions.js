// Suggestions come only from the rows loaded in this result (never the whole table), most frequent first; free entry is always kept.
export const suggestionLimit = 30;

export function columnSuggestions(rows, col, scalar, { limit = suggestionLimit, exclude = null } = {}) {
  const counts = new Map();
  for (const item of rows) {
    const value = scalar(item.row[col]);
    if (value == null || value === '' || value === undefined) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const ordered = [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return { values: ordered.filter(([value]) => value !== exclude).slice(0, limit).map(([value]) => value), distinct: ordered.length, loaded: rows.length };
}

export const suggestionScope = ({ values, distinct, loaded }) => `Suggestions: ${values.length} of ${distinct} distinct value${distinct === 1 ? '' : 's'} in the ${loaded.toLocaleString('en-US')} loaded row${loaded === 1 ? '' : 's'}. Any other text can still be typed.`;

// A date or time part replaced inside a stored timestamp text ("2026-11-02 10:30:00"), leaving the other part and the fraction untouched.
export function replaceTemporalPart(text, part, replacement) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(\.\d+)?)?$/.exec(String(text ?? '').trim());
  if (!match) return { error: 'The value is not a plain date or timestamp.' };
  const date = match[1], time = match[2] || '00:00:00', fraction = match[3] || '';
  if (part === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(replacement) || Number.isNaN(Date.parse(`${replacement}T00:00:00Z`)) || new Date(`${replacement}T00:00:00Z`).toISOString().slice(0, 10) !== replacement) return { error: 'Enter a valid date as YYYY-MM-DD.' };
    return { value: `${replacement} ${time}${fraction}` };
  }
  if (part === 'time') {
    const normal = /^\d{2}:\d{2}$/.test(replacement) ? `${replacement}:00` : replacement;
    const parts = /^(\d{2}):(\d{2}):(\d{2})$/.exec(normal);
    if (!parts || Number(parts[1]) > 23 || Number(parts[2]) > 59 || Number(parts[3]) > 59) return { error: 'Enter a valid time as HH:MM or HH:MM:SS.' };
    return { value: `${date} ${normal}${fraction}` };
  }
  return { error: 'Choose the date or the time.' };
}
