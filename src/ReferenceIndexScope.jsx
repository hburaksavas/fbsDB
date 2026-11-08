const plural = (count, one, many = `${one}s`) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

// What an index-based answer was built from, and what it may be missing.
export function ReferenceIndexScope({ index, hasWorkspace, unsaved, children }) {
  if (!index) return null;
  return <div className="call-hierarchy-scope" role="note">
    <p>Built from {plural(index.fileCount, 'file')} {hasWorkspace ? 'in the workspace and open editors' : 'open in editors (no workspace is open)'}{unsaved ? `, including ${plural(unsaved, 'unsaved editor')}` : ''}; the database is not queried. {children}</p>
    {(index.truncated || index.skipped.length > 0) && <details><summary>Partial: {index.truncated ? 'the 300-file, 1 MB per file or 8 MB limit was reached; ' : ''}{plural(index.skipped.length, 'file')} skipped</summary><ul>{index.skipped.map(item => <li key={item}>{item}</li>)}</ul></details>}
    {index.problems.length > 0 && <details><summary>{plural(index.problems.length, 'file')} could not be read completely; matches in them may be missing</summary><ul>{index.problems.map(item => <li key={item.path}>{item.path}: {item.errors.join(' ')}</li>)}</ul></details>}
  </div>;
}
