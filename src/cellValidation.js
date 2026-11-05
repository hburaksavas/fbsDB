const encoder = new TextEncoder();
const datetime = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;
const zonedDatetime = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export const byteLength = text => encoder.encode(String(text ?? '')).length;

// Character and byte counts against the column limit, using the column's own length semantics (bytes unless the column says CHAR).
export function lengthMeter(text, column) {
  const chars = [...String(text ?? '')].length, bytes = byteLength(text), limit = Number(column?.size) || null;
  const unit = String(column?.lengthSemantics || '').toUpperCase() === 'CHAR' ? 'chars' : 'bytes';
  const used = unit === 'chars' ? chars : bytes;
  return { chars, bytes, limit, unit, used, over: limit != null && used > limit };
}

// Local checks only: they catch what Oracle would reject for type, size, scale and NOT NULL before anything is sent. Oracle stays the authority.
export function validateCell(column, draft) {
  const name = column?.name || 'Column', type = String(column?.type || '').toUpperCase();
  if (draft.isNull) return column?.nullable === false ? `${name} does not allow NULL.` : null;
  const text = String(draft.value ?? '');
  if (/NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT/.test(type)) {
    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(text.trim())) return `${name} needs a number.`;
    const precision = Number(column?.precision), scale = Number(column?.scale);
    if (Number.isFinite(precision) && precision > 0 && !/e/i.test(text)) {
      const [whole, fraction = ''] = text.trim().replace(/^[-+]/, '').split('.');
      const integerDigits = whole.replace(/^0+/, '').length, allowed = precision - (Number.isFinite(scale) && scale > 0 ? scale : 0);
      if (integerDigits > allowed) return `${name} allows ${allowed} digit${allowed === 1 ? '' : 's'} before the decimal point.`;
      if (Number.isFinite(scale) && scale >= 0 && fraction.replace(/0+$/, '').length > scale && /NUMBER/.test(type) && scale > 0) return `${name} allows ${scale} decimal place${scale === 1 ? '' : 's'}.`;
    }
    return null;
  }
  if (/TIME ZONE/.test(type)) return zonedDatetime.test(text.trim()) ? null : `${name} needs a date with its offset such as 2026-11-02 10:30:00+03:00.`;
  if (/^(DATE|TIMESTAMP)/.test(type)) return datetime.test(text.trim()) ? null : `${name} needs a date such as 2026-11-02 10:30:00.`;
  if (/CHAR/.test(type)) {
    const meter = lengthMeter(text, column);
    if (meter.over) return `${name} holds at most ${meter.limit} ${meter.unit}; this value has ${meter.used}.`;
  }
  return null;
}

// Every staged cell that fails a local check, for markers, navigation and blocking Apply.
export function invalidDraftCells(cells, columns) {
  return Object.entries(cells).map(([key, draft]) => { const [row, col] = key.split(':').map(Number); return { row, col, message: validateCell(columns[col], draft) }; })
    .filter(item => item.message).sort((a, b) => a.row - b.row || a.col - b.col);
}
