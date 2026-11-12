// Editor commands that appear both in the command palette and in the editor's context menu. Each is described once here; the palette and
// the menu take their label and their enabled state from this table, and the workbench supplies one runner per id.
// writes: changes the document, so it is off for a read-only tab. selection: the menu offers it only for a selection.
// workspace: needs the desktop host and an open workspace instead.
export const editorCommands = Object.freeze({
  identifierCase: { label: 'Convert identifier case (snake_case, camelCase, UPPER_CASE)', menuLabel: 'Convert identifier case…', writes: true, selection: true },
  localRename: { label: 'Rename local variable or parameter', menuLabel: 'Rename local variable or parameter…', writes: true },
  changeSignature: { label: 'Change local procedure signature', menuLabel: 'Change local procedure signature…', writes: true },
  extractProcedure: { label: 'Extract selected PL/SQL assignments into procedure', menuLabel: 'Extract selected PL/SQL assignments…', writes: true, selection: true },
  moveUp: { label: 'Move SQL item or PL/SQL statement up', writes: true },
  moveDown: { label: 'Move SQL item or PL/SQL statement down', writes: true },
  embeddedSql: { label: 'Edit static SQL inside EXECUTE IMMEDIATE', menuLabel: 'Edit SQL inside EXECUTE IMMEDIATE…', writes: true },
  quickFix: { label: 'Quick fixes for compiler diagnostic', menuLabel: 'Quick fixes…', detail: 'Alt+Enter', writes: true },
  deleteReview: { label: 'Review references before deleting local procedure or parameter', menuLabel: 'Review references before delete…', workspace: true },
  pasteAs: { label: 'Paste as IN list, JSON_TABLE draft or INSERT template', menuLabel: 'Paste as…', writes: true },
  explainExpression: { label: 'Explain CASE or analytic function at caret', menuLabel: 'Explain CASE or analytic function…' },
  docComment: { label: 'Generate documentation comment for the routine at the cursor', menuLabel: 'Generate documentation comment', writes: true },
  extractCte: { label: 'Extract selected subquery into a CTE', menuLabel: 'Extract query into CTE', writes: true, selection: true },
  columnCursors: { label: 'Paste column names as multiple cursors', menuLabel: 'Paste column names as cursors', writes: true },
  surround: { label: 'Surround selection with block, IF, loop or timing', menuLabel: 'Surround with…', writes: true, selection: true },
});

const definition = id => { const command = editorCommands[id]; if (!command) throw new Error(`Unknown editor command: ${id}`); return command; };

// Palette entry. The palette acts on the active tab, so only read-only state and workspace availability switch a command off.
export function paletteEditorCommand(id, { readOnly = false, workspaceReady = false } = {}, run) {
  const command = definition(id);
  return {
    id, label: command.label,
    ...(command.detail ? { detail: command.detail } : {}),
    ...(command.workspace ? { disabled: !workspaceReady } : command.writes ? { disabled: Boolean(readOnly) } : {}),
    run,
  };
}

// Context menu entry for the place that was right-clicked: commands that need a selection are off without one.
export function menuEditorCommand(id, { readOnly = false, selected = false, workspaceReady = false } = {}) {
  const command = definition(id);
  return {
    id, label: command.menuLabel || command.label,
    ...(command.workspace ? { disabled: !workspaceReady } : command.writes ? { disabled: Boolean(readOnly) || Boolean(command.selection) && !selected } : {}),
  };
}
