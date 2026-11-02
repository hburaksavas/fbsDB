import { lexOracle } from './oracleLexer.js';

const word = token => token?.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : null;
const modes = new Set(['IN', 'OUT', 'NOCOPY']);

// Parses PROCEDURE/FUNCTION headers: name, parameters (mode, type, default) and the RETURN type.
export function routineHeaders(source) {
  const tokens = lexOracle(String(source)).filter(token => token.kind !== 'comment'), headers = [];
  for (let at = 0; at < tokens.length - 1; at++) {
    const kind = word(tokens[at]);
    if (!['PROCEDURE', 'FUNCTION'].includes(kind) || tokens[at + 1].kind !== 'identifier') continue;
    const name = tokens[at + 1].quoted ? `"${tokens[at + 1].value}"` : tokens[at + 1].value;
    let cursor = at + 2;
    const params = [];
    if (tokens[cursor]?.value === '(') {
      const depth = tokens[cursor].depth;
      let part = [];
      const finish = () => {
        if (!part.length) return;
        const names = part[0];
        let index = 1;
        const mode = [];
        while (index < part.length && modes.has(word(part[index]))) mode.push(word(part[index++]));
        const typeTokens = [];
        let defaultValue = null;
        for (; index < part.length; index++) {
          if (word(part[index]) === 'DEFAULT' || part[index].value === ':') { defaultValue = part.slice(index + (part[index].value === ':' ? 2 : 1)).map(token => token.value).join(' '); break; }
          typeTokens.push(part[index].value);
        }
        params.push({ name: names.value, mode: mode.length ? mode.join(' ') : 'IN', type: typeTokens.join('').replace(/,/g, ', ') || 'UNKNOWN', defaultValue });
        part = [];
      };
      for (cursor++; cursor < tokens.length; cursor++) {
        const token = tokens[cursor];
        if (token.value === ')' && token.depth === depth) break;
        if (token.value === ',' && token.depth === depth + 1) finish(); else part.push(token);
      }
      finish(); cursor++;
    }
    let returns = null;
    if (kind === 'FUNCTION' && word(tokens[cursor]) === 'RETURN') {
      const type = [];
      for (cursor++; cursor < tokens.length && !['IS', 'AS', 'DETERMINISTIC', 'PIPELINED', 'RESULT_CACHE', 'PARALLEL_ENABLE'].includes(word(tokens[cursor])) && tokens[cursor].value !== ';'; cursor++) type.push(tokens[cursor].value);
      returns = type.join('').replace(/,/g, ', ');
    }
    headers.push({ kind, name, start: tokens[at].start, end: tokens[Math.min(cursor, tokens.length - 1)].end, params, returns });
  }
  return headers;
}

const escape = text => String(text).replace(/[\\$}]/g, '\\$&');
const hasDocAbove = (source, start) => /(?:\*\/|--[^\n]*)[ \t]*\r?\n[ \t]*$/.test(source.slice(0, start));

// Picks the routine whose header contains the offset, otherwise the next one starting within three lines below it.
export function docSkeletonAt(source, offset) {
  const headers = routineHeaders(source), lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const target = headers.find(header => header.start <= offset && offset <= header.end) || headers.find(header => header.start >= lineStart && source.slice(lineStart, header.start).split('\n').length <= 4);
  if (!target) return { error: 'Place the cursor on a PROCEDURE or FUNCTION declaration.' };
  const startOfLine = source.lastIndexOf('\n', target.start - 1) + 1, indent = source.slice(startOfLine, target.start).match(/^[ \t]*/)[0];
  if (hasDocAbove(source, startOfLine)) return { error: `${target.name} already has a comment above it. Edit that comment instead.`, target };
  const width = Math.max(0, ...target.params.map(param => param.name.length));
  let stop = 1;
  const lines = ['/**', ` * \${${stop++}:Describe ${escape(target.name.toLowerCase())}.}`];
  if (target.params.length || target.returns) lines.push(' *');
  for (const param of target.params) lines.push(` * @param ${escape(param.name).padEnd(width)} ${param.mode} ${escape(param.type)}${param.defaultValue ? ` (default ${escape(param.defaultValue)})` : ''} - \${${stop++}:description}`);
  if (target.returns) lines.push(` * @return ${escape(target.returns)} - \${${stop++}:description}`);
  lines.push(' */');
  return { target, insertAt: startOfLine, snippet: lines.map(line => indent + line).join('\n') + '\n' };
}
