import { lexOracle } from './oracleLexer.js';

export const codeCellLimit = 2 * 1024 * 1024;
const sqlStarts = new Set(['SELECT', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP', 'GRANT', 'REVOKE', 'BEGIN', 'DECLARE', 'CALL', 'EXPLAIN', 'TRUNCATE', 'COMMENT']);

export function codeCellText(value) {
  if (value == null) return { error: 'NULL values have no code to show.' };
  if (typeof value === 'object') return { error: 'Binary values open in the value inspector.' };
  const text = String(value);
  if (text.length > codeCellLimit) return { error: `Values over ${(codeCellLimit / 1048576).toFixed(0)} MB are not opened in the code editor.` };
  return { text };
}

export function detectCodeLanguage(text) {
  const trimmed = String(text || '').trim();
  if (/^[[{]/.test(trimmed)) { try { const parsed = JSON.parse(trimmed); if (parsed && typeof parsed === 'object') return 'json'; } catch { /* not JSON */ } }
  if (/^<[A-Za-z?!]/.test(trimmed)) return 'xml';
  const first = lexOracle(trimmed).find(token => token.kind !== 'comment');
  if (first?.kind === 'identifier' && !first.quoted && sqlStarts.has(first.value.toUpperCase())) return 'sql';
  return 'plaintext';
}
