import { lexOracle } from './oracleLexer.js';

const closers = { IF: 'END IF;', LOOP: 'END LOOP;', BEGIN: 'END;', CASE: 'END CASE;' };

// Closing words already present below at the same or lower indentation mean the block is complete.
function hasCloser(lines, from, base, closer) {
  const word = closer.replace(/;$/, '').toUpperCase();
  for (let i = from + 1; i < lines.length; i++) {
    const line = lines[i], trimmed = line.trim();
    if (!trimmed) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent < base.length) return false;
    if (indent === base.length) return trimmed.toUpperCase().startsWith(word);
  }
  return false;
}

// Uses the lexer so '--' inside string literals is not mistaken for a comment.
function stripTrailingComment(text) {
  const last = lexOracle(text).at(-1);
  return last?.kind === 'comment' && text.slice(last.start, last.start + 2) === '--' ? text.slice(0, last.start).trim() : text;
}

function unclosed(text) {
  let open = 0;
  for (const token of lexOracle(text)) { if (token.kind !== 'symbol') continue; if (token.value === '(') open++; if (token.value === ')') open = Math.max(0, open - 1); }
  return open;
}

// Completes the construct on the current line and returns the replacement lines plus the cursor target.
export function smartEnter(lines, index, { indent = '  ' } = {}) {
  const line = lines[index] ?? '', base = line.match(/^\s*/)[0], code = stripTrailingComment(line.trim()), upper = code.toUpperCase();
  if (!code) return null;
  const parens = unclosed(code), closeParens = ')'.repeat(parens);
  const head = (base + code + closeParens).replace(/\s+$/, ''), body = base + indent;
  const block = (suffix, closer) => {
    const lead = head.endsWith(suffix.trim()) ? head : `${head}${suffix}`;
    const out = [lead, body];
    if (closer && !hasCloser(lines, index, base, closer)) out.push(base + closer);
    return { lines: out, cursor: { line: 1, column: body.length + 1 } };
  };
  if (/^(IF|ELSIF)\b/.test(upper) && !/\bTHEN$/.test(upper)) return block(' THEN', upper.startsWith('IF') ? closers.IF : null);
  if (/^(IF|ELSIF)\b.*\bTHEN$/.test(upper)) return block('', upper.startsWith('IF') ? closers.IF : null);
  if (/^(WHILE|FOR)\b/.test(upper) && !/\bLOOP$/.test(upper)) return block(' LOOP', closers.LOOP);
  if (/^(WHILE\b.*|FOR\b.*|)LOOP$/.test(upper)) return block('', closers.LOOP);
  if (/^(BEGIN|DECLARE)$/.test(upper)) return block('', upper === 'BEGIN' ? closers.BEGIN : null);
  if (/^CASE\b/.test(upper) && !/\bEND\b/.test(upper)) return block('', closers.CASE);
  if (/^(ELSE|EXCEPTION)$/.test(upper) || /^WHEN\b.*\bTHEN$/.test(upper)) return block('', null);
  if (/^WHEN\b/.test(upper) && !/\bTHEN$/.test(upper)) return block(' THEN', null);
  const terminated = /;$/.test(head) || /^(--|\/)/.test(code) || /\b(IS|AS|THEN|LOOP|BEGIN|ELSE|DECLARE)$/i.test(head) || /[,(]$/.test(head);
  const next = terminated ? head : `${head};`;
  return { lines: [next, base], cursor: { line: 1, column: base.length + 1 } };
}
