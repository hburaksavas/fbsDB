import { lexOracle } from './oracleLexer.js';
import { getOracleBindNames } from './oracleBinds.js';

// Functions that only compute a value from their arguments; every other call may run user code with side effects.
const pureFunctions = new Set(['ABS', 'CEIL', 'FLOOR', 'ROUND', 'TRUNC', 'MOD', 'POWER', 'SQRT', 'SIGN', 'EXP', 'LN', 'LOG', 'GREATEST', 'LEAST',
  'UPPER', 'LOWER', 'INITCAP', 'SUBSTR', 'INSTR', 'LENGTH', 'LTRIM', 'RTRIM', 'TRIM', 'LPAD', 'RPAD', 'REPLACE', 'TRANSLATE', 'CONCAT', 'REGEXP_REPLACE', 'REGEXP_SUBSTR', 'REGEXP_INSTR', 'REGEXP_LIKE',
  'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'TO_TIMESTAMP', 'TO_TIMESTAMP_TZ', 'TO_CLOB', 'CAST', 'NVL', 'NVL2', 'COALESCE', 'NULLIF', 'DECODE', 'ADD_MONTHS', 'MONTHS_BETWEEN', 'LAST_DAY', 'NEXT_DAY', 'EXTRACT',
  'ASCII', 'CHR', 'SOUNDEX', 'HEXTORAW', 'RAWTOHEX', 'UNISTR', 'NUMTODSINTERVAL', 'NUMTOYMINTERVAL', 'TO_DSINTERVAL', 'TO_YMINTERVAL', 'JSON_VALUE', 'JSON_QUERY', 'JSON_EXISTS', 'JSON_OBJECT', 'JSON_ARRAY', 'ORA_HASH', 'STANDARD_HASH']);
const forbidden = new Set(['SELECT', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'BEGIN', 'DECLARE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'EXECUTE', 'INTO', 'FROM', 'CALL', 'LOCK']);

const wordOf = token => token?.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : '';

// Calls to anything not known to be pure (user, package or quoted names), each listed once.
export function impureCalls(tokens) {
  const calls = [];
  for (let at = 0; at < tokens.length - 1; at++) {
    if (tokens[at + 1].value !== '(' || tokens[at].kind !== 'identifier') continue;
    let name = tokens[at].quoted ? `"${tokens[at].value}"` : tokens[at].value;
    let start = at;
    while (start >= 2 && tokens[start - 1].value === '.' && tokens[start - 2].kind === 'identifier') { start -= 2; name = `${tokens[start].value}.${name}`; }
    const qualified = start !== at;
    if ((qualified || tokens[at].quoted || !pureFunctions.has(wordOf(tokens[at]))) && !calls.includes(name)) calls.push(name);
  }
  return calls;
}

// Turns a selected expression into a one-row query. Calls to anything not known to be pure are listed so the user must confirm them.
export function prepareEvaluation(text) {
  const raw = String(text || '').trim().replace(/;\s*$/, '');
  if (!raw) return { error: 'Select a SQL expression to evaluate.' };
  const lexed = lexOracle(raw);
  if (lexed.some(token => token.kind === 'comment' && token.open)) return { error: 'The expression has an unclosed comment.' };
  const tokens = lexed.filter(token => token.kind !== 'comment');
  if (tokens.some(token => token.value === ';')) return { error: 'Evaluate one expression at a time; statements are not supported.' };
  const word = token => token?.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : '';
  const bad = tokens.find(token => forbidden.has(word(token)));
  if (bad) return { error: `${word(bad)} is not part of an expression. Select only the expression, such as TO_CHAR(SYSDATE, 'YYYY') or :amount * 2.` };
  let depth = 0;
  for (const token of tokens) { if (token.value === '(') depth++; if (token.value === ')' && --depth < 0) return { error: 'The expression has unbalanced parentheses.' }; }
  if (depth) return { error: 'The expression has unbalanced parentheses.' };
  const calls = impureCalls(tokens);
  return { sql: `SELECT (${raw}) AS "RESULT" FROM dual`, expression: raw, binds: getOracleBindNames(raw), calls };
}

export function evaluationParameters(binds, values) {
  return binds.map(name => ({ name, type: values[name]?.type || 'VARCHAR2', value: values[name]?.value ?? '', direction: 'IN' }));
}
