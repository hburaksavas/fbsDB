/** @typedef {{profile: string, startedAt: number, sql?: string}} HistoryEntry */
/** @param {string | undefined} profile @param {string} [excludedProfiles] */
export function historyAllowed(profile, excludedProfiles = '') {
  return !String(excludedProfiles).split(',').map(value=>value.trim().toLowerCase()).filter(Boolean).includes(String(profile || '').toLowerCase());
}
/**
 * @template {HistoryEntry} T
 * @param {T[]} entries
 * @param {{limit?: number, days?: number, excludedProfiles?: string}} [options]
 * @param {number} [now]
 * @returns {T[]}
 */
export function retainHistory(entries, {limit=50, days=0, excludedProfiles=''}={}, now=Date.now()) {
  return entries.filter(entry=>Number.isFinite(entry.startedAt) && historyAllowed(entry.profile,excludedProfiles) && (!days || entry.startedAt >= now-days*86400000)).slice(0,Math.max(0,limit));
}
