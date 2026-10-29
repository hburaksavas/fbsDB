import { lexOracle } from './oracleLexer.js';

const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;
const semantic = token => token.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : token.value;

export function compilationHeader(source) {
  const tokens = lexOracle(source).filter(token => token.kind !== 'comment');
  let at = tokens.findIndex(token => ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'].some(value => word(token, value)));
  if (at < 0 || ![0, 1, 2, 3, 4, 5].includes(at)) return null;
  const start = at, type = tokens[at++].value.toUpperCase();
  if ((type === 'PACKAGE' || type === 'TYPE') && word(tokens[at], 'BODY')) at++;
  let objectName = at;
  if (tokens[at + 1]?.value === '.') objectName = at + 2;
  return { tokens, start, objectName, bodyStart: objectName + 1 };
}

export function offsetAtOraclePosition(source, line, column) {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) return null;
  const lines = source.split('\n');
  if (line > lines.length) return null;
  const text = lines[line - 1].replace(/\r$/, ''), characters = Array.from(text);
  if (column > characters.length + 1) return null;
  return lines.slice(0, line - 1).reduce((sum, value) => sum + value.length + 1, 0) + characters.slice(0, column - 1).join('').length;
}

export function mapCompilationPosition(storedSource, submittedSql, line, column) {
  const native = compilationHeader(storedSource), editor = compilationHeader(submittedSql), offset = offsetAtOraclePosition(storedSource, line, column);
  if (!native || !editor || offset == null) return null;
  const nativeBody = native.tokens.slice(native.bodyStart), editorBody = editor.tokens.slice(editor.bodyStart);
  if (nativeBody.length !== editorBody.length || nativeBody.some((token, index) => semantic(token) !== semantic(editorBody[index]))) return null;
  const nativeIndex = native.tokens.findIndex(token => token.start <= offset && offset < token.end);
  if (nativeIndex < 0) {
    const next = native.tokens.findIndex(token => token.start >= offset);
    return next >= native.bodyStart ? editor.tokens[editor.bodyStart + next - native.bodyStart]?.start ?? null : null;
  }
  const targetIndex = nativeIndex >= native.bodyStart ? editor.bodyStart + nativeIndex - native.bodyStart : nativeIndex === native.objectName ? editor.objectName : nativeIndex === native.start ? editor.start : null;
  if (targetIndex == null) return null;
  const from = native.tokens[nativeIndex], to = editor.tokens[targetIndex];
  return to.start + Math.min(offset - from.start, to.end - to.start);
}

export function compilationProblemItems(report, context = {}, tabId) {
  if (!report) return [];
  return (report.errors || []).map((error, index) => {
    const statementOffset = Number.isInteger(context.statementOffset) ? context.statementOffset : null;
    const local = report.source && context.executedSql ? mapCompilationPosition(report.source, context.executedSql, error.line, error.position) : null;
    const offset = local != null && statementOffset != null && context.editorSnapshot?.slice(statementOffset, statementOffset + context.executedSql.length) === context.executedSql ? statementOffset + local : null;
    const prefix = offset == null ? null : context.editorSnapshot.slice(0, offset), line = prefix == null ? null : prefix.split('\n').length, column = prefix == null ? null : prefix.length - prefix.lastIndexOf('\n');
    return { id: `${tabId}:compile:${index}`, tabId, severity: error.attribute === 'WARNING' ? 'warning' : 'error', source: 'Oracle compiler', message: error.text, oracleLine: error.line, oracleColumn: error.position, offset, line, column, editorSnapshot: context.editorSnapshot, object: `${report.owner}.${report.name}`, definition: { owner: report.owner, name: report.name, type: report.type, text: report.source, originTabId: tabId }, fileName: context.fileName || `${report.owner}.${report.name}.sql` };
  });
}
