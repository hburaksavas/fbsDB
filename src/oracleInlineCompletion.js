import { getOracleCompletionContext, formatCompletionKeyword } from './oracleCompletionContext.js';

// Short, deterministic SQL continuations. Never infer a table name or a value.
export function oracleInlineCompletion(source, cursor, settings = {}, result) {
  const context = getOracleCompletionContext(source, cursor);
  if (context.blocked || context.bind || context.quoted && !result) return null;
  const before = context.before.trimStart(), after = source.slice(cursor);
  const keyword = text => formatCompletionKeyword(text, source, settings.keywordCase || 'auto');
  if (!result && !after.trim() && /^select\s*(?:\*)?\s*$/i.test(before)) {
    const hasStar = before.includes('*');
    const gap = /\s$/.test(before) ? '' : ' ';
    return { start: cursor, end: cursor, insertText: gap + (hasStar ? '' : '* ') + keyword('FROM') + ' ' };
  }
  if (!result && !context.qualifier && /^s(?:e(?:l(?:e(?:c)?)?)?)?$/i.test(before)) {
    const prefix = context.fragment;
    const word = prefix === prefix.toLowerCase() ? 'select' : keyword('SELECT');
    return { start: context.start, end: context.end, insertText: prefix + word.slice(prefix.length) };
  }
  if (!result) return null;
  const candidate = result.candidates[0];
  if (!candidate || candidate.bulkColumns || candidate.snippet && !candidate.functionName) return null;
  if (candidate.schema && !candidate.preferSchema || context.quoted && !candidate.preferSchema) return null;
  if (candidate.continuation) return candidate;
  const prefix = context.quoted ? source.slice(context.start, cursor) : context.fragment;
  if (!prefix || !candidate.insertText.startsWith(prefix) || candidate.insertText === prefix) return null;
  // Monaco requires the replacement to preserve the text already typed.
  return { ...candidate, insertText: prefix + candidate.insertText.slice(prefix.length).replace(/\$0/g, '') };
}

export function withSqlContinuations(result, source, cursor, settings) {
  const continuation = oracleInlineCompletion(source, cursor, settings);
  if (!continuation) return result;
  const label = continuation.insertText.trim();
  result.candidates = [{ ...continuation, label, key: 'continuation:' + label.toUpperCase(), kind: 'keyword', detail: 'SQL continuation', rank: -10, continuation: true },
    ...result.candidates.filter(item => item.insertText.toLowerCase() !== continuation.insertText.toLowerCase())];
  return result;
}
