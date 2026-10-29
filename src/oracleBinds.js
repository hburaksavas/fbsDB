import { lexOracle } from './oracleLexer.js';

export function getOracleBindNames(sql) {
  const tokens = lexOracle(sql).filter(token => !['comment', 'string'].includes(token.kind));
  // Stored PL/SQL is compiled as source. :NEW/:OLD and invalid source binds
  // belong to the Oracle compiler, not to the query parameter form.
  if (tokens[0]?.value.toUpperCase() === 'CREATE' && tokens.slice(1, 8).some(token => !token.quoted && ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'].includes(token.value.toUpperCase()))) return [];
  const names = new Set();
  for (let at = 0; at < tokens.length - 1; at++) {
    const token = tokens[at], next = tokens[at + 1];
    if (token.value !== ':' || tokens[at - 1]?.value === ':' || token.end !== next.start || next.kind !== 'identifier' || next.quoted) continue;
    names.add(next.value.toUpperCase());
  }
  return [...names];
}
