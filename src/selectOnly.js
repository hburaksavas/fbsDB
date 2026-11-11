import { lexOracle } from './oracleLexer.js';

// Conservative local classification, not a promise that SELECT functions have no effects.
export function assertSelectOnly(sql, subject = 'This runs') {
  const lexed = lexOracle(sql);
  if (lexed.some(t => t.kind === 'comment' && t.open && t.value.startsWith('/*'))) throw new Error('Unclosed SQL comment.');
  const tokens = lexed.filter(t => t.kind !== 'comment');
  if (tokens.at(-1)?.value === ';') tokens.pop();
  const word = t => t?.kind === 'identifier' && !t.quoted ? t.value.toUpperCase() : '';
  let depth = 0;
  for (const token of tokens) {
    if (token.kind !== 'symbol') continue;
    if (token.value === '(') depth++;
    if (token.value === ')' && --depth < 0) throw new Error('Unbalanced SELECT parentheses.');
  }
  if (depth) throw new Error('Unbalanced SELECT parentheses.');
  if (!['SELECT', 'WITH'].includes(word(tokens[0])) || tokens.some(t => t.value === ';' || t.open && t.kind !== 'comment') ||
      tokens.some(t => ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'BEGIN', 'DECLARE', 'FUNCTION', 'PROCEDURE', 'INTO'].includes(word(t))) ||
      !tokens.some(t => t.depth === 0 && word(t) === 'SELECT')) {
    throw new Error(`${subject} one SELECT query only (including SELECT with a WITH clause).`);
  }
  return sql.trim();
}
