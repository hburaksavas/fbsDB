import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {macroActions} from './editorMacros.js';

export function EditorMacrosDialog({recording,macros,onStart,onSave,onCancel,onRun,onDelete,onClose}){
  const ref=useRef(null),[name,setName]=useState(''),[error,setError]=useState('');useDialogFocus(ref,onClose);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal local-rename-dialog" role="dialog" aria-modal="true" aria-label="Editor macros">
    <header className="appearance-header"><h2>Editor macros</h2></header><div className="dialog-content"><p>Record Move up, Move down and Toggle line comment from the editor menu. SQL execution, files, connections and external actions are excluded. Macros last for this app session.</p>
      {recording?<><p role="status">Recording · {recording.length} action{recording.length===1?'':'s'}</p><ol>{recording.map((step,index)=><li key={index}>{macroActions[step]}</li>)}</ol><label>Macro name<input aria-label="Macro name" value={name} onChange={event=>setName(event.target.value)}/></label><button type="button" className="button-primary" onClick={()=>{try{onSave(name);setError('')}catch(failure){setError(failure.message)}}}>Save recording</button><button type="button" className="button-secondary" onClick={onCancel}>Discard recording</button></>:<button type="button" className="button-primary" onClick={onStart}>Start recording</button>}
      <p>Ctrl+Alt+Shift+M replays the most recently saved macro at the current caret.</p>
      <ul className="local-rename-preview">{macros.map(macro=><li key={macro.id}><b>{macro.name}</b> · {macro.steps.length} actions <button type="button" className="button-secondary" onClick={()=>{try{onRun(macro)}catch(failure){setError(failure.message)}}}>Replay {macro.name}</button> <button type="button" className="button-secondary" onClick={()=>onDelete(macro.id)}>Delete</button></li>)}</ul>
      {!macros.length&&<p>No saved macros this session.</p>}{error&&<p role="alert">{error}</p>}
    </div><footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
