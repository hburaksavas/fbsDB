import {useEffect,useState} from 'react';
import {assignKeyTips,controlLabel,isCleanAltTap,isKeyTipTarget} from './keyAccess.js';

const targetSelector='button, [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], a[href], input[type="checkbox"]';

function collectTargets() {
  const modals = [...document.querySelectorAll('.modal-backdrop')];
  const scope = modals.length ? modals[modals.length - 1] : document.querySelector('.desktop-shell') || document.body;
  const elements = [...scope.querySelectorAll(targetSelector)].filter(element => !element.closest('.key-tips-layer') && isKeyTipTarget(element));
  elements.sort((a, b) => { const first = a.getBoundingClientRect(), second = b.getBoundingClientRect(); return Math.round(first.top / 8) - Math.round(second.top / 8) || first.left - second.left; });
  return elements.map((element, index) => ({ id: index, element, label: controlLabel(element) }));
}

// Tapping Alt alone reveals a letter on every visible control; pressing the letter activates it. Alt chords stay untouched.
export function KeyTips({enabled}) {
  const [tips, setTips] = useState(null);
  useEffect(() => {
    if (!enabled) { setTips(null); return undefined; }
    const state = { pressed: 0, interrupted: false, active: false };
    const close = () => { state.active = false; setTips(null); };
    const down = event => {
      if (event.key === 'Alt' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.shiftKey) { state.pressed = Date.now(); state.interrupted = false; return; }
      state.interrupted = true;
      if (!state.active) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      const key = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey ? event.key.toLowerCase() : '';
      const match = key && state.tips?.find(tip => tip.key === key);
      if (match) { event.preventDefault(); event.stopImmediatePropagation(); close(); match.element.focus?.({ preventScroll: true }); match.element.click(); return; }
      close();
    };
    const up = event => {
      if (event.key !== 'Alt') return;
      const tap = isCleanAltTap(state.pressed, Date.now(), state.interrupted);
      state.pressed = 0;
      if (!tap) return;
      event.preventDefault();
      if (state.active) { close(); return; }
      const targets = collectTargets();
      const assigned = assignKeyTips(targets);
      const visible = targets.filter(target => assigned.has(target.id)).map(target => ({ ...target, key: assigned.get(target.id), rect: target.element.getBoundingClientRect() }));
      if (!visible.length) return;
      state.active = true; state.tips = visible; setTips(visible);
    };
    const dismiss = () => { if (state.active) close(); };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true);
    window.addEventListener('mousedown', dismiss, true); window.addEventListener('blur', dismiss);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('mousedown', dismiss, true); window.removeEventListener('blur', dismiss); };
  }, [enabled]);
  if (!tips) return null;
  return <div className="key-tips-layer" role="status" aria-label={`Keyboard access: ${tips.length} controls. Press a letter, or Escape to cancel.`}>
    {tips.map(tip => <kbd key={tip.id} className="key-tip" style={{ left: Math.max(2, tip.rect.left + 2), top: Math.max(2, tip.rect.top + tip.rect.height - 6) }} title={tip.label}>{tip.key.toUpperCase()}</kbd>)}
  </div>;
}
