export const statusIndicators = [
  { id: 'position', label: 'Cursor position', fixed: true },
  { id: 'overview', label: 'Local change navigation', fixed: true },
  { id: 'procedure', label: 'Routine at the caret' },
  { id: 'schema', label: 'Current schema' },
  { id: 'oracleVersion', label: 'Oracle version' },
  { id: 'branch', label: 'Git branch' },
  { id: 'spaces', label: 'Indentation' },
  { id: 'lineEnding', label: 'Line endings' },
  { id: 'encoding', label: 'Encoding' },
  { id: 'language', label: 'Language' },
];
export const defaultStatusIndicators = Object.freeze(['spaces', 'encoding', 'language']);
const known = new Set(statusIndicators.filter(item => !item.fixed).map(item => item.id));

// Stored as an ordered list of optional indicator ids; unknown or duplicate ids are dropped.
export function normalizeStatusIndicators(value) {
  if (!Array.isArray(value)) return [...defaultStatusIndicators];
  return [...new Set(value.filter(id => known.has(id)))];
}

export function toggleStatusIndicator(current, id) {
  const list = normalizeStatusIndicators(current);
  if (!known.has(id)) return list;
  return list.includes(id) ? list.filter(item => item !== id) : statusIndicators.filter(item => known.has(item.id) && (list.includes(item.id) || item.id === id)).map(item => item.id);
}

// Each indicator yields text, a tooltip and (optionally) the action id it opens; missing data hides the indicator.
export function statusIndicatorContent(id, context = {}) {
  switch (id) {
    case 'procedure': return context.procedure ? { text: context.procedure, title: 'Routine at the caret. Click to open the file outline.', action: 'outline' } : null;
    case 'schema': return context.schema ? { text: context.schema, title: `Current schema ${context.schema}. Click to open the session inspector.`, action: 'session' } : null;
    case 'oracleVersion': return context.oracleVersion ? { text: `Oracle ${context.oracleVersion}`, title: 'Version reported by the connected database.' } : null;
    case 'branch': return context.branch ? { text: context.branch, title: `Git branch ${context.branch}. Click to open Git status.`, action: 'git' } : null;
    case 'spaces': return { text: context.insertSpaces === false ? `Tab size: ${context.tabSize}` : `Spaces: ${context.tabSize}`, title: 'Indentation. Click to open editor style settings.', action: 'indent' };
    case 'lineEnding': return context.lineEnding ? { text: context.lineEnding, title: `Line endings are ${context.lineEnding}. Click to switch ${context.lineEnding === 'CRLF' ? 'to LF' : 'to CRLF'}; this edits the document.`, action: 'eol' } : null;
    case 'encoding': return { text: 'UTF-8', title: 'Files are read and saved as UTF-8.' };
    case 'language': return { text: 'Oracle SQL', title: 'Language mode', icon: 'code' };
    default: return null;
  }
}
