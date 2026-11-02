export const keyTipLimit = 36;
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Assigns one unique letter/digit per control, in reading order. A control prefers the first unused letter of its own name,
// so "Run" gets R and "Explain plan" gets E; leftovers take any free character. Controls beyond the limit get no tip.
export function assignKeyTips(controls, reserved = []) {
  const used = new Set(reserved.map(key => String(key).toLowerCase()));
  const tips = new Map();
  const ordered = controls.filter(control => control && control.id != null).slice(0, keyTipLimit * 2);
  const take = key => { if (!key || used.has(key) || !alphabet.includes(key)) return false; used.add(key); return true; };
  const pending = [];
  for (const control of ordered) {
    if (tips.size >= keyTipLimit) break;
    const letters = String(control.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = [...letters].find(character => take(character));
    if (key) tips.set(control.id, key); else pending.push(control);
  }
  for (const control of pending) {
    if (tips.size >= keyTipLimit) break;
    const key = [...alphabet].find(character => take(character));
    if (key) tips.set(control.id, key);
  }
  return tips;
}

// A tap is Alt pressed and released alone, quickly; Alt+key chords and long holds never reveal tips.
export function isCleanAltTap(pressedAt, releasedAt, interrupted, limit = 600) {
  return !interrupted && releasedAt - pressedAt >= 0 && releasedAt - pressedAt <= limit;
}

export function controlLabel(element) {
  const text = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '';
  return text.replace(/\s+/g, ' ').trim();
}

export function isKeyTipTarget(element, view = globalThis) {
  if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true' || element.getAttribute('aria-hidden') === 'true') return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8 || rect.bottom < 0 || rect.right < 0 || rect.top > view.innerHeight || rect.left > view.innerWidth) return false;
  const style = view.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
}
