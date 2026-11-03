// Wording for the confirmation shown before grid drafts are sent to Oracle: what will change, where, and how risky the target is.
const plural = (count, word) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

export function confirmSummary({ statements, target = null, excludedCount = 0 }) {
  const kinds = { update: 0, insert: 0, delete: 0 };
  let rows = 0;
  for (const statement of statements) { kinds[statement.kind] = (kinds[statement.kind] || 0) + 1; rows += statement.expectRows ?? 1; }
  const parts = [kinds.update && plural(kinds.update, 'update'), kinds.insert && plural(kinds.insert, 'insert'), kinds.delete && plural(kinds.delete, 'delete')].filter(Boolean);
  const environment = String(target?.environment || '').toUpperCase();
  const profile = target?.profileName || '';
  const isProd = environment === 'PROD';
  const where = [profile, environment && environment !== 'UNKNOWN' ? environment : ''].filter(Boolean).join(' · ');
  return {
    headline: `${plural(statements.length, 'statement')} · about ${plural(rows, 'row')} affected (${parts.join(', ')})`,
    buttonLabel: `Apply ${plural(statements.length, 'change')}`,
    target: where || 'Connection not named',
    isProd,
    unknownTarget: !where,
    warning: isProd ? `This is a PRODUCTION connection${profile ? ` (${profile})` : ''}. Check the target and the SQL before applying.` : '',
    note: excludedCount > 0 ? `${plural(excludedCount, 'pending change')} stay${excludedCount === 1 ? 's' : ''} a draft.` : ''
  };
}

export const applyRunningDetail = count => `Sending ${plural(count, 'statement')} in this tab's session. Nothing is committed.`;
