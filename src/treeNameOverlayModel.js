export const treeOverlayContainers = '.schema-tree, .workspace-tree, .connection-tree';
const rowSelector = 'button, [role="treeitem"], summary';

export function isClipped(element) {
  return Boolean(element && element.scrollWidth > element.clientWidth + 1 && element.textContent.trim());
}

// Finds the clipped label inside a tree row; nested rows are ignored so a parent never shows a child's name.
export function clippedTreeLabel(target) {
  const row = target?.closest?.(rowSelector);
  if (!row || !row.closest(treeOverlayContainers)) return null;
  const candidates = [...row.querySelectorAll('span, strong, b')].filter(element => element.closest(rowSelector) === row && !element.querySelector('span, strong, b'));
  return [...candidates, row].find(isClipped) || null;
}

// The overlay starts exactly at the label and grows to the right; long names wrap at the viewport edge.
export function treeOverlayRect(label, scrollWidth, viewportWidth, gap = 6) {
  const left = Math.max(gap, label.left), maxWidth = Math.max(80, viewportWidth - left - gap);
  return { left, top: label.top, minHeight: label.height, width: Math.min(Math.ceil(scrollWidth) + 2, maxWidth), wraps: scrollWidth + 2 > maxWidth };
}
