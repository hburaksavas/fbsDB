import { routineLabel } from './plsqlReferenceIndex.js';
import { pathKey } from './workspaceTree.js';

// Real calls of a routine in the project, shown next to its completion. Built from the reference index; nothing runs.

// The call text at a site: the name and its argument list, on one line and cut to a readable length.
export function callText(content, start, end, max = 160) {
  let at = end;
  while (/\s/.test(content[at] || '')) at++;
  let stop = end;
  if (content[at] === '(') {
    let depth = 0, quote = null;
    for (let i = at; i < content.length && i - start < 2000; i++) {
      const ch = content[i];
      if (quote) { if (ch === quote) quote = content[i + 1] === quote ? (i++, quote) : null; continue; }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === '(') depth++; else if (ch === ')' && --depth === 0) { stop = i + 1; break; }
    }
    if (stop === end) stop = Math.min(content.length, at + max);
  }
  const text = content.slice(start, stop).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// Calls per routine id: how many, in how many files, and their sites in path order.
export function usageByRoutine(index, sources) {
  const contents = new Map(sources.map(file => [pathKey(file.path), file.content || '']));
  const usage = new Map();
  for (const call of index.calls) {
    if (call.ambiguous) continue;
    const entry = usage.get(call.callee) || { routine: index.routines.get(call.callee), sites: [] };
    entry.sites.push({ path: call.path, line: call.line, text: callText(contents.get(pathKey(call.path)) || '', call.start, call.end) });
    usage.set(call.callee, entry);
  }
  for (const entry of usage.values()) entry.sites.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  return usage;
}

// The routines a completion names: a package member (container + name), a standalone routine by name, or for a routine
// declared in the file being edited (declaredIn), any routine of that name declared there, package members included.
export function usageFor(usage, { name, container, declaredIn }) {
  const NAME = String(name || '').toUpperCase(), CONTAINER = container ? String(container).toUpperCase() : null, file = declaredIn ? pathKey(declaredIn) : null;
  const preferred = [...usage.values()].filter(entry => entry.routine?.name === NAME && (CONTAINER
    ? entry.routine.package === CONTAINER || !entry.routine.package && entry.routine.owner === CONTAINER
    : !entry.routine.package && !entry.routine.local || file && entry.routine.declarations?.some(declaration => pathKey(declaration.path) === file)));
  if (!preferred.length) return null;
  const sites = preferred.flatMap(entry => entry.sites);
  return { labels: preferred.map(entry => routineLabel(entry.routine)), count: sites.length, files: new Set(sites.map(site => pathKey(site.path))).size, sites };
}

// Up to `limit` examples, one per file first so the examples show different callers.
export function usageExamples(found, { limit = 3, excludePath } = {}) {
  if (!found) return [];
  const skip = excludePath ? pathKey(excludePath) : null, seen = new Set(), picked = [];
  const candidates = found.sites.filter(site => pathKey(site.path) !== skip).concat(found.sites.filter(site => pathKey(site.path) === skip));
  for (const site of candidates) { if (picked.length >= limit) break; if (seen.has(pathKey(site.path))) continue; seen.add(pathKey(site.path)); picked.push(site); }
  for (const site of candidates) { if (picked.length >= limit) break; if (!picked.includes(site)) picked.push(site); }
  return picked;
}

export function usageMarkdown(found, examples) {
  if (!found) return '';
  const name = path => path.split(/[\\/]/).slice(-2).join('/');
  return [`**Used in the project:** ${found.count} call${found.count === 1 ? '' : 's'} in ${found.files} file${found.files === 1 ? '' : 's'}${found.labels.length > 1 ? ` (${found.labels.join(', ')})` : ''}`,
    ...examples.map(site => '```sql\n' + site.text + '\n```\n' + `${name(site.path).replace(/[\\`*_[\]]/g, '\\$&')}, line ${site.line}`)].join('\n\n');
}
