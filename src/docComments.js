import { routineHeaders } from './docSkeleton.js';

const blockAbove = (source, start) => {
  const before = source.slice(0, source.lastIndexOf('\n', start - 1) + 1);
  const match = /\/\*\*([\s\S]*?)\*\/[ \t]*\r?\n[ \t]*$/.exec(before);
  return match ? match[1] : null;
};

// Splits a /** ... */ block into a summary and tagged entries (@param, @return, @throws, ...).
export function parseDocComment(body) {
  const lines = String(body).split(/\r?\n/).map(line => line.replace(/^\s*\*?\s?/, '').trimEnd());
  const summary = [], tags = [];
  let current = null;
  for (const line of lines) {
    const tag = /^@(\w+)\s*(.*)$/.exec(line);
    if (tag) { current = { tag: tag[1].toLowerCase(), text: tag[2] }; tags.push(current); continue; }
    if (current) { if (line.trim()) current.text += ` ${line.trim()}`; } else summary.push(line);
  }
  const params = tags.filter(tag => tag.tag === 'param').map(tag => {
    const match = /^(\S+)\s*(.*)$/.exec(tag.text) || [];
    const [detail, ...description] = (match[2] || '').split(/\s+-\s+/);
    return description.length ? { name: match[1] || '', detail: detail.trim(), text: description.join(' - ').trim() } : { name: match[1] || '', detail: '', text: (match[2] || '').trim() };
  });
  const returns = tags.find(tag => ['return', 'returns'].includes(tag.tag));
  const returned = returns ? (() => { const [detail, ...description] = returns.text.split(/\s+-\s+/); return description.length ? { detail: detail.trim(), text: description.join(' - ').trim() } : { detail: '', text: returns.text.trim() }; })() : null;
  return { summary: summary.join('\n').trim(), params, returns: returned, other: tags.filter(tag => !['param', 'return', 'returns'].includes(tag.tag)).map(tag => ({ tag: tag.tag, text: tag.text })) };
}

// Routines in the source that have a documentation comment directly above them.
export function documentedRoutines(source) {
  const text = String(source), result = [];
  for (const header of routineHeaders(text)) {
    const body = blockAbove(text, header.start);
    if (body == null) continue;
    result.push({ header, doc: parseDocComment(body) });
  }
  return result;
}

const code = value => `\`${String(value).replace(/`/g, "'")}\``;

export function docMarkdown({ header, doc }) {
  const signature = `${header.kind.toLowerCase()} ${header.name}(${header.params.map(param => `${param.name} ${param.mode} ${param.type}`).join(', ')})${header.returns ? ` return ${header.returns}` : ''}`;
  const parts = [code(signature)];
  if (doc.summary) parts.push(doc.summary);
  if (doc.params.length) parts.push(['**Parameters**', ...doc.params.map(param => `- ${code(param.name)}${param.detail ? ` ${param.detail}` : ''}${param.text ? ` — ${param.text}` : ''}`)].join('\n'));
  if (doc.returns) parts.push(`**Returns**${doc.returns.detail ? ` ${doc.returns.detail}` : ''}${doc.returns.text ? ` — ${doc.returns.text}` : ''}`);
  for (const item of doc.other) parts.push(`**${item.tag}** ${item.text}`);
  return parts.join('\n\n');
}

// Documentation for the routine declared at, or called by name at, the word under the pointer; undocumented names yield null.
export function docAtWord(source, word, offset) {
  if (!word) return null;
  const documented = documentedRoutines(source), upper = word.toUpperCase();
  const declared = documented.find(entry => entry.header.start <= offset && offset <= entry.header.end);
  const named = declared || documented.find(entry => entry.header.name.replace(/"/g, '').toUpperCase() === upper);
  return named ? docMarkdown(named) : null;
}
