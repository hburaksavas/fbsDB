import {useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {planLocalRename} from './localRename.js';

export function LocalRenameDialog({request,onApply,onClose}){
  const ref=useRef(null),[name,setName]=useState(''),[error,setError]=useState('');
  useDialogFocus(ref,onClose);
  const plan=useMemo(()=>planLocalRename(request.source,request.cursor,name,request.options),[request,name]);
  const lines=useMemo(()=>plan.edits?.map(edit=>request.source.slice(0,edit.start).split(/\r\n|\r|\n/).length)||[],[plan,request]);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal local-rename-dialog" role="dialog" aria-modal="true" aria-label="Rename local symbol">
    <header className="appearance-header"><h2>Rename local variable or parameter</h2></header>
    <div className="dialog-content"><label>New name<input autoFocus aria-label="New local name" value={name} onChange={event=>{setName(event.target.value);setError('')}}/></label>
      <p>Current document and resolved local scope only. Dynamic SQL and server references are excluded. Review every occurrence before applying.</p>
      {plan.error?<p role="alert">{plan.error}</p>:<><p role="status">{plan.edits.length} occurrence{plan.edits.length===1?'':'s'} · {plan.original} → {plan.newName}</p><ul className="local-rename-preview">{plan.edits.map((edit,index)=><li key={edit.start}>Line {lines[index]}{edit.declaration?' · declaration':''}: <code>{edit.before}</code> → <code>{edit.after}</code></li>)}</ul></>}
      {error&&<p role="alert">{error}</p>}
    </div><footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button-primary" disabled={!!plan.error} onClick={()=>{try{onApply(plan)}catch(failure){setError(failure.message)}}}>Apply rename</button></footer>
  </section></ModalBackdrop>;
}
