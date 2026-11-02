import {useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {identifierCaseStyles,projectIdentifierStyles,planIdentifierCase} from './identifierCase.js';

// Edits apply only to the captured model version; references outside the selection are not renamed.
export function IdentifierCaseDialog({request,onApply,onClose}){
 const ref=useRef(null);useDialogFocus(ref,onClose);
 const [style,setStyle]=useState('snake'),[includeQuoted,setIncludeQuoted]=useState(false),[error,setError]=useState('');
 const plan=useMemo(()=>planIdentifierCase(request.source,request.range,style,{includeQuoted,dictionary:request.dictionary}),[request,style,includeQuoted]);
 const apply=()=>{try{onApply(plan)}catch(failure){setError(failure.message)}};
 return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal identifier-case-dialog" role="dialog" aria-modal="true" aria-labelledby="identifier-case-title">
  <header className="appearance-header"><h2 id="identifier-case-title">Convert identifier case</h2></header>
  <div className="mini-tool-content">
   <fieldset className="identifier-case-styles"><legend>Style</legend>{[...identifierCaseStyles,...(request.dictionary?.terms?.length?projectIdentifierStyles:[])].map(item=><label key={item.id}><input type="radio" name="identifier-case-style" checked={style===item.id} onChange={()=>setStyle(item.id)}/>{item.label}</label>)}</fieldset>
   <label><input type="checkbox" checked={includeQuoted} onChange={event=>setIncludeQuoted(event.target.checked)}/>Include quoted identifiers (case-sensitive; changes their identity)</label>
   <p>Only the selection changes. String literals, comments, bind variables and keywords are kept. Unquoted names are folded to upper case by Oracle, so word changes such as order_id → orderId refer to a different object. Other references, files and database objects are not updated.</p>
   {plan.error?<p role="alert">{plan.error}</p>:<>
    <p role="status">{plan.edits.length} occurrence{plan.edits.length===1?'':'s'} · {plan.identityChanges?`${plan.identityChanges} change Oracle identity`:'case-only, Oracle identity unchanged'}</p>
    {plan.renames.length>0&&<table className="identifier-case-preview" aria-label="Identifier changes"><thead><tr><th>Before</th><th>After</th><th>Uses</th><th>Oracle identity</th></tr></thead><tbody>{plan.renames.map(item=><tr key={`${item.quoted}:${item.before}`} data-identity={item.identityChanged?'changed':'same'}><td><code>{item.quoted?`"${item.before}"`:item.before}</code></td><td><code>{item.quoted?`"${item.after}"`:item.after}</code></td><td>{item.count}</td><td>{item.identityChanged?'Changed — semantic rename':'Same'}</td></tr>)}</tbody></table>}
    {plan.inspections?.length>0&&<details><summary>{plan.inspections.length} known alternative spelling{plan.inspections.length===1?'':'s'}</summary><ul>{plan.inspections.slice(0,200).map(item=><li key={item.start}><code>{item.value}</code> uses {item.aliases.join(', ')}. Choose a project style to preview the preferred spelling.</li>)}</ul></details>}
    {plan.skipped.length>0&&<details><summary>{plan.skipped.length} skipped</summary><ul>{plan.skipped.slice(0,200).map(item=><li key={item.start}><code>{item.value}</code> — {item.reason}</li>)}</ul></details>}
   </>}
   {error&&<p role="alert">{error}</p>}
  </div>
  <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={!!plan.error||!plan.edits.length} onClick={apply}>{plan.identityChanges?'Apply renames':'Apply'}</button></footer>
 </section></ModalBackdrop>;
}
