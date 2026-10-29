const identifierStart = char => /[\p{L}_$#]/u.test(char || '');
const identifierPart = char => /[\p{L}\p{N}_$#]/u.test(char || '');
// Offsets always refer to the original Monaco model, never to stripped SQL.
export function lexOracle(source) {
  const tokens = []; let depth = 0;
  const push = (kind, start, end, extra = {}) => tokens.push({ kind, start, end, value: source.slice(start, end), depth, ...extra });
  for (let i = 0; i < source.length;) {
    const start = i, ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i + 2); i = end < 0 ? source.length : end;
      push('comment', start, i, { open: end < 0 }); continue;
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2;
      push('comment', start, i, { open: end < 0 }); continue;
    }
    const qAt = /^[nN]?[qQ]'/.exec(source.slice(i, i + 3));
    if (qAt) {
      const open = source[i + qAt[0].length], close = ({ '[': ']', '{': '}', '(': ')', '<': '>' })[open] || open;
      const end = source.indexOf(close + "'", i + qAt[0].length + 1); i = end < 0 ? source.length : end + 2;
      push('string', start, i, { open: end < 0 }); continue;
    }
    if (ch === "'" || ch === '"' || /[nN]/.test(ch) && source[i + 1] === "'") {
      const quote = ch === 'N' || ch === 'n' ? "'" : ch;
      if (quote !== ch) i++;
      i++; let closed = false;
      while (i < source.length) {
        if (source[i++] === quote) { if (source[i] === quote) { i++; continue; } closed = true; break; }
      }
      push(quote === '"' ? 'identifier' : 'string', start, i, quote === '"'
        ? { quoted: true, value: source.slice(start + 1, closed ? i - 1 : i).replace(/""/g, '"'), open: !closed }
        : { open: !closed });
      continue;
    }
    if (identifierStart(ch)) { i++; while (identifierPart(source[i])) i++; push('identifier', start, i); continue; }
    if (source.startsWith('..', i)) { i += 2; push('symbol', start, i); continue; }
    if (/\d/.test(ch) || ch === '.' && /\d/.test(source[i + 1] || '')) { const match = source.slice(i).match(/^(?:\d+(?:\.(?!\.)\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?/); i += match[0].length; push('number', start, i); continue; }
    if (ch === ')') depth = Math.max(0, depth - 1);
    push('symbol', start, ++i);
    if (ch === '(') depth++;
  }
  return tokens;
}

