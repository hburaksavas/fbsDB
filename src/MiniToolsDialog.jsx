import {ResultFailure} from './ResultStatus.jsx';
import {useFeedbackState,Feedback} from './Feedback';
import { useEffect, useRef, useState } from 'react';
import { Play, Save, X } from 'lucide-react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';
import { isNativeHost, sendNativeCommand, subscribeNativeMessages } from './nativeBridge';
import { bindTypes } from './bindDefinitions';
import { miniToolFromResult, normalizeMiniTool, validateToolName } from './miniTools';

export function MiniToolsDialog({ root, tabId, sourceResult, result, profiles, profile, connected, busy, status, outcome, onConnect, onRun, onCancelRun, onFetchMore, onClose }) {
  const ref = useRef(null), requests = useRef(new Map());
  useDialogFocus(ref, onClose);
  const [tools, setTools] = useState([]), [draft, setDraft] = useState(null), [values, setValues] = useState({});
  const [notice, setNotice] = useState(''), [error, setError] = useFeedbackState('',{title:'SQL mini tools'}), [saving, setSaving] = useState(false);
  const [runId, setRunId] = useState(null), [renaming, setRenaming] = useState(null), renamingRef = useRef(null);
  renamingRef.current = renaming;
  const command = (name, payload = {}) => {
    const id = sendNativeCommand(name, { ...payload, root, tabId });
    if (id) requests.current.set(id, name);
    return id;
  };
  useEffect(() => {
    const unsubscribe = subscribeNativeMessages(message => {
      const operation = requests.current.get(message.requestId);
      if (!operation) return;
      requests.current.delete(message.requestId);
      if (message.type === 'workspace.error' || message.type === 'host.error') { if (renamingRef.current) setRenaming({ ...renamingRef.current, error: message.message, saving: false }); else setError(message.message); setSaving(false); return; }
      if (message.root !== root) return;
      if (operation === 'workspace.tools.list') {
        const valid = [];
        const errors = [...(message.catalog?.errors || [])];
        for (const tool of message.catalog?.tools || []) {
          try { valid.push(normalizeMiniTool(tool)); } catch (e) { errors.push(`${tool.name}: ${e.message}`); }
        }
        setTools(valid); if (errors.length) setError(errors.join('\n'));
      } else if (operation === 'workspace.tools.save') {
        const tool = normalizeMiniTool(message.tool);
        setDraft(tool); setTools(current => [...current.filter(t => t.id !== tool.id), tool]);
        setSaving(false); setRenaming(null); setNotice('Saved SQL and view definition without values, results, or connection details.');
      }
    });
    if (isNativeHost && root) command('workspace.tools.list');
    return unsubscribe;
  }, [root, tabId]);
  useEffect(() => { setValues({}); setRunId(null); }, [profile?.id]);
  const choose = tool => { setDraft(tool); setValues({}); setRunId(null); setError(''); setNotice(''); };
  const change = patch => { setDraft(current => ({ ...current, ...patch })); if ('sql' in patch) setRunId(null); setNotice(''); setError(''); };
  const fields = (() => { try { return draft ? normalizeMiniTool({ ...draft, name: draft.name || 'Untitled' }).fields : []; } catch { return draft?.fields || []; } })();
  const updateField = (name, patch) => change({ fields: fields.map(f => f.name === name ? { ...f, ...patch } : f) });
  const save = () => {
    try { const tool = normalizeMiniTool({ ...draft, fields }); setError(''); setSaving(true); command('workspace.tools.save', { tool }); }
    catch (e) { setError(e.message); }
  };
  const run = event => {
    event.preventDefault();
    try {
      const tool = normalizeMiniTool({ ...draft, fields }); setError(''); setNotice('');
      const id = onRun(tool.sql, tool.fields.map(f => ({ name: f.name, type: f.type, value: values[f.name] || null })));
      setRunId(id);
    } catch (e) { setError(e.message); }
  };
  const currentResult = runId && result?.requestId === runId ? result : null;
  const columnIndices = (currentResult?.columns || []).map((c, i) => ({ c, i })).filter(({ c, i }) => {
    const saved = draft.columns[i]; return !saved || saved.name !== c.name || saved.visible;
  });
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal mini-tools-modal" role="dialog" aria-modal="true" aria-labelledby="mini-tools-title">
    <header className="appearance-header"><div><div className="eyebrow">SQL TOOLKIT</div><h2 id="mini-tools-title">SQL mini tools</h2><p>Share .fbsdb/tools with your workspace. Each user connects with their own Oracle profile.</p></div><button className="icon-button" aria-label="Close mini tools" onClick={onClose}><X size={17}/></button></header>
    <div className="mini-tools-body"><aside aria-label="Workspace mini tools">
      <button className="button-secondary" disabled={!root || !isNativeHost || busy || saving} onClick={() => { try { choose(miniToolFromResult(sourceResult)); } catch (e) { setError(e.message); } }}>Save SELECT as tool</button>
      {tools.map(tool => renaming?.id === tool.id
        ? <span key={tool.id} className="mini-tool-rename"><input autoFocus data-escape-local aria-label="Tool name" aria-invalid={Boolean(renaming.error) || undefined} disabled={renaming.saving} value={renaming.value} onChange={event => setRenaming({ ...renaming, value: event.target.value, error: '' })} onFocus={event => event.target.select()} onBlur={() => { if (!renaming.saving) setRenaming(null); }} onKeyDown={event => {
            event.stopPropagation();
            if (event.key === 'Escape') { event.preventDefault(); setRenaming(null); }
            if (event.key === 'Enter') {
              event.preventDefault();
              const checked = validateToolName(tools, renaming.value, tool.id);
              if (checked.error) { setRenaming({ ...renaming, error: checked.error }); return; }
              if (checked.name === tool.name) { setRenaming(null); return; }
              try { const renamed = normalizeMiniTool({ ...tool, name: checked.name }); setRenaming({ ...renaming, error: '', saving: true }); command('workspace.tools.save', { tool: renamed }); } catch (e) { setRenaming({ ...renaming, error: e.message }); }
            }
          }}/>{renaming.error && <small role="alert">{renaming.error}</small>}</span>
        : <button key={tool.id} disabled={busy || saving} className={`mini-tool-item ${draft?.id === tool.id ? 'selected' : ''}`} title="F2 or double-click to rename" onClick={() => choose(tool)} onDoubleClick={() => setRenaming({ id: tool.id, value: tool.name, error: '' })} onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); setRenaming({ id: tool.id, value: tool.name, error: '' }); } }}>{tool.name}</button>)}
      {!tools.length && <p>No saved tools in this workspace.</p>}
    </aside><div className="mini-tool-content">
      {!isNativeHost || !root ? <p>Open a workspace in the desktop app to save and run mini tools.</p> : !draft ? <p>Select a saved tool, or run a SELECT and choose “Save SELECT as tool”. Opening a tool does not execute SQL.</p> : <>
        <label>Tool name<input value={draft.name} maxLength={100} disabled={busy || saving} onChange={e => change({ name: e.target.value })}/></label>
        <p>Revision {draft.revision || 0} · shared definitions contain no parameter values</p>
        <label>Description<textarea maxLength={2000} disabled={busy || saving} value={draft.description || ''} onChange={e => change({description:e.target.value})}/></label>
        <label>Usage example (use placeholders, never real personal data)<textarea maxLength={2000} disabled={busy || saving} value={draft.usage || ''} onChange={e => change({usage:e.target.value})}/></label>
        <label>Changes in this revision<textarea maxLength={2000} disabled={busy || saving} value={draft.changeNotes || ''} onChange={e => change({changeNotes:e.target.value})}/></label>
        <label>Oracle profile<select aria-label="Mini tool Oracle profile" value={profile?.id || ''} disabled={busy || saving} onChange={e => { setRunId(null); setValues({}); const selected = profiles.find(p => p.id === e.target.value); if (selected) onConnect(selected); }}><option value={profile?.id || ''}>{profile?.name || profile?.id || 'Choose a profile'}</option>{profiles.filter(p => p.id !== profile?.id).map(p => <option key={p.id} value={p.id}>{p.name || p.id} · {p.env}</option>)}</select></label>
        <p className="mini-tool-context">{connected ? 'Connected' : 'Not connected'} · {profile?.host} / {profile?.service} · {profile?.env}</p>
        <details><summary>SQL and view definition</summary>
          <label>SELECT SQL<textarea spellCheck="false" disabled={busy || saving} value={draft.sql} onChange={e => change({ sql: e.target.value })}/></label>
          <p>Classification is local. SELECT functions may have side effects; Oracle permissions still apply. Review SQL before running a shared tool.</p>
          <fieldset disabled={busy || saving}><legend>Visible result columns</legend>{draft.columns.map((column, index) => <label className="mini-tool-checkbox" key={index}><input type="checkbox" checked={column.visible} onChange={e => change({ columns: draft.columns.map((c, i) => i === index ? { ...c, visible: e.target.checked } : c) })}/>{column.name}</label>)}{currentResult && <button type="button" className="button-secondary" onClick={() => change({ columns: currentResult.columns.map((c, index) => ({ index, name: c.name, visible: draft.columns[index]?.name === c.name ? draft.columns[index].visible : true })) })}>Use latest result columns</button>}</fieldset>
        </details>
        <form onSubmit={run}><div className="mini-tool-fields">{fields.map(field => <div className="mini-tool-field" key={field.name}>
          <label>{field.label}{field.required ? ' *' : ''}<input autoComplete="off" required={field.required} disabled={busy || saving} value={values[field.name] || ''} placeholder={['DATE', 'TIMESTAMP'].includes(field.type) ? 'YYYY-MM-DDTHH:mm:ss' : field.type === 'NUMBER' ? 'Invariant decimal' : `:${field.name}`} onChange={e => setValues(current => ({ ...current, [field.name]: e.target.value }))}/></label>
          <details><summary>:{field.name} · field definition</summary><label>Label<input maxLength={100} disabled={busy || saving} value={field.label} onChange={e => updateField(field.name, { label: e.target.value })}/></label><label>Type<select value={field.type} disabled={busy || saving} onChange={e => updateField(field.name, { type: e.target.value })}>{bindTypes.map(type => <option key={type}>{type}</option>)}</select></label><label className="mini-tool-checkbox"><input type="checkbox" disabled={busy || saving} checked={field.required} onChange={e => updateField(field.name, { required: e.target.checked })}/>Required</label></details>
        </div>)}</div><div className="mini-tool-actions"><button className="button-primary" disabled={!connected || busy || saving}><Play size={13}/>Run</button>{busy && <button type="button" className="button-secondary" onClick={onCancelRun}>Cancel query</button>}<button type="button" className="button-secondary" disabled={busy || saving} onClick={save}><Save size={13}/>{saving ? 'Saving…' : 'Save tool'}</button></div></form>
        {runId&&(outcome?.requestId===runId?<ResultFailure outcome={outcome} onEdit={onClose}/>:<>{busy?<Feedback kind="progress" title="SQL mini tool">{status}</Feedback>:<p className="mini-tool-run-status" role="status">{status}</p>}</>)}
        {currentResult && <><div className="mini-tool-table"><table><thead><tr>{columnIndices.map(({ c, i }) => <th key={i}>{c.name}</th>)}</tr></thead><tbody>{currentResult.rows.map((row, index) => <tr key={index}>{columnIndices.map(({ i }) => <td key={i}>{row[i] == null ? 'NULL' : typeof row[i] === 'object' ? JSON.stringify(row[i]) : String(row[i])}</td>)}</tr>)}</tbody></table></div><p>{currentResult.rows.length} loaded rows{currentResult.hasMore ? ' · More available' : ''}{!columnIndices.length ? ' · All columns hidden' : ''}</p>{currentResult.hasMore && <button className="button-secondary" disabled={busy} onClick={onFetchMore}>Load more rows</button>}</>}
      </>}
      {error && <Feedback title="SQL mini tools">{error}</Feedback>}{notice && <Feedback kind="success" title="SQL mini tools">{notice}</Feedback>}
    </div></div>
    <footer className="appearance-footer"><span>SQL and view definitions only · parameter values stay in memory</span><button className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
