export const budgetActions = ['stop', 'warn'];

// Samples rows instead of measuring all of them: an estimate of what the grid holds in browser memory (UTF-16 text plus overhead).
export function estimateResultBytes(rows, columnCount = 0, sample = 200) {
  const count = rows?.length || 0;
  if (!count) return 0;
  const step = Math.max(1, Math.floor(count / sample));
  let total = 0, measured = 0;
  for (let i = 0; i < count; i += step) {
    const row = rows[i];
    let bytes = 48 + 16 * (row?.length || columnCount);
    for (const value of row || []) bytes += value == null ? 0 : typeof value === 'object' ? (value.kind === 'binary' ? value.byteLength || 0 : 2 * String(value.value ?? '').length + 64) : 2 * String(value).length;
    total += bytes; measured++;
  }
  return Math.round(total / measured * count);
}

const mb = bytes => (bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1);

// 0 disables a limit. "stop" halts automatic loading; "warn" only reports and keeps loading.
export function evaluateBudget({ rows = 0, bytes = 0 }, { maxRows = 0, maxMemoryMb = 0, action = 'stop' } = {}) {
  const overRows = maxRows > 0 && rows >= maxRows, overMemory = maxMemoryMb > 0 && bytes >= maxMemoryMb * 1048576;
  if (!overRows && !overMemory) return { exceeded: null, stop: false, message: '' };
  const reason = overRows ? `the ${maxRows.toLocaleString('en-US')} row limit` : `the ${maxMemoryMb} MB client memory estimate`;
  const detail = `${rows.toLocaleString('en-US')} rows loaded (about ${mb(bytes)} MB in this window).`;
  return {
    exceeded: overRows ? 'rows' : 'memory', stop: action !== 'warn',
    message: action === 'warn'
      ? `Passed ${reason}. ${detail} Loading continues; this is a client-side warning only.`
      : `Stopped loading at ${reason}. ${detail} More rows may exist on the server. This limit protects this window; it does not limit database resources.`,
  };
}
