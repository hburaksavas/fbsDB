import { useEffect, useMemo, useRef, useState } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';
import { sendNativeCommand, subscribeNativeMessages } from './nativeBridge';
import { pathKey } from './workspaceTree';
import { buildReferenceIndex, callHierarchyLevel, dynamicSitesOf, mergeIndexSources, routineAt, routineLabel } from './plsqlReferenceIndex.js';

const kindLabel = routine => routine?.anonymous ? 'block' : routine?.local ? `local ${routine.kind.toLowerCase()}` : routine?.kind?.toLowerCase() || '';
const plural = (count, one, many = `${one}s`) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

function positionIn(content, offset) {
  const before = String(content || '').slice(0, offset), line = before.split('\n').length;
  return { lineNumber: line, column: offset - before.lastIndexOf('\n') };
}

function HierarchyNode({ index, group, direction, ancestors, open, depth }) {
  const [expanded, setExpanded] = useState(false), routine = group.routine;
  const recursive = ancestors.includes(routine.id);
  const children = useMemo(() => expanded ? callHierarchyLevel(index, routine.id, direction) : [], [expanded, index, routine.id, direction]);
  return <li role="treeitem" aria-expanded={recursive ? undefined : expanded} aria-level={depth}>
    <div className="call-hierarchy-row">
      <button type="button" className="call-hierarchy-toggle" disabled={recursive} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${routineLabel(routine)}`} onClick={() => setExpanded(value => !value)}>{recursive ? '↻' : expanded ? '▾' : '▸'}</button>
      <button type="button" className="call-hierarchy-name" title="Go to the routine" onClick={() => open(routine.declarations.find(item => item.part === 'body') || routine.declarations[0])}><strong>{routineLabel(routine)}</strong></button>
      <small>{kindLabel(routine)}{recursive ? ' · already shown above (recursion)' : ''}{group.ambiguous ? ' · ambiguous: the name also matches other routines' : ''}</small>
      <span className="call-hierarchy-sites">{plural(group.sites.length, 'call')}:{group.sites.slice(0, 8).map(site => <button type="button" key={`${site.path}:${site.start}`} title={`${site.path}, line ${site.line}`} onClick={() => open(site)}>line {site.line}</button>)}{group.sites.length > 8 ? ` +${group.sites.length - 8}` : ''}</span>
    </div>
    {expanded && !recursive && (children.length ? <ul role="group">{children.map(child => <HierarchyNode key={child.routine.id} index={index} group={child} direction={direction} ancestors={[...ancestors, routine.id]} open={open} depth={depth + 1}/>)}</ul> : <p className="call-hierarchy-empty">{direction === 'incoming' ? 'No callers found in the indexed files.' : 'No calls to indexed routines.'}</p>)}
  </li>;
}

export function CallHierarchyDialog({ root, document, documents, offset, onOpen, onClose }) {
  const ref = useRef(null); useDialogFocus(ref, onClose);
  const [state, setState] = useState(() => ({ busy: Boolean(root), files: [], skipped: [], truncated: false }));
  const [direction, setDirection] = useState('incoming');
  useEffect(() => {
    if (!root) return undefined;
    let request;
    const unsubscribe = subscribeNativeMessages(message => {
      if (message.requestId !== request) return;
      if (message.type === 'workspace.sources' && pathKey(message.sources.root) === pathKey(root)) setState({ ...message.sources, busy: false });
      else if (message.type.endsWith('.error') || message.type === 'error') setState({ busy: false, files: [], skipped: [], truncated: false, error: message.message || 'Workspace sources could not be read.' });
    });
    request = sendNativeCommand('workspace.sources', { root });
    if (!request) setState({ busy: false, files: [], skipped: [], truncated: false });
    return unsubscribe;
  }, [root]);
  const activePath = document?.path || `Unsaved: ${document?.title || 'SQL'}`;
  const sources = useMemo(() => mergeIndexSources(state.files, [...(documents || []).filter(item => pathKey(item.path || '') !== pathKey(activePath)), { path: activePath, content: document?.content || '', dirty: document?.dirty }]), [state.files, documents, document, activePath]);
  const index = useMemo(() => state.busy ? null : buildReferenceIndex(sources, { skipped: state.skipped || [], truncated: state.truncated }), [state.busy, sources, state.skipped, state.truncated]);
  const target = useMemo(() => index && routineAt(index, activePath, offset), [index, activePath, offset]);
  const level = useMemo(() => index && target ? callHierarchyLevel(index, target.id, direction) : [], [index, target, direction]);
  const contents = useMemo(() => new Map(sources.map(file => [pathKey(file.path), file.content])), [sources]);
  const open = place => { if (!place?.path || place.path.startsWith('Unsaved: ')) { onOpen({ path: null, start: place?.start ?? 0 }); return; } onOpen({ path: place.path, start: place.start, ...positionIn(contents.get(pathKey(place.path)), place.start) }); };
  const dynamic = index && target ? dynamicSitesOf(index, target.id) : [];
  const unsaved = sources.filter(file => file.unsaved).length;
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal call-hierarchy-dialog" role="dialog" aria-modal="true" aria-label="Call hierarchy">
    <header className="appearance-header"><h2>Call hierarchy</h2></header>
    {state.busy ? <p role="status">Reading workspace sources…</p> : state.error ? <p role="alert">{state.error}</p> : !target ? <p role="status">Place the caret inside a procedure, function, package, trigger or block, or on a call to one.</p> : <>
      <div className="call-hierarchy-head">
        <strong>{routineLabel(target)}</strong><small>{kindLabel(target)}</small>
        <div role="group" aria-label="Direction" className="call-hierarchy-direction">
          <button type="button" aria-pressed={direction === 'incoming'} onClick={() => setDirection('incoming')}>Callers</button>
          <button type="button" aria-pressed={direction === 'outgoing'} onClick={() => setDirection('outgoing')}>Calls</button>
        </div>
      </div>
      {level.length ? <ul role="tree" aria-label={direction === 'incoming' ? `Callers of ${routineLabel(target)}` : `Calls from ${routineLabel(target)}`} className="call-hierarchy-tree">{level.map(group => <HierarchyNode key={group.routine.id} index={index} group={group} direction={direction} ancestors={[target.id]} open={open} depth={1}/>)}</ul>
        : <p role="status">{direction === 'incoming' ? 'No callers found in the indexed files.' : 'No calls to indexed routines.'}</p>}
      {dynamic.length > 0 && <details className="call-hierarchy-dynamic"><summary>{plural(dynamic.length, 'dynamic SQL site')} in this routine not analysed</summary><ul>{dynamic.map(site => <li key={site.start}><button type="button" onClick={() => open(site)}>{site.kind} · line {site.line}</button></li>)}</ul></details>}
    </>}
    {index && <div className="call-hierarchy-scope" role="note">
      <p>Built from {plural(index.fileCount, 'file')} {root ? 'in the workspace and open editors' : 'open in editors (no workspace is open)'}{unsaved ? `, including ${plural(unsaved, 'unsaved editor')}` : ''}; the database is not queried. A call to a name that several routines share is listed under each of them as ambiguous, and overloads of one name are not told apart. Names declared in no indexed file are not shown.</p>
      {(index.truncated || index.skipped.length > 0) && <details><summary>Partial: {index.truncated ? 'the 300-file, 1 MB per file or 8 MB limit was reached; ' : ''}{plural(index.skipped.length, 'file')} skipped</summary><ul>{index.skipped.map(item => <li key={item}>{item}</li>)}</ul></details>}
      {index.problems.length > 0 && <details><summary>{plural(index.problems.length, 'file')} could not be read completely; calls in them may be missing</summary><ul>{index.problems.map(item => <li key={item.path}>{item.path}: {item.errors.join(' ')}</li>)}</ul></details>}
    </div>}
    <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
