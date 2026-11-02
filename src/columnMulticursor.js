// A single copied result header row (TSV) or a vertical list of column names.
export function columnCursorDraft(clipboard, eol = '\n') {
  const input = String(clipboard ?? '').replace(/^(?:\r\n|\n|\r)+|(?:\r\n|\n|\r)+$/g, '');
  const rows = input.split(/\r\n|\n|\r/);
  if (!rows.length || rows.length > 100 || (rows.length > 1 && rows.some(row => row.includes('\t'))))
    return { error: 'Copy one header row or a list of up to 100 column names.' };
  const names = rows.length === 1 ? rows[0].split('\t') : rows;
  if (names.length < 2 || names.length > 100 || names.some(name => !name || /[\r\n\t]/.test(name)))
    return { error: 'Copy 2–100 column names to create multiple selections.' };
  const identifiers = names.map(name => /^[A-Za-z][A-Za-z0-9_$#]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`);
  const text = identifiers.join(eol);
  let offset = 0;
  const spans = identifiers.map(identifier => { const start = offset; offset += identifier.length + eol.length; return { start, end: start + identifier.length }; });
  return { text, spans, count: identifiers.length };
}
