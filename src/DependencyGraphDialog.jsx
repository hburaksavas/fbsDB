import { useMemo, useRef, useState } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';
import { buildDependencyGraph, dependencyNeighbors, dependencyObjectAt, edgeLabel } from './dependencyGraph.js';
import { useWorkspaceReferenceIndex } from './useWorkspaceReferenceIndex.js';
import { ReferenceIndexScope } from './ReferenceIndexScope.jsx';

const ROW = 40, SHOWN = 40;
const kindText = object => object.kind === 'SCRIPT' ? 'script' : object.kind.toLowerCase();

function NodeButton({ group, side, onFocus, onOpen }) {
  const object = group.object, kinds = [...new Set(group.kinds)].map(kind => edgeLabel[kind]).join(' · ');
  return <li className={`dependency-node${object.external ? ' is-external' : ''}`} data-side={side}>
    <button type="button" className="dependency-node-name" title={`Focus ${object.label}`} onClick={() => onFocus(object)}><strong>{object.label}</strong><small>{kindText(object)}{object.external ? ' · not created in the workspace' : ''}</small></button>
    <small className="dependency-node-edge">{kinds}{group.ambiguous ? ' · ambiguous name' : ''}</small>
    {group.sites[0] && <button type="button" className="dependency-node-site" title={`${group.sites[0].path}, line ${group.sites[0].line ?? ''}`} onClick={() => onOpen(group.sites[0])}>{group.sites.length > 1 ? `${group.sites.length} places` : 'line ' + (group.sites[0].line ?? '')}</button>}
  </li>;
}

// One object in the middle, what uses it on the left and what it uses on the right; choosing a neighbour moves the focus to it.
export function DependencyGraphDialog({ root, document, documents, offset, onOpen, onClose }) {
  const ref = useRef(null); useDialogFocus(ref, onClose);
  const { busy, error, index, activePath, open, unsaved, hasWorkspace } = useWorkspaceReferenceIndex({ root, document, documents, onOpen });
  const graph = useMemo(() => index ? buildDependencyGraph(index) : null, [index]);
  const start = useMemo(() => graph ? dependencyObjectAt(graph, index, activePath, offset) : null, [graph, index, activePath, offset]);
  const [history, setHistory] = useState([]);
  const focus = history.at(-1) ? graph?.objects.get(history.at(-1)) : start;
  const neighbors = useMemo(() => graph && focus ? dependencyNeighbors(graph, focus.key) : { uses: [], usedBy: [] }, [graph, focus]);
  const moveTo = object => setHistory(list => [...list, object.key]);
  const openDefinition = object => { const definition = object.definitions.find(item => item.part === 'body') || object.definitions[0]; if (definition) open(definition); };
  const left = neighbors.usedBy.slice(0, SHOWN), right = neighbors.uses.slice(0, SHOWN);
  const rows = Math.max(left.length, right.length, 1), height = rows * ROW, middle = height / 2;
  const curve = (x1, y1, x2, y2) => `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal call-hierarchy-dialog dependency-graph-dialog" role="dialog" aria-modal="true" aria-label="Dependency graph">
    <header className="appearance-header"><h2>Dependency graph</h2></header>
    {busy ? <p role="status">Reading workspace sources…</p> : error ? <p role="alert">{error}</p> : !focus ? <p role="status">Place the caret inside a package, routine, trigger or CREATE statement, or on a table, view or sequence name.</p> : <>
      <div className="call-hierarchy-head">
        <button type="button" className="button-secondary" disabled={!history.length} onClick={() => setHistory(list => list.slice(0, -1))}>Back</button>
        <strong>{focus.label}</strong><small>{kindText(focus)}{focus.external ? ' · not created in the workspace' : ''}</small>
        {focus.definitions.length > 0 && <button type="button" className="button-secondary" onClick={() => openDefinition(focus)}>Open definition</button>}
        <span className="dependency-counts">{neighbors.usedBy.length} used by · uses {neighbors.uses.length}</span>
      </div>
      <div className="dependency-graph" style={{ height: height + 8 }}>
        <svg className="dependency-lines" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {left.map((group, i) => <path key={'l' + group.object.key} d={curve(34, i * ROW + ROW / 2, 40, middle)} className={group.object.external ? 'is-external' : ''}/>)}
          {right.map((group, i) => <path key={'r' + group.object.key} d={curve(60, middle, 66, i * ROW + ROW / 2)} className={group.object.external ? 'is-external' : ''}/>)}
        </svg>
        <ul className="dependency-column dependency-left" aria-label={`Objects that use ${focus.label}`}>{left.length ? left.map(group => <NodeButton key={group.object.key} group={group} side="left" onFocus={moveTo} onOpen={open}/>) : <li className="dependency-empty">Nothing in the indexed files uses it.</li>}</ul>
        <div className="dependency-focus" style={{ top: Math.max(0, middle - ROW / 2) }}><strong>{focus.label}</strong><small>{kindText(focus)}</small></div>
        <ul className="dependency-column dependency-right" aria-label={`Objects ${focus.label} uses`}>{right.length ? right.map(group => <NodeButton key={group.object.key} group={group} side="right" onFocus={moveTo} onOpen={open}/>) : <li className="dependency-empty">It uses nothing found in the indexed files.</li>}</ul>
      </div>
      {(neighbors.usedBy.length > SHOWN || neighbors.uses.length > SHOWN) && <p role="note">Only the first {SHOWN} objects on each side are drawn.</p>}
    </>}
    <ReferenceIndexScope index={index} hasWorkspace={hasWorkspace} unsaved={unsaved}>Objects referenced but not created in any indexed file are drawn dashed as "not created in the workspace". A name that matches several objects links to each of them. Synonyms are shown with their target, but references are not redirected through them; grants, database dependencies and dynamic SQL are not followed.</ReferenceIndexScope>
    <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
