import {useMemo,useState} from 'react';
import {bulkModes,planBulkEdit,previewText} from './bulkEdit';

// Bulk change of the selected cells. It shows exactly what would change and what is skipped; staging is a separate click and one undo step.
export function BulkEditPanel({cells,onStage,onClose}) {
  const [form,setForm]=useState({mode:'set',value:'',find:'',replacement:'',matchCase:false,amount:''});
  const mode=bulkModes.find(item=>item.id===form.mode);
  const plan=useMemo(()=>planBulkEdit(cells,form),[cells,form]);
  const preview=previewText(plan);
  const set=patch=>setForm(current=>({...current,...patch}));
  return <section className="bulk-edit-panel" role="group" aria-label="Bulk edit">
    <header><strong>Bulk edit of {cells.length} selected cell{cells.length===1?'':'s'}</strong><button type="button" aria-label="Close bulk edit" onClick={onClose}>×</button></header>
    <label>Operation<select aria-label="Bulk operation" value={form.mode} onChange={event=>set({mode:event.target.value})}>{bulkModes.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    {mode.needs==='value'&&<label>Value<input aria-label="Bulk value" placeholder={mode.hint} value={form.value} onChange={event=>set({value:event.target.value})}/></label>}
    {mode.needs==='find'&&<><label>Find<input aria-label="Bulk find" value={form.find} onChange={event=>set({find:event.target.value})}/></label><label>Replace with<input aria-label="Bulk replacement" value={form.replacement} onChange={event=>set({replacement:event.target.value})}/></label><label><input type="checkbox" aria-label="Match case" checked={form.matchCase} onChange={event=>set({matchCase:event.target.checked})}/>Match case</label></>}
    {mode.needs==='amount'&&<label>{form.mode==='percent'?'Percent':'Number'}<input aria-label="Bulk amount" inputMode="decimal" value={form.amount} onChange={event=>set({amount:event.target.value})}/></label>}
    {plan.error?<p role="alert">{plan.error}</p>:<div className="bulk-preview" role="status" aria-label="Bulk preview"><b>{preview.summary}</b><ul>{preview.lines.map(line=><li key={line}>{line}</li>)}</ul>{preview.more>0&&<small>…and {preview.more} more.</small>}{plan.skipped.length>0&&<details><summary>{plan.skipped.length} skipped</summary><ul>{plan.skipped.slice(0,10).map(item=><li key={`${item.rowIndex}:${item.col}`}>Row {item.rowIndex+1} {item.name}: {item.reason}</li>)}</ul></details>}</div>}
    <footer><button type="button" className="button-primary" disabled={Boolean(plan.error)||!plan.changes.length} onClick={()=>{onStage(plan.changes);onClose()}}>Stage {plan.changes.length} edit{plan.changes.length===1?'':'s'}</button><button type="button" onClick={onClose}>Cancel</button></footer>
  </section>;
}
