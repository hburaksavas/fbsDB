import { lexOracle } from './oracleLexer.js';
import { getOracleBindNames } from './oracleBinds.js';
import { normalizeBindDefinitions } from './bindDefinitions.js';

// Conservative local classification, not a promise that SELECT functions have no effects.
export function assertMiniToolSelect(sql) {
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
    throw new Error('Mini tools support one SELECT query only (including SELECT with a WITH clause).');
  }
  return sql.trim();
}

export function normalizeMiniTool(input) {
  if (input?.version !== 1) throw new Error('Unsupported mini tool format.');
  const sql = assertMiniToolSelect(input.sql || '');
  const name = String(input.name || '').trim().slice(0, 100);
  if (!name) throw new Error('Enter a tool name.');
  const fields = normalizeBindDefinitions(input.fields, getOracleBindNames(sql)).map(field => ({
    ...field, label: String(input.fields?.find(f => f.name === field.name)?.label || field.name).slice(0, 100),
  }));
  const columns = (Array.isArray(input.columns) ? input.columns : []).map((c, index) => ({
    index, name: String(c.name || '').slice(0, 256), visible: c.visible !== false,
  }));
  return { version: 1, id: /^[a-f0-9]{32}$/.test(input.id) ? input.id : '', name, sql, fields, columns, description: String(input.description || '').slice(0,2000), usage: String(input.usage || '').slice(0,2000), changeNotes: String(input.changeNotes || '').slice(0,2000), revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 0 };
}

export function miniToolFromResult(result) {
  if (!result?.columns?.length || !result.executedSql) throw new Error('Run a SELECT successfully before saving it as a tool.');
  return normalizeMiniTool({ version: 1, name: 'New mini tool', sql: result.executedSql,
    columns: result.columns.map(c => ({ name: c.name, visible: true })), fields: [] });
}

// Rename in place: 1-100 characters, unique among the workspace tools ignoring case. The tool id never changes.
export function validateToolName(tools, name, exceptId = null) {
  const text = String(name || '').trim();
  if (!text) return { error: 'Enter a tool name.' };
  if (text.length > 100) return { error: 'Use at most 100 characters.' };
  if (tools.some(tool => tool.id !== exceptId && String(tool.name).trim().toLowerCase() === text.toLowerCase())) return { error: 'Another tool already has this name.' };
  return { name: text };
}
