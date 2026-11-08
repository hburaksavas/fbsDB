import { useEffect, useMemo, useState } from 'react';
import { Feedback } from './Feedback';
import { gitChangeGroups, gitDiffLines, gitStatusLabel } from './gitDiffLines.js';

function DiffView({ title, text }) {
  const rows = useMemo(() => gitDiffLines(text), [text]);
  if (!rows.length) return null;
  return <div className="git-diff-block"><strong>{title}</strong><pre className="git-diff" aria-label={title}>{rows.map((row, index) => <div key={index} className={`git-diff-${row.kind}`}><span className="git-diff-number">{row.oldLine ?? ''}</span><span className="git-diff-number">{row.newLine ?? ''}</span><span className="git-diff-sign">{row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ''}</span>{row.text || ' '}</div>)}</pre></div>;
}

// Changed SQL files of the workspace: stage, unstage, review the staged and unstaged diff and commit what is staged.
export function WorkspaceGitPanel({ state, onRefresh, onDiff, onStage, onUnstage, onCommit, onOpenFile }) {
  const git = state.git, files = useMemo(() => (git?.files || []).map(file => ({ ...file, index: file.index || '', workTree: file.workTree || '' })), [git]);
  const groups = useMemo(() => gitChangeGroups(files), [files]);
  const [selected, setSelected] = useState(null), [message, setMessage] = useState('');
  const current = files.find(file => file.path === selected);
  useEffect(() => { if (selected && !current) setSelected(null); }, [selected, current]);
  // A stage, unstage or commit changes the diff of the selected file, so it is read again.
  useEffect(() => { if (selected && current) onDiff(selected); }, [git]);
  useEffect(() => { if (state.committed) setMessage(''); }, [state.committed]);
  const select = path => { setSelected(path); onDiff(path); };
  const diff = state.diff && current && state.diff.path?.toLowerCase() === current.path.toLowerCase() ? state.diff : null;
  const other = git?.otherStaged || [];
  const list = (items, staged) => items.length ? <ul className="git-file-list">{items.map(file => <li key={(staged ? 's:' : 'w:') + file.path} aria-selected={selected === file.path}>
    <button type="button" className="git-file-name" title={file.path} onClick={() => select(file.path)}><span>{file.relativePath}</span><small>{gitStatusLabel(staged ? file.index : file.workTree || file.index)}</small></button>
    <button type="button" className="button-secondary" aria-label={`${staged ? 'Unstage' : 'Stage'} ${file.relativePath}`} disabled={state.busy} onClick={() => staged ? onUnstage([file.path]) : onStage([file.path])}>{staged ? '−' : '+'}</button>
  </li>)}</ul> : <p className="git-empty">{staged ? 'Nothing staged.' : 'No other changes in SQL files.'}</p>;
  return <>
    <div className="workspace-dev-actions"><button className="button-secondary" disabled={state.busy} onClick={onRefresh}>Refresh Git status</button>{git?.message && <Feedback kind="info" title="Workspace Git">{git.message}</Feedback>}</div>
    {git?.repository && <>
      <div className="workspace-dev-content git-panel">
        <nav aria-label="Changed SQL files">
          <div className="git-group-head"><strong>Staged ({groups.staged.length})</strong><button type="button" className="button-secondary" disabled={state.busy || !groups.staged.length} onClick={() => onUnstage(groups.staged.map(file => file.path))}>Unstage all</button></div>
          {list(groups.staged, true)}
          <div className="git-group-head"><strong>Changes ({groups.changes.length})</strong><button type="button" className="button-secondary" disabled={state.busy || !groups.changes.length} onClick={() => onStage(groups.changes.map(file => file.path))}>Stage all</button></div>
          {list(groups.changes, false)}
        </nav>
        <section className="git-diff-section">
          {current ? <>
            <div className="git-diff-head"><strong>{current.relativePath}</strong><button type="button" className="button-secondary" onClick={() => onOpenFile(current.path)}>Open file</button></div>
            {diff && <p className="git-commit-info">{diff.commit}</p>}
            {diff ? (diff.staged || diff.unstaged) ? <><DiffView title="Staged changes" text={diff.staged}/><DiffView title="Changes not staged" text={diff.unstaged}/></> : <pre>{diff.diff || 'No differences.'}</pre> : <p role="status">Reading the diff…</p>}
            <p className="git-hint">To compare the file with its definition in the database, open it and use Compare and compile.</p>
          </> : <p>Select a changed SQL file to see its staged and unstaged changes.</p>}
        </section>
      </div>
      <div className="git-commit-box">
        <label>Commit message<textarea rows={3} value={message} onChange={event => setMessage(event.target.value)} placeholder="Describe the change"/></label>
        {other.length > 0 && <Feedback kind="warning" title="Other staged files">{`${other.length} staged file${other.length === 1 ? ' is' : 's are'} not in this list and will be committed too: ${other.slice(0, 5).join(', ')}${other.length > 5 ? '…' : ''}`}</Feedback>}
        {state.committed && <Feedback kind="success" title="Committed">{`${state.committed.hash} · ${state.committed.subject}`}</Feedback>}
        <div className="git-commit-actions"><small>Git hooks run as usual. Nothing is pushed.</small><button type="button" className="button-primary" disabled={state.busy || !message.trim() || !groups.staged.length && !other.length} onClick={() => onCommit(message)}>Commit staged changes</button></div>
      </div>
    </>}
  </>;
}
