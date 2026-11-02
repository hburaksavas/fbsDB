const kinds = new Set(['PACKAGE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE']);
const short = { PACKAGE: 'PKG', PROCEDURE: 'PROC', FUNCTION: 'FUNC', TRIGGER: 'TRG', TYPE: 'TYPE' };
const header = /^(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:NON)?(?:EDITIONABLE\s+)?)?(PACKAGE\s+BODY|PACKAGE|PROCEDURE|FUNCTION|TRIGGER|TYPE\s+BODY|TYPE)\s+("[^"]+"|[\w$#.]+)/i;
export const minimapSectionLimit = 200;

// Outline names are header lines ("FUNCTION total RETURN NUMBER IS"), so the object name is extracted from them.
export function minimapLabel(item) {
  const match = header.exec(String(item.name || '').trim());
  const name = match ? match[2].replace(/^"|"$/g, '') : String(item.name || '').trim();
  const body = match && /BODY/i.test(match[1]) ? ' body' : '';
  return name ? `${short[item.kind] || item.kind} ${name.slice(0, 40)}${body}` : '';
}

// Labels the start of each routine/package boundary; nested routines beyond the second level stay unlabeled.
export function minimapSections(outline, positionAt, { limit = minimapSectionLimit, maxDepth = 2 } = {}) {
  const lines = new Map();
  for (const item of outline || []) {
    if (!kinds.has(item.kind) || (item.depth ?? 0) > maxDepth) continue;
    const text = minimapLabel(item);
    if (!text) continue;
    const line = positionAt(item.start).lineNumber;
    if (!lines.has(line)) lines.set(line, text);
    if (lines.size >= limit) break;
  }
  return [...lines].sort((a, b) => a[0] - b[0]).map(([line, text]) => ({ line, text }));
}
