import { parsePlsql } from './plsqlStructure.js';

export function formatOraclePlsql(source, style = {}) {
  const tree = parsePlsql(source);
  if (!tree.complete || !tree.children.length) return { formatted: source, supported: false, reason: tree.errors[0] || 'No complete PL/SQL unit was found.' };
  const events = new Map(), unit = style.insertSpaces === false ? '\t' : ' '.repeat(Math.max(2, Math.min(8, style.tabSize || 4)));
  const line = (offset, indent) => { if (offset != null) events.set(offset, indent); };
  const visit = (node, depth) => {
    line(node.labelStart, depth);
    line(node.start, depth);
    if (node.kind === 'routine' || node.kind === 'block') {
      for (const child of node.declarations || []) visit(child, depth + 1);
      line(node.begin, depth);
      for (const child of node.children || []) visit(child, depth + 1);
      if (node.handlers) visit(node.handlers, depth);
      line(node.closeStart, depth);
    } else if (node.kind === 'handlers') {
      for (const branch of node.children) { line(branch.start, depth + 1); for (const child of branch.children) visit(child, depth + 2); }
    } else if (node.kind === 'if' || node.kind === 'case') {
      for (const branch of node.branches) { line(branch.start, depth + (node.kind === 'case' ? 1 : 0)); for (const child of branch.children) visit(child, depth + (node.kind === 'case' ? 2 : 1)); }
      line(node.closeStart, depth);
    } else if (node.kind === 'loop') {
      for (const child of node.children) visit(child, depth + 1);
      line(node.closeStart, depth);
    } else if (node.fields?.length) {
      for (const field of node.fields) line(field.start, depth + 1);
      line(node.fieldsEnd, depth);
    }
  };
  for (const node of tree.children) visit(node, 0);
  const output = []; let current = '', currentDepth = 0, previous = null;
  const flush = () => { if (current.trim()) output.push(current.trimEnd()); current = ''; };
  for (let at = 0; at < tree.tokens.length; at++) {
    const token = tree.tokens[at], raw = source.slice(token.start, token.end), event = events.get(token.start);
    if (event != null) { flush(); currentDepth = event; }
    if (token.kind === 'comment') {
      const before = source.slice(previous?.end || 0, token.start), trailing = previous && !/[\r\n]/.test(before);
      if (!trailing) {
        flush(); const next = tree.tokens.slice(at + 1).find(next => next.kind !== 'comment');
        currentDepth = events.get(next?.start) ?? currentDepth;
      }
      if (!current) current = unit.repeat(currentDepth);
      else if (!current.endsWith(' ')) current += ' ';
      current += raw;
      if (raw.startsWith('--') || raw.includes('\n')) flush();
      previous = token; continue;
    }
    if (!current) current = unit.repeat(currentDepth);
    else if (previous && /\s/.test(source.slice(previous.end, token.start)) && !/\s$/.test(current)) current += ' ';
    current += raw;
    previous = token;
  }
  flush();
  return { formatted: output.join('\n') + '\n', supported: true };
}
