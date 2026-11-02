export const binaryChunk = 4096, binaryRowWidth = 16;
const hex = byte => byte.toString(16).padStart(2, '0').toUpperCase();
// Printable ASCII only; every other byte is a dot so both panes keep one column per byte.
export const byteChar = byte => byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.';

export function binaryRows(bytes, offset = 0, length = binaryChunk) {
  const rows = [], end = Math.min(bytes.length, offset + length);
  for (let start = offset; start < end; start += binaryRowWidth) {
    const cells = [];
    for (let at = start; at < Math.min(end, start + binaryRowWidth); at++) cells.push({ at, hex: hex(bytes[at]), char: byteChar(bytes[at]) });
    rows.push({ offset: start, label: start.toString(16).padStart(8, '0').toUpperCase(), cells });
  }
  return rows;
}

export function byteRange(anchor, focus) {
  if (anchor == null || focus == null) return null;
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}

export function describeByteRange(bytes, range) {
  if (!range) return null;
  const slice = bytes.slice(range.start, range.end + 1);
  return { length: slice.length, label: `0x${range.start.toString(16).toUpperCase()}–0x${range.end.toString(16).toUpperCase()} · ${slice.length} byte${slice.length === 1 ? '' : 's'}`, hex: [...slice].map(hex).join(' ') };
}
