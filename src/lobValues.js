// Large CLOB/NCLOB/BLOB values arrive as previews: {kind:'lob', lobType, lobId, length, preview}.
// length counts characters for CLOB/NCLOB and bytes for BLOB; a BLOB preview is base64.
export const isLobPreview = value => value?.kind === 'lob';
export const lobUnit = value => value?.lobType === 'BLOB' ? 'bytes' : 'characters';
export const lobChunkSize = value => value?.lobType === 'BLOB' ? 1_048_576 : 524_288;

export function base64Bytes(base64) {
  const text = atob(base64 || ''), bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
export function bytesBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32_768) text += String.fromCharCode(...bytes.subarray(i, i + 32_768));
  return btoa(text);
}
export function lobPreviewLength(value) { return value?.lobType === 'BLOB' ? base64Bytes(value.preview).length : String(value?.preview ?? '').length; }

const count = number => Number(number || 0).toLocaleString('en-US');
export function lobDisplayText(value) {
  if (value.lobType === 'BLOB') return `${value.lobType} · ${count(value.length)} bytes · not loaded`;
  const first = String(value.preview ?? '').slice(0, 200).replace(/\s+/g, ' ');
  return `${first}… (${value.lobType}, ${count(value.length)} characters)`;
}
// Copied text says plainly that it is a preview instead of passing a cut value off as the whole one.
export function lobCopyText(value) {
  const note = `[${value.lobType}: first ${count(lobPreviewLength(value))} of ${count(value.length)} ${lobUnit(value)}; open the cell and load the full value to copy it]`;
  return value.lobType === 'BLOB' ? note : `${value.preview ?? ''}${note}`;
}

// Accumulates chunks after the preview. Returns the full value once every unit is loaded.
export function createLobBuffer(value) {
  const binary = value.lobType === 'BLOB', parts = [binary ? base64Bytes(value.preview) : String(value.preview ?? '')];
  let loaded = lobPreviewLength(value);
  return {
    get loaded() { return loaded; },
    get complete() { return loaded >= value.length; },
    next(size = lobChunkSize(value)) { return { offset: loaded, count: Math.max(1, Math.min(size, value.length - loaded)) }; },
    add(chunk) {
      if (chunk.offset !== loaded) throw new Error('The value changed position while loading. Close the viewer and try again.');
      if (chunk.length !== value.length) throw new Error('The stored size of this value no longer matches the result. Run the query again.');
      if (!chunk.count && loaded < value.length) throw new Error('Oracle returned no more data before the end of the value.');
      parts.push(binary ? base64Bytes(chunk.base64) : String(chunk.text ?? ''));
      loaded += chunk.count;
    },
    text() { return binary ? null : parts.join(''); },
    bytes() { const all = new Uint8Array(loaded); let at = 0; for (const part of parts) { all.set(part, at); at += part.length; } return all; },
    fullValue() {
      if (loaded < value.length) return null;
      if (!binary) return parts.join('');
      const bytes = this.bytes();
      return { kind: 'binary', base64: bytesBase64(bytes), byteLength: bytes.length };
    },
  };
}

// Replaces every preview of lobId with its loaded value; returns the same rows when none matched.
export function replaceLobInRows(rows, lobId, full) {
  let changed = false;
  const next = (rows || []).map(row => { if (!row.some(cell => cell?.kind === 'lob' && cell.lobId === lobId)) return row; changed = true; return row.map(cell => cell?.kind === 'lob' && cell.lobId === lobId ? full : cell); });
  return changed ? next : rows;
}
