import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';

export function QuickFixDialog({request,onApply,onClose}){
  const ref=useRef(null),[chosen,setChosen]=useState(0),[error,setError]=useState('');useDialogFocus(ref,onClose);
  const fixes=request.fixes,fix=fixes[chosen];
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal quick-fix-dialog" role="dialog" aria-modal="true" aria-label="Quick fixes">
    <header className="appearance-header"><h2>Quick fixes</h2></header><div className="mini-tool-content">
      <p>Compiler diagnostics from this exact editor version. Review the proposed text; applying does not compile or run SQL.</p>
      {fixes.length?<><div role="radiogroup" aria-label="Available quick fixes">{fixes.map((item,index)=><label key={item.id}><input type="radio" checked={chosen===index} onChange={()=>setChosen(index)}/>{item.label}</label>)}</div><p>{fix.detail}</p><pre>{fix.edits.map(edit=>edit.text).join('\n')}</pre></>:<p role="status">No supported quick fix at the caret. Compile the source and select a diagnostic line first.</p>}
      {error&&<p role="alert">{error}</p>}
    </div><footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button-primary" disabled={!fix} onClick={()=>{try{onApply(fix)}catch(failure){setError(failure.message)}}}>Apply fix</button></footer>
  </section></ModalBackdrop>;
}
