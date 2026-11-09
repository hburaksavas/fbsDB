// FI-007: PL/SQL debugging in the editor. Breakpoints are kept per document
// as editor lines; a unit's database line counts from the line that holds its
// PACKAGE/PROCEDURE/... keyword, which is how ALL_SOURCE numbers it.
import { oracleSourceDeclaration } from './oracleSourceIdentity.js';
import { plsqlVisibleSymbols } from './plsqlStructure.js';

const DEBUGGABLE = ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER', 'TYPE', 'TYPE BODY'];
const PLAIN = /^[A-Za-z][A-Za-z0-9_$#]*$/;

const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;

// The stored unit a document shows, or null when it cannot be debugged.
export function debugUnit(document) {
  if (!document) return null;
  const object = document.definitionObject;
  if (object && DEBUGGABLE.includes(object.type)) {
    // A definition opened from the database is its ALL_SOURCE text: line 1 is line 1.
    const type = object.type === 'PACKAGE' && /\.body\.sql$/i.test(document.name || '') ? 'PACKAGE BODY' : object.type;
    return PLAIN.test(object.name) ? { owner: PLAIN.test(object.owner || '') ? object.owner.toUpperCase() : null, name: object.name.toUpperCase(), type, firstLine: 1 } : null;
  }
  const { declaration } = oracleSourceDeclaration(document.content || '');
  // Oracle keys: unquoted names are upper case; a quoted mixed-case name is not supported by the debugger.
  const upper = /^[A-Z][A-Z0-9_$#]*$/;
  if (!declaration || !DEBUGGABLE.includes(declaration.type) || !upper.test(declaration.nameKey) || declaration.ownerKey && !upper.test(declaration.ownerKey)) return null;
  return { owner: declaration.ownerKey || null, name: declaration.nameKey, type: declaration.type, firstLine: lineOf(document.content || '', declaration.start) };
}

export const toDatabaseLine = (unit, editorLine) => editorLine - unit.firstLine + 1;
export const toEditorLine = (unit, databaseLine) => databaseLine + unit.firstLine - 1;

export const sameUnit = (unit, location) => !!unit && !!location && unit.name === location.name && unit.type === location.type && (!unit.owner || !location.owner || unit.owner === location.owner);

export function toggleBreakpoint(lines = [], line) {
  return lines.includes(line) ? lines.filter(item => item !== line) : [...lines, line].sort((a, b) => a - b);
}

// Keeps breakpoints on their statements while text is edited. A change
// replaces startLine..endLine with text of insertedLines line breaks.
export function shiftBreakpoints(lines = [], changes = []) {
  let result = [...lines];
  for (const change of [...changes].sort((a, b) => b.startLine - a.startLine)) {
    const removed = change.endLine - change.startLine, delta = change.insertedLines - removed;
    if (!delta && !removed) continue;
    result = result.flatMap(line => line <= change.startLine ? [line] : line <= change.endLine ? [] : [line + delta]);
  }
  return [...new Set(result)].sort((a, b) => a - b);
}

// Names whose values are asked for at a paused line. Over-asking is harmless:
// the debugger leaves out names that are not in scope there.
export function debugVariableNames(source, editorLine) {
  const lines = (source || '').split('\n');
  if (editorLine < 1 || editorLine > lines.length) return [];
  const offset = lines.slice(0, editorLine - 1).reduce((sum, line) => sum + line.length + 1, 0) + Math.max(0, lines[editorLine - 1].search(/\S|$/));
  try {
    return plsqlVisibleSymbols(source, offset)
      .filter(symbol => ['variable', 'parameter', 'iterator', 'constant'].includes(symbol.kind) && PLAIN.test(symbol.name))
      .map(symbol => symbol.name.toUpperCase());
  } catch { return []; }
}

export function debugBreakpoints(tabs, breakpointsByTab) {
  const units = [];
  for (const tab of tabs) {
    const lines = breakpointsByTab[tab.id];
    if (!lines?.length) continue;
    const unit = debugUnit(tab);
    if (unit) units.push({ tabId: tab.id, unit, lines: lines.map(line => toDatabaseLine(unit, line)).filter(line => line > 0) });
  }
  return units;
}
