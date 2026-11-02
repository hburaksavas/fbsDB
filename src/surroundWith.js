import { lexOracle } from './oracleLexer.js';

export const surroundTemplates = [
  { id: 'block', label: 'BEGIN … EXCEPTION … END', scope: 'statements' },
  { id: 'if', label: 'IF … THEN … END IF', scope: 'statements' },
  { id: 'loop', label: 'FOR i IN 1..n LOOP', scope: 'statements' },
  { id: 'timing', label: 'Timing block (DBMS_UTILITY.GET_TIME)', scope: 'statements' },
  { id: 'cursorLoop', label: 'FOR rec IN (query) LOOP', scope: 'query' },
];

// Queries can only become a cursor loop; statement lists get the PL/SQL control blocks.
export function surroundScope(text) {
  const first = lexOracle(String(text || '')).find(token => token.kind !== 'comment');
  if (!first) return null;
  return first.kind === 'identifier' && !first.quoted && ['SELECT', 'WITH'].includes(first.value.toUpperCase()) ? 'query' : 'statements';
}

export function surroundOptions(text) {
  const scope = surroundScope(text);
  return scope ? surroundTemplates.filter(template => template.scope === scope) : [];
}

const escapeSnippet = text => text.replace(/[\\$}]/g, '\\$&');

// Builds a Monaco snippet: the selection keeps its text (escaped), body lines gain one indent level.
export function surroundSnippet(id, text, { indent = '  ', newline = '\n' } = {}) {
  const lines = String(text).replace(/\s+$/, '').split(/\r?\n/);
  const base = lines.find(line => line.trim())?.match(/^\s*/)[0] || '';
  const strip = line => line.startsWith(base) ? line.slice(base.length) : line.trimStart();
  let body = lines.map(strip);
  if (id === 'cursorLoop') body[body.length - 1] = body.at(-1).replace(/;\s*$/, '');
  else if (!/[;/]\s*$/.test(body.at(-1)) && !/^\s*(END|BEGIN|DECLARE)\b/i.test(body.at(-1))) body[body.length - 1] += ';';
  const nest = (level, rows) => rows.map(line => line ? `${base}${indent.repeat(level)}${escapeSnippet(line)}` : '');
  const at = (level, line) => `${base}${indent.repeat(level)}${line}`;
  const parts = {
    block: [at(0, 'BEGIN'), ...nest(1, body), at(0, 'EXCEPTION'), at(1, 'WHEN ${1:OTHERS} THEN'), at(2, '${2:RAISE};'), at(0, 'END;')],
    if: [at(0, 'IF ${1:condition} THEN'), ...nest(1, body), at(0, 'END IF;')],
    loop: [at(0, 'FOR ${1:i} IN ${2:1}..${3:10} LOOP'), ...nest(1, body), at(0, 'END LOOP;')],
    timing: [at(0, 'DECLARE'), at(1, '${1:l_start} PLS_INTEGER := DBMS_UTILITY.GET_TIME;'), at(0, 'BEGIN'), ...nest(1, body), at(1, "DBMS_OUTPUT.PUT_LINE('Elapsed: ' || (DBMS_UTILITY.GET_TIME - ${1:l_start}) / 100 || ' s');"), at(0, 'END;')],
    cursorLoop: [at(0, 'FOR ${1:rec} IN ('), ...nest(1, body), at(0, ') LOOP'), at(1, '${2:NULL};'), at(0, 'END LOOP;')],
  }[id];
  if (!parts) throw new Error(`Unknown surround template: ${id}`);
  return `${parts.join(newline)}$0`;
}
