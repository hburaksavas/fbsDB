export const columnWidthLimits = { min: 70, max: 700 };
const clamp = width => Math.max(columnWidthLimits.min, Math.min(columnWidthLimits.max, Math.round(width)));

// widths maps every visible column index to its current width.
export function equalizeColumnWidths(indices, widths) {
  if (indices.length < 2) return { error: 'Select cells in at least two columns.' };
  const width = clamp(indices.reduce((sum, i) => sum + widths[i], 0) / indices.length);
  return { sizes: Object.fromEntries(indices.map(i => [i, width])) };
}

export function distributeColumnSpace(indices, widths, available) {
  if (!indices.length) return { error: 'Select cells in at least one column.' };
  const used = Object.values(widths).reduce((sum, width) => sum + width, 0), extra = Math.floor(available - used);
  if (extra < indices.length) return { error: 'The grid has no remaining horizontal space to distribute.' };
  const share = Math.floor(extra / indices.length), remainder = extra - share * indices.length;
  return { sizes: Object.fromEntries(indices.map((i, position) => [i, clamp(widths[i] + share + (position < remainder ? 1 : 0))])) };
}
