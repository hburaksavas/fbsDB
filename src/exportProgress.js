const units = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes) {
  let value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '';
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${unit === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

const elapsedLabel = ms => { const seconds = Math.floor(ms / 1000); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`; };

// Live line for a streaming export: rows, file size and transfer rate. Missing numbers are left out instead of being invented.
export function exportProgressText(message) {
  const rows = Number(message?.rowsWritten) || 0, bytes = message?.bytesWritten, elapsed = Number(message?.elapsedMs) || 0;
  const parts = [`${rows.toLocaleString('en-US')} rows`];
  const size = formatBytes(bytes);
  if (size) parts.push(size);
  if (size && elapsed >= 500) parts.push(`${formatBytes(bytes / (elapsed / 1000))}/s`);
  if (rows && elapsed >= 500) parts.push(`${Math.round(rows / (elapsed / 1000)).toLocaleString('en-US')} rows/s`);
  if (elapsed >= 1000) parts.push(elapsedLabel(elapsed));
  return parts.join(' · ');
}
