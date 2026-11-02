import {useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {planExtractProcedure} from './extractProcedure.js';

export function ExtractProcedureDialog({request,onApply,onClose}){
  const ref=useRef(null),[name,setName]=useState('extracted_step'),[error,setError]=useState('');useDialogFocus(ref,onClose);
  const plan=useMemo(()=>planExtractProcedure(request.source,request.start,request.end,name),[request,name]);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal local-rename-dialog" role="dialog" aria-modal="true" aria-label="Extract Procedure">
    <header className="appearance-header"><h2>Extract Procedure</h2></header><div className="mini-tool-content"><label>Procedure name<input autoFocus aria-label="Extracted procedure name" value={name} onChange={event=>{setName(event.target.value);setError('')}}/></label>
      <p>Supported selection: complete, adjacent simple assignments in a top-level DECLARE block. Review inferred parameter modes and every edit.</p>
      {plan.error?<p role="alert">{plan.error}</p>:<><p role="status">{plan.parameters.map(item=>`${item.name} ${item.mode} ${item.type}`).join(' · ')||'No parameters'}</p><ul className="local-rename-preview">{plan.edits.map(edit=><li key={edit.label}><b>{edit.label}</b><pre>{edit.after}</pre></li>)}</ul><p>{plan.scope}</p></>}
      {error&&<p role="alert">{error}</p>}
    </div><footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button-primary" disabled={!!plan.error} onClick={()=>{try{onApply(plan)}catch(failure){setError(failure.message)}}}>Extract procedure</button></footer>
  </section></ModalBackdrop>;
}
