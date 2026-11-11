import {useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {planChangeSignature} from './changeSignature.js';
import {parsePlsql} from './plsqlStructure.js';

export function ChangeSignatureDialog({request,onApply,onClose}){
  const ref=useRef(null),[operation,setOperation]=useState('rename'),[index,setIndex]=useState(0),[name,setName]=useState(''),[type,setType]=useState('NUMBER'),[order,setOrder]=useState(''),[error,setError]=useState('');
  useDialogFocus(ref,onClose);
  const routine=useMemo(()=>parsePlsql(request.source).scopes.flatMap(scope=>scope.routines).find(item=>item.start<=request.cursor&&request.cursor<=item.start+item.name.length||item.parameters.some(parameter=>parameter.start<=request.cursor&&request.cursor<=parameter.start+parameter.name.length)),[request]);
  const change={operation,index,name,type,order:order.split(',').map(value=>Number(value.trim())-1)};
  const plan=useMemo(()=>planChangeSignature(request.source,request.cursor,change),[request,operation,index,name,type,order]);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal local-rename-dialog" role="dialog" aria-modal="true" aria-label="Change Signature">
    <header className="appearance-header"><h2>Change Signature</h2></header><div className="dialog-content">
      <p>Preview direct calls to one local procedure in this document. Other files, dynamic SQL, qualified calls and overloads need manual review.</p>
      <label>Change<select aria-label="Signature change" value={operation} onChange={event=>{setOperation(event.target.value);setError('')}}><option value="rename">Rename parameter</option><option value="reorder">Reorder parameters</option><option value="add">Add optional IN parameter</option></select></label>
      {operation==='rename'&&<><label>Parameter<select aria-label="Parameter" value={index} onChange={event=>setIndex(Number(event.target.value))}>{routine?.parameters.map((parameter,at)=><option key={parameter.start} value={at}>{parameter.name}</option>)}</select></label><label>New name<input aria-label="New parameter name" value={name} onChange={event=>setName(event.target.value)}/></label></>}
      {operation==='reorder'&&<label>Order (positions separated by commas)<input aria-label="Parameter order" placeholder={routine?.parameters.map((_,at)=>at+1).reverse().join(', ')} value={order} onChange={event=>setOrder(event.target.value)}/></label>}
      {operation==='add'&&<><label>New name<input aria-label="Added parameter name" value={name} onChange={event=>setName(event.target.value)}/></label><label>Oracle type<input aria-label="Added parameter type" value={type} onChange={event=>setType(event.target.value)}/></label></>}
      {plan.error?<p role="alert">{plan.error}</p>:<><p role="status">{plan.detail} · {plan.callCount} direct call{plan.callCount===1?'':'s'} · {plan.edits.length} edit{plan.edits.length===1?'':'s'}</p><ul className="local-rename-preview">{plan.edits.map(edit=><li key={`${edit.start}:${edit.end}`}>Line {request.source.slice(0,edit.start).split(/\r\n|\r|\n/).length} · {edit.label}: <code>{edit.before}</code> → <code>{edit.after}</code></li>)}</ul><p>{plan.scope}</p></>}
      {error&&<p role="alert">{error}</p>}
    </div><footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button-primary" disabled={!!plan.error} onClick={()=>{try{onApply(plan)}catch(failure){setError(failure.message)}}}>Apply change</button></footer>
  </section></ModalBackdrop>;
}
