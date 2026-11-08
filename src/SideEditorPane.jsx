import { lazy, Suspense } from 'react';

const Editor = lazy(() => import('./monacoEditor.js'));

// A second editor beside the main one, showing any open document, the active one included. It edits the document's text
// (marking it unsaved, as the main editor does); running, results and the session stay with the main editor's tab.
export function SideEditorPane({ tabs, tabId, onTab, onChange, onClose, theme, options }) {
  const tab = tabs.find(item => item.id === tabId) || tabs[0];
  if (!tab) return null;
  return <section className="side-editor-pane" aria-label="Side editor">
    <header>
      <select aria-label="Document in the side editor" value={tab.id} onChange={event => onTab(event.target.value)}>
        {tabs.map(item => <option key={item.id} value={item.id}>{item.name || 'Untitled.sql'}{item.dirty ? ' •' : ''}{item.readOnly ? ' (read-only)' : ''}</option>)}
      </select>
      <small title="Run, results and the database session always belong to the main editor's tab.">Editing only</small>
      <button type="button" className="icon-button" aria-label="Close side editor" title="Close side editor" onClick={onClose}>×</button>
    </header>
    <div className="side-editor-body">
      <Suspense fallback={<div className="editor-loading">Loading editor…</div>}>
        <Editor height="100%" defaultLanguage="sql" path={`fbsdb-side/${tab.id}`} value={tab.content ?? ''} onChange={value => onChange(tab.id, value ?? '')} theme={theme} options={{ ...options, readOnly: Boolean(tab.readOnly) }}/>
      </Suspense>
    </div>
  </section>;
}
