export const RESULT_ROW_HEIGHT = 26;
export function getResultWindow(count, scrollTop, height, rowHeight = RESULT_ROW_HEIGHT) {
  const visible = Math.ceil(Math.max(0, height) / rowHeight);
  const first = Math.min(Math.max(0, count - visible), Math.max(0, Math.floor((scrollTop - 39) / rowHeight)));
  const start = Math.max(0, first - 8), end = Math.min(count, first + visible + 9);
  return { start, end, top: start * rowHeight, bottom: (count - end) * rowHeight };
}
