// One place for short screen-reader announcements that no visible notification carries. A single pair of hidden live regions
// (polite for progress, assertive for problems) reads them; repeats of the same text are still announced.
const listeners = new Set();
let current = { polite: '', assertive: '', tick: 0 };

export function announce(message, politeness = 'polite') {
  const text = String(message || '').trim();
  if (!text) return;
  const key = politeness === 'assertive' ? 'assertive' : 'polite';
  current = { ...current, [key]: text, tick: current.tick + 1 };
  listeners.forEach(listener => listener());
}

export const subscribeAnnouncements = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const announcementSnapshot = () => current;

// Text for the grid events worth announcing; returns '' when nothing changed.
export function gridAnnouncement(previous, next) {
  if (previous.editMode !== next.editMode) return next.editMode ? 'Edit mode on. Changes stay local until you apply them.' : 'Edit mode off.';
  if (previous.pending !== next.pending) return next.pending === 0 ? 'No pending changes.' : `${next.pending} pending change${next.pending === 1 ? '' : 's'}.`;
  if (previous.invalid !== next.invalid && next.invalid > 0) return `${next.invalid} staged value${next.invalid === 1 ? '' : 's'} would be rejected by Oracle.`;
  return '';
}

export function resultAnnouncement({ rows, elapsedMs, hasMore }) {
  if (rows == null) return '';
  const time = Number.isFinite(elapsedMs) ? ` in ${elapsedMs} ms` : '';
  return `${rows.toLocaleString('en-US')} row${rows === 1 ? '' : 's'} returned${time}${hasMore ? '; more rows are available' : ''}.`;
}
