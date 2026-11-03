// Oracle regular expressions evaluated locally through a translated JavaScript RegExp. This covers the common core and refuses what Oracle
// does not have (lookaround, \b, named groups) or what cannot be mirrored faithfully, instead of silently giving a different answer.
const posix = { alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f\\x7f', print: ' -~', graph: '!-~' };

export const matchParameters = Object.freeze([
  { id: 'i', label: 'i: ignore case' }, { id: 'c', label: 'c: case sensitive' }, { id: 'n', label: 'n: . matches a newline' }, { id: 'm', label: 'm: ^ and $ match at line breaks' },
]);

export function translatePattern(pattern, parameter = '') {
  const source = String(pattern ?? '');
  if (!source) return { error: 'Enter a pattern.' };
  const bad = [[/\(\?[=!<]/, 'Lookahead, lookbehind and named groups do not exist in Oracle regular expressions.'], [/\\[bB]/, 'Oracle does not support \\b or \\B word boundaries.'], [/\(\?[a-zA-Z]/, 'Inline flags such as (?i) are not supported; use the match parameter.'], [/\\[pPkuxc]/, 'This escape sequence is not supported by Oracle.']];
  for (const [test, message] of bad) if (test.test(source)) return { error: message };
  const flags = new Set(['g']);
  for (const letter of String(parameter)) {
    if (letter === 'i') flags.add('i'); else if (letter === 'c') flags.delete('i'); else if (letter === 'n') flags.add('s'); else if (letter === 'm') flags.add('m');
    else if (letter === 'x') return { error: 'The x parameter (ignore whitespace) is not supported here.' };
    else return { error: `Unknown match parameter “${letter}”.` };
  }
  let out = '', inClass = false;
  for (let at = 0; at < source.length; at++) {
    const ch = source[at];
    if (ch === '[' && source[at + 1] === ':' && inClass) {
      const end = source.indexOf(':]', at);
      const name = end > 0 ? source.slice(at + 2, end) : '';
      if (!posix[name]) return { error: `Unknown character class [:${name}:].` };
      out += posix[name]; at = end + 1; continue;
    }
    if (ch === '\\' && at + 1 < source.length) {
      const next = source[at + 1];
      if (next === 'A' && !inClass) { out += '(?<![\\s\\S])'; at++; continue; }
      if (next === 'Z' && !inClass) { out += '(?![\\s\\S])'; at++; continue; }
      out += ch + next; at++; continue;
    }
    if (ch === '[' && !inClass) { inClass = true; out += ch; if (source[at + 1] === '^') { out += '^'; at++; } if (source[at + 1] === ']') { out += '\\]'; at++; } continue; }
    if (ch === ']' && inClass) { inClass = false; out += ch; continue; }
    out += ch;
  }
  if (inClass) return { error: 'A bracket expression is not closed.' };
  try { return { regex: new RegExp(out, [...flags].join('')), source: out }; } catch (error) { return { error: `The pattern is not valid: ${error.message}` }; }
}

const matchesFrom = (regex, text, position) => {
  const found = [];
  regex.lastIndex = Math.max(0, position - 1);
  let match;
  while ((match = regex.exec(text)) !== null) {
    found.push({ index: match.index, text: match[0], groups: match.slice(1), end: match.index + match[0].length });
    if (match[0] === '') regex.lastIndex++;
    if (found.length >= 1000) break;
  }
  return found;
};

// operation: like | count | instr | substr | replace.  Positions are 1-based, as in Oracle.
export function runRegex({ operation, pattern, text, parameter = '', position = 1, occurrence = 1, subexpression = 0, replacement = '', returnOption = 0 }) {
  const translated = translatePattern(pattern, parameter);
  if (translated.error) return { error: translated.error };
  const source = String(text ?? '');
  const all = matchesFrom(translated.regex, source, Number(position) || 1);
  const nth = all[Math.max(1, Number(occurrence) || 1) - 1];
  switch (operation) {
    case 'like': return { value: all.length > 0 ? 'TRUE' : 'FALSE', matches: all };
    case 'count': return { value: String(all.length), matches: all };
    case 'instr': return { value: nth ? String(Number(returnOption) === 1 ? nth.end + 1 : nth.index + 1) : '0', matches: all };
    case 'substr': {
      if (!nth) return { value: null, matches: all };
      const sub = Number(subexpression) || 0;
      return { value: sub === 0 ? nth.text : (nth.groups[sub - 1] ?? null), matches: all };
    }
    case 'replace': {
      const which = Number(occurrence);
      const expand = match => String(replacement).replace(/\\(\d)/g, (_, digit) => digit === '0' ? match.text : (match.groups[Number(digit) - 1] ?? ''));
      let result = '', last = 0;
      all.forEach((match, order) => {
        if (which !== 0 && order !== which - 1) return;
        result += source.slice(last, match.index) + expand(match); last = match.end;
      });
      return { value: result + source.slice(last), matches: all };
    }
    default: return { error: 'Choose an operation.' };
  }
}
