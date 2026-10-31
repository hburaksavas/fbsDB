export const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]';
export function visibleFocusTargets(root) {
  return [...(root?.querySelectorAll(focusableSelector) || [])].filter(node => node.getClientRects().length && !node.closest('[inert]'));
}
export function restoreFocus(previous, dismissedRoot) {
  queueMicrotask(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected && !dismissedRoot?.contains(active)) return;
    if (previous?.isConnected && !previous.disabled && previous.getClientRects().length) previous.focus({ preventScroll: true });
    else document.querySelector('.monaco-editor textarea, .file-tab.active [role="tab"], [aria-label="Search workbench"]')?.focus({ preventScroll: true });
  });
}
