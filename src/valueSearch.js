export const valueSearchLimit = 1000;

// Finds literal matches with their line/column so the viewer can navigate; very large values stop at the limit.
export function findValueMatches(text, query, { caseSensitive = false, limit = valueSearchLimit } = {}) {
  const source = String(text ?? ''), needle = String(query ?? '');
  if (!needle) return { matches: [], truncated: false };
  const haystack = caseSensitive ? source : source.toLowerCase(), target = caseSensitive ? needle : needle.toLowerCase();
  const matches = [];
  let line = 1, lineStart = 0, scanned = 0;
  for (let at = haystack.indexOf(target); at >= 0; at = haystack.indexOf(target, at + target.length)) {
    for (; scanned < at; scanned++) if (source.charCodeAt(scanned) === 10) { line++; lineStart = scanned + 1; }
    if (matches.length === limit) return { matches, truncated: true };
    matches.push({ start: at, end: at + target.length, line, column: at - lineStart + 1 });
  }
  return { matches, truncated: false };
}

export function splitByMatches(text, matches) {
  const parts = [];
  let at = 0;
  matches.forEach((match, index) => { if (match.start > at) parts.push({ text: text.slice(at, match.start) }); parts.push({ text: text.slice(match.start, match.end), match: index }); at = match.end; });
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
