import { formatElapsed } from './postExecution.js';

const limitPerTab = 500;

// Statements are matched by normalized text, so an edited statement drops its summary instead of showing stale numbers.
export function statementKey(sql) {
  return String(sql || '').replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').replace(/[\s;/]+$/, '').trim();
}

export function summaryLabel(summary) {
  if (!summary) return '';
  const time = summary.elapsedMs < 1000 ? `${Math.round(summary.elapsedMs)} ms` : formatElapsed(summary.elapsedMs);
  if (!summary.ok) return `  ✗ failed · ${time}`;
  const rows = summary.rowsAffected != null ? `${summary.rowsAffected.toLocaleString('en-US')} row${summary.rowsAffected === 1 ? '' : 's'} affected` : summary.rows != null ? `${summary.rows.toLocaleString('en-US')} row${summary.rows === 1 ? '' : 's'}${summary.hasMore ? '+' : ''}` : 'done';
  return `  ✓ ${time} · ${rows}`;
}

export function summaryHover(summary) {
  if (!summary) return '';
  const lines = [summary.ok ? 'Latest execution succeeded' : `Latest execution failed${summary.message ? `: ${summary.message}` : ''}`];
  if (summary.profile) lines.push(`Connection: ${summary.profile}`);
  if (summary.executedAt) lines.push(`Executed: ${new Date(summary.executedAt).toLocaleString()}`);
  if (summary.ok && summary.hasMore) lines.push('More rows are available than were fetched.');
  lines.push('Click the summary to open the Results tab. It reflects this exact statement text only.');
  return lines.join('\n\n');
}

export function createSummaryStore() {
  const tabs = new Map();
  return {
    record(tabId, sql, summary) {
      const key = statementKey(sql);
      if (!key) return;
      const entries = tabs.get(tabId) || new Map();
      entries.delete(key); entries.set(key, summary);
      while (entries.size > limitPerTab) entries.delete(entries.keys().next().value);
      tabs.set(tabId, entries);
    },
    get: (tabId, sql) => tabs.get(tabId)?.get(statementKey(sql)) || null,
    forget(tabId) { tabs.delete(tabId); },
    size: tabId => tabs.get(tabId)?.size || 0,
  };
}
