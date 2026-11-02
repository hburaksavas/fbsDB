import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {bindTypes} from './bindDefinitions';

// Explicit one-off evaluation: nothing runs until Evaluate is pressed, and calls that may have side effects need a second confirmation.
export function QuickEvalDialog({plan,state,onEvaluate,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [values,setValues]=useState({}),[confirmed,setConfirmed]=useState(false);
  const risky=plan.calls.length>0,busy=state?.running;
  const set=(name,patch)=>setValues(current=>({...current,[name]:{type:'VARCHAR2',value:'',...current[name],...patch}}));
  const cell=state?.rows?.[0]?.[0];
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal quick-eval-dialog" role="dialog" aria-modal="true" aria-label="Evaluate expression">
   <header className="appearance-header"><div><h2>Evaluate expression</h2><p>Runs <code>SELECT (expression) FROM dual</code> in this tab's session, only when you press Evaluate.</p></div></header>
   <pre className="quick-eval-expression" aria-label="Expression">{plan.expression}</pre>
   {plan.binds.map(name=><label key={name} className="quick-eval-bind">:{name}<select aria-label={`Type of :${name}`} value={values[name]?.type||'VARCHAR2'} onChange={event=>set(name,{type:event.target.value})}>{bindTypes.filter(type=>type!=='CLOB').map(type=><option key={type}>{type}</option>)}</select><input aria-label={`Value of :${name}`} value={values[name]?.value||''} onChange={event=>set(name,{value:event.target.value})}/></label>)}
   {risky&&<div className="quick-eval-warning" role="alert"><p>This expression calls {plan.calls.map(name=><code key={name}>{name}</code>).reduce((all,part,index)=>index?[...all,', ',part]:[part],[])}. Oracle cannot tell whether these have side effects: they run in your current session and transaction and may change data.</p><label><input type="checkbox" aria-label="Confirm the call may have side effects" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I understand and want to run it</label></div>}
   {state?.error&&<p role="alert" className="quick-eval-error">{state.error}</p>}
   {state?.rows&&<div className="quick-eval-result" role="status" aria-label="Evaluation result"><b>{state.columns?.[0]?.name||'RESULT'}</b><output>{cell==null?'NULL':String(cell)}</output><small>{state.elapsedMs} ms{state.transactionPending?' · transaction pending':''}</small></div>}
   <footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Close</button><button type="button" className="button-primary" disabled={busy||(risky&&!confirmed)} onClick={()=>onEvaluate(values)}>{busy?'Evaluating…':'Evaluate'}</button></footer>
  </section></ModalBackdrop>;
}
