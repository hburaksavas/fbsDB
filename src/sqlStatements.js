// Statement ranges share offsets with Monaco's model, including comments and literals.
export function getSqlStatements(text) {
  const statements = [];
  let start = null, plsql = false;
  const finish = (end) => {
    if (start !== null && text.slice(start, end).trim()) statements.push({ start, end, sql: text.slice(start, end).trim() });
    start = null; plsql = false;
  };
  for (let i = 0; i < text.length;) {
    const ch = text[i], next = text[i + 1];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '-' && next === '-') { const end = text.indexOf('\n', i + 2); i = end < 0 ? text.length : end + 1; continue; }
    if (ch === '/' && next === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
    const lineStart = text.lastIndexOf('\n', i - 1) + 1;
    const lineEnd = text.indexOf('\n', i);
    const endOfLine = lineEnd < 0 ? text.length : lineEnd;
    if (ch === '/' && text.slice(lineStart, endOfLine).trim() === '/') { finish(i); i = endOfLine; continue; }
    if (start === null) {
      if (ch === ';') { i++; continue; }
      start = i;
      plsql = /^(?:DECLARE|BEGIN|PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE|CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE))\b/i.test(text.slice(i).replace(/^<<\s*(?:"(?:[^"]|"")+"|[\w$#]+)\s*>>\s*/, ''));
    }
    if ((ch === 'q' || ch === 'Q') && next === "'" && text[i + 2]) {
      const open = text[i + 2], close = ({ '[': ']', '{': '}', '(': ')', '<': '>' })[open] || open;
      const end = text.indexOf(close + "'", i + 3); i = end < 0 ? text.length : end + 2; continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch; i++;
      while (i < text.length) { if (text[i] === quote) { if (text[i + 1] === quote) { i += 2; continue; } i++; break; } i++; }
      continue;
    }
    if (ch === ';' && !plsql) finish(i + 1);
    i++;
  }
  finish(text.length);
  return statements;
}

export function getStatementAtCursor(text, cursor) {
  const statements = getSqlStatements(text);
  return (statements.find((item) => item.end === cursor) || statements.find((item) => cursor < item.end) || statements.at(-1))?.sql || '';
}
