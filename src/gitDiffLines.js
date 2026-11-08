// Unified diff text as display rows with old/new line numbers; file headers are dropped and hunks keep their header.
export function gitDiffLines(text) {
  const rows = []; let oldLine = 0, newLine = 0;
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); rows.push({ kind: 'hunk', text: line }); continue; }
    if (/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename from|rename to|old mode|new mode)/.test(line) || !rows.length && !line) continue;
    if (line.startsWith('\\')) { rows.push({ kind: 'note', text: line.slice(2) }); continue; }
    if (line.startsWith('+')) rows.push({ kind: 'add', newLine: newLine++, text: line.slice(1) });
    else if (line.startsWith('-')) rows.push({ kind: 'remove', oldLine: oldLine++, text: line.slice(1) });
    else if (line.startsWith(' ')) rows.push({ kind: 'context', oldLine: oldLine++, newLine: newLine++, text: line.slice(1) });
  }
  return rows;
}

// Files in the Staged and Changes lists; a file with both kinds of change is in both.
export function gitChangeGroups(files) {
  const staged = [], changes = [];
  for (const file of files || []) {
    if (file.index) staged.push(file);
    if (file.workTree || !file.index && file.status) changes.push(file);
  }
  const byPath = (a, b) => a.relativePath.localeCompare(b.relativePath);
  return { staged: staged.sort(byPath), changes: changes.sort(byPath) };
}

export const gitStatusLabel = code => ({ M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', U: 'conflict', '?': 'untracked', T: 'type changed' })[code] || code || '';
