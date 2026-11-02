import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {bindTypes} from './bindDefinitions';
import {trialRowLimit} from './subqueryTrial';

// Explicit trial run of a selected subquery with temporary binds; the rows stay in this window and never reach the result grid.
export function SubqueryTrialDialog({plan,state,onRun,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [values,setValues]=useState({}),[confirmed,setConfirmed]=useState(false);
  const risky=plan.calls.length>0,busy=state?.running;
  const set=(name,patch)=>setValues(current=>({...current,[name]:{type:'VARCHAR2',value:'',...current[name],...patch}}));
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal quick-eval-dialog subquery-trial-dialog" role="dialog" aria-modal="true" aria-label="Subquery trial">
   <header className="appearance-header"><div><h2>Try subquery</h2><p>Runs the selected SELECT once in this tab's session, only when you press Run trial. At most {trialRowLimit} rows are shown here.</p></div></header>
   <pre className="quick-eval-expression" aria-label="Subquery">{plan.sql}</pre>
   {plan.binds.map(name=><label key={name} className="quick-eval-bind">:{name}<select aria-label={`Type of :${name}`} value={values[name]?.type||'VARCHAR2'} onChange={event=>set(name,{type:event.target.value})}>{bindTypes.filter(type=>type!=='CLOB').map(type=><option key={type}>{type}</option>)}</select><input aria-label={`Value of :${name}`} value={values[name]?.value||''} onChange={event=>set(name,{value:event.target.value})}/></label>)}
   {risky&&<div className="quick-eval-warning" role="alert"><p>The subquery calls {plan.calls.join(', ')}. Oracle cannot tell whether these have side effects: they run in your current session and transaction and may change data.</p><label><input type="checkbox" aria-label="Confirm the call may have side effects" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I understand and want to run it</label></div>}
   {state?.error&&<p role="alert" className="quick-eval-error">{state.error}</p>}
   {state?.rows&&<div className="trial-table" role="region" aria-label="Trial result"><table><thead><tr>{(state.columns||[]).map(column=><th key={column.name}>{column.name}</th>)}</tr></thead><tbody>{state.rows.map((row,index)=><tr key={index}>{row.map((cell,at)=><td key={at}>{cell==null?'NULL':String(cell)}</td>)}</tr>)}</tbody></table><small>{state.rows.length} row{state.rows.length===1?'':'s'}{state.truncated?` (limited to ${trialRowLimit})`:''} · {state.elapsedMs} ms{state.transactionPending?' · transaction pending':''}</small></div>}
   <footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Close</button><button type="button" className="button-primary" disabled={busy||(risky&&!confirmed)} onClick={()=>onRun(values)}>{busy?'Running…':'Run trial'}</button></footer>
  </section></ModalBackdrop>;
}
