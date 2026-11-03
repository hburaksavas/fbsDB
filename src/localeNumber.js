// Separators of a locale, taken from the platform formatter so they match what the grid displays.
export function numberSeparators(locale) {
  try {
    const parts = new Intl.NumberFormat(locale || undefined).formatToParts(12345.6);
    return { decimal: parts.find(part => part.type === 'decimal')?.value || '.', group: parts.find(part => part.type === 'group')?.value || ',' };
  } catch { return { decimal: '.', group: ',' }; }
}

const plain = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

// Reads a number typed the way the user's locale writes it ("1.234,56" -> "1234.56"). Plain database form (dot decimal, no grouping) is
// always accepted. Ambiguous or malformed input is rejected with a reason, never guessed.
export function parseLocaleNumber(text, separators) {
  const raw = String(text ?? '').trim().replace(/[   ]/g, '');
  if (raw === '') return { error: 'Enter a number.' };
  const { decimal, group } = separators;
  if (plain.test(raw) && !(decimal !== '.' && group === '.' && /^[-+]?\d{1,3}\.\d{3}$/.test(raw))) return { value: raw.startsWith('+') ? raw.slice(1) : raw, converted: false };
  const sign = /^[-+]/.test(raw) ? raw[0] : '', body = raw.replace(/^[-+]/, '');
  if (/[^\d.,eE+-]/.test(body)) return { error: 'This is not a number.' };
  const decimalAt = body.lastIndexOf(decimal);
  const whole = decimalAt >= 0 ? body.slice(0, decimalAt) : body, fraction = decimalAt >= 0 ? body.slice(decimalAt + decimal.length) : '';
  if (fraction.includes(decimal) || fraction.includes(group) || /[^\d]/.test(fraction)) return { error: `Use at most one ${decimal === ',' ? 'decimal comma' : 'decimal point'}.` };
  if (whole.includes(decimal)) return { error: `Use at most one ${decimal === ',' ? 'decimal comma' : 'decimal point'}.` };
  const groups = whole.split(group);
  if (groups.length > 1 && (groups[0].length > 3 || groups[0].length === 0 || groups.slice(1).some(chunk => chunk.length !== 3))) return { error: `Thousands separators (${group}) must group digits in threes.` };
  const digits = groups.join('');
  if (!/^\d+$/.test(digits)) return { error: 'This is not a number.' };
  const value = `${sign === '-' ? '-' : ''}${digits}${fraction ? `.${fraction}` : ''}`;
  return { value, converted: true, note: `Read “${text.trim()}” as ${value}` };
}
