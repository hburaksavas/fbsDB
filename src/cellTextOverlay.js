export const cellOverlayLimit = 20000;

// Places the overlay over the clipped cell, widening it to the right and flipping above when the cell is low.
export function cellOverlayPlacement(cell, viewport, { gap = 6, minWidth = 220, maxWidth = 640, maxHeight = 320 } = {}) {
  const width = Math.min(maxWidth, Math.max(minWidth, cell.width), viewport.width - gap * 2);
  const left = Math.max(gap, Math.min(cell.left, viewport.width - width - gap));
  const below = viewport.height - cell.top - gap, above = cell.bottom - gap;
  const placeAbove = below < Math.min(maxHeight, 120) && above > below;
  const height = Math.max(40, Math.min(maxHeight, placeAbove ? above : below));
  return placeAbove ? { left, width, maxHeight: height, bottom: viewport.height - cell.bottom } : { left, width, maxHeight: height, top: cell.top };
}

export function cellOverlayText(value, limit = cellOverlayLimit) {
  const text = value == null ? '' : String(value);
  return text.length > limit ? { text: text.slice(0, limit), truncated: true, length: text.length } : { text, truncated: false, length: text.length };
}
