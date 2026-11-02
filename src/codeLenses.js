import { lexOracle } from './oracleLexer.js';
import { minimapLabel } from './minimapSections.js';

const kinds = new Set(['PACKAGE', 'PROCEDURE', 'FUNCTION', 'TRIGGER']);
const headerName = /^(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:NON)?(?:EDITIONABLE\s+)?)?(?:PACKAGE\s+BODY|PACKAGE|PROCEDURE|FUNCTION|TRIGGER)\s+("[^"]+"|[\w$#.]+)/i;
export const codeLensLimit = 100;

export function referenceCount(text, name) {
  const wanted = String(name).toUpperCase().replace(/^.*\./, '');
  let count = 0;
  for (const token of lexOracle(text)) if (token.kind === 'identifier' && (token.quoted ? token.value : token.value.toUpperCase()) === wanted) count++;
  return Math.max(0, count - 1);
}

// One lens group per package/routine/trigger: reference count plus explicit, reviewable actions.
export function codeLensItems(outline, text, positionAt, { limit = codeLensLimit } = {}) {
  const items = [], seen = new Set();
  for (const item of outline || []) {
    if (!kinds.has(item.kind) || (item.depth ?? 0) > 2) continue;
    const line = positionAt(item.start).lineNumber;
    if (seen.has(line)) continue;
    const match = headerName.exec(String(item.name || '').trim());
    if (!match) continue;
    seen.add(line);
    const name = match[1].replace(/^"|"$/g, '').replace(/^.*\./, ''), stored = /^CREATE\b/i.test(String(item.name).trim()), isBody = /PACKAGE\s+BODY/i.test(item.name);
    const actions = [{ id: 'references', title: `${referenceCount(text, name)} references in this file` }];
    if (item.kind === 'PACKAGE') actions.push({ id: 'switch', title: isBody ? 'Go to specification' : 'Go to body' });
    if (stored) actions.push({ id: 'compile', title: 'Compile…' });
    if (item.kind !== 'TRIGGER') actions.push({ id: 'run', title: 'Run call…' });
    items.push({ line, kind: item.kind, name, label: minimapLabel(item), actions });
    if (items.length >= limit) break;
  }
  return items;
}
