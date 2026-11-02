export const shortcutCoachStorageKey = 'fbsdb.shortcutCoach';
export const shortcutCoachLimit = 3;
const shortcutPattern = /^(?:(?:Ctrl|Alt|Shift|Meta|Cmd)\+)+(?:[A-Z0-9]|F\d{1,2}|Enter|Home|End|PageUp|PageDown|(?:Arrow)?(?:Left|Right|Up|Down)|Space|Tab|\/|\[|\]|[`=-])$/i;

export function isShortcutText(text) { return shortcutPattern.test(String(text || '').trim()); }

function read(storage) {
  try { const value = JSON.parse(storage?.getItem(shortcutCoachStorageKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
function write(storage, state) { try { storage?.setItem(shortcutCoachStorageKey, JSON.stringify(state)); } catch { /* hints are best effort */ } }

// Returns a hint for a pointer/menu invocation and records that it was shown; keyboard use never coaches.
export function nextShortcutHint(storage, { id, label, shortcut, enabled = true }) {
  if (!enabled || !id || !isShortcutText(shortcut)) return null;
  const state = read(storage), entry = state[id] || { shown: 0, dismissed: false };
  if (entry.dismissed || entry.shown >= shortcutCoachLimit) return null;
  state[id] = { shown: entry.shown + 1, dismissed: false };
  write(storage, Object.fromEntries(Object.entries(state).slice(-300)));
  return { id, message: `${label}: ${shortcut.trim()}` };
}

export function dismissShortcutHint(storage, id) {
  const state = read(storage); state[id] = { shown: state[id]?.shown || 0, dismissed: true }; write(storage, state);
}

export function resetShortcutHints(storage) { try { storage?.removeItem(shortcutCoachStorageKey); } catch { /* nothing to reset */ } }
