import { useMemo, useRef, useState } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';
import { routineLabel } from './plsqlReferenceIndex.js';
import { structuralKinds, structuralSearch } from './structuralSearch.js';
import { useWorkspaceReferenceIndex } from './useWorkspaceReferenceIndex.js';
import { ReferenceIndexScope } from './ReferenceIndexScope.jsx';

const plural = (count, one, many = `${one}s`) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
const kindLabel = routine => routine?.anonymous ? (routine.kind === 'STATEMENT' ? 'statement' : 'block') : routine?.local ? `local ${routine.kind.toLowerCase()}` : routine?.kind?.toLowerCase() || '';

// Finds routines by what their static SQL and exception handlers do, across workspace files and open editors.
export function StructuralSearchDialog({ root, document, documents, initialName = '', onOpen, onClose }) {
  const ref = useRef(null); useDialogFocus(ref, onClose);
  const { busy, error, index, open, unsaved, hasWorkspace } = useWorkspaceReferenceIndex({ root, document, documents, onOpen });
  const [kind, setKind] = useState('writes'), [name, setName] = useState(initialName), [unhandledOnly, setUnhandledOnly] = useState(false), [query, setQuery] = useState(null);
  const result = useMemo(() => index && query ? structuralSearch(index, query.kind, query.name, { unhandledOnly: query.unhandledOnly }) : null, [index, query]);
  const selected = structuralKinds.find(item => item.id === kind);
  const submit = event => { event.preventDefault(); setQuery({ kind, name, unhandledOnly: kind === 'handles' && unhandledOnly }); };
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal call-hierarchy-dialog structural-search-dialog" role="dialog" aria-modal="true" aria-label="Structural search">
    <header className="appearance-header"><h2>Structural search</h2></header>
    <form className="structural-search-form" onSubmit={submit}>
      <select aria-label="Search for" value={kind} onChange={event => { setKind(event.target.value); setQuery(null); }}>{structuralKinds.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <input aria-label="Name to search" placeholder={selected.placeholder} value={name} onChange={event => setName(event.target.value)} data-settings-autofocus/>
      {kind === 'handles' && <label><input type="checkbox" checked={unhandledOnly} onChange={event => setUnhandledOnly(event.target.checked)}/> Only handlers that do not raise again</label>}
      <button type="submit" className="button-primary" disabled={busy || !index}>Search</button>
    </form>
    {busy ? <p role="status">Reading workspace sources…</p> : error ? <p role="alert">{error}</p> : result?.error ? <p role="alert">{result.error}</p> : result && <>
      <p role="status" className="structural-search-summary">{result.results.length ? `${plural(result.sites, 'match', 'matches')} in ${plural(result.results.length, 'routine')}` : 'No matches in the indexed files.'}{result.results.some(group => group.possible) ? ' Routines marked "check" match only by an unqualified name and need a look.' : ''}</p>
      {result.results.length > 0 && <ul className="structural-search-results" aria-label="Structural search results">{result.results.map(group => <li key={group.routine.id}>
        <div className="call-hierarchy-row">
          <button type="button" className="call-hierarchy-name" title="Go to the routine" onClick={() => open(group.routine.declarations.find(item => item.part === 'body') || group.routine.declarations[0])}><strong>{routineLabel(group.routine)}</strong></button>
          <small>{kindLabel(group.routine)}{group.possible ? ' · check' : ''}</small>
        </div>
        <ul>{group.sites.map(site => <li key={`${site.path}:${site.start}`}><button type="button" className="structural-search-site" title={site.path} onClick={() => open(site)}>line {site.line}</button> <span>{site.detail}{site.possible ? ' · check' : ''}</span></li>)}</ul>
      </li>)}</ul>}
      {result.dynamicRoutines.length > 0 && <details className="call-hierarchy-dynamic"><summary>{plural(result.dynamicRoutines.length, 'routine')} also run dynamic SQL, which is not searched</summary><ul>{result.dynamicRoutines.map(routine => <li key={routine.id}><button type="button" onClick={() => open(routine.declarations.find(item => item.part === 'body') || routine.declarations[0])}>{routineLabel(routine)}</button></li>)}</ul></details>}
    </>}
    <ReferenceIndexScope index={index} hasWorkspace={hasWorkspace} unsaved={unsaved}>Static SQL in PL/SQL code and in script statements is read; SQL inside strings is not. Synonyms and views are not followed, and a column written without its table is shown as a possible match for the tables of its statement.</ReferenceIndexScope>
    <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
