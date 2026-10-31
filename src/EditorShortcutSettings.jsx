import {useFeedbackState,Feedback} from './Feedback';
import { useState } from 'react';
import { editorShortcutActions,defaultEditorShortcuts,shortcutFromEvent,shortcutProblem } from './editorShortcuts.js';
export function EditorShortcutSettings({value,onChange,disabled,...props}) {
  const [error,setError]=useFeedbackState('',{title:'Shortcut unavailable'}),[query,setQuery]=useState('');
  const change=(id,key)=>{const problem=shortcutProblem(value,id,key);setError(problem);if(!problem)onChange({...value,[id]:key})};
  return <section {...props} className="editor-shortcuts-panel">
    <input aria-label="Search shortcuts" placeholder="Search shortcuts" value={query} onChange={e=>setQuery(e.target.value)}/>
    <small>Focus a shortcut and press the new key combination.</small>
    {error&&<Feedback title="Shortcut unavailable">{error}</Feedback>}
    <div className="editor-shortcut-list">{editorShortcutActions.filter(a=>`${a.label} ${value[a.id]}`.toLowerCase().includes(query.toLowerCase())).map(action=><div className="editor-shortcut-row" key={action.id}>
      <label htmlFor={`shortcut-${action.id}`}>{action.label}</label>
      <input id={`shortcut-${action.id}`} aria-label={`${action.label} shortcut`} title={action.id==='format'?'Ctrl+Shift+F is always available.':undefined} readOnly disabled={disabled} value={value[action.id]||(action.id==='format'?'Ctrl+Shift+F (fixed)':'Unassigned')} onFocus={()=>setError('')} onKeyDown={e=>{
        if(e.key==='Tab'&&!e.ctrlKey&&!e.altKey&&!e.metaKey)return;
        e.preventDefault();e.stopPropagation();
        if(e.key==='Escape'){e.currentTarget.blur();return}
        const key=shortcutFromEvent(e);if(key!==undefined)change(action.id,key);
      }}/>
      <button type="button" aria-label={`Reset ${action.label} shortcut`} disabled={disabled||value[action.id]===defaultEditorShortcuts[action.id]} onClick={()=>change(action.id,defaultEditorShortcuts[action.id])}>Reset</button>
      <button type="button" aria-label={`Clear ${action.label} shortcut`} disabled={disabled||!value[action.id]} onClick={()=>change(action.id,'')}>Clear</button>
    </div>)}</div>
  </section>;
}
