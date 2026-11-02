import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {lookupRowLimit,pickedValue,prepareLookup} from './bindLookup';

// Searchable record picker for one bind. The query is yours and runs only when you press Search; picking fills the first column.
export function BindLookupDialog({name,initialSql,state,onSearch,onPick,onSaveSql,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [sql,setSql]=useState(initialSql||''),[search,setSearch]=useState(''),[problem,setProblem]=useState('');
  const run=()=>{const plan=prepareLookup(sql);if(plan.error){setProblem(plan.error);return}setProblem('');onSaveSql(sql);onSearch(plan,search)};
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal quick-eval-dialog subquery-trial-dialog" role="dialog" aria-modal="true" aria-label="Pick a value">
   <header className="appearance-header"><div><h2>Pick a value for :{name}</h2><p>Write a SELECT whose first column is the value. It runs only when you press Search, with at most {lookupRowLimit} rows; <code>:search</code> receives the text below.</p></div></header>
   <textarea className="quick-eval-expression" aria-label="Picker query" rows={3} spellCheck={false} value={sql} onChange={event=>setSql(event.target.value)} placeholder="SELECT id, name FROM customers WHERE UPPER(name) LIKE UPPER(:search) || '%'"/>
   <label className="quick-eval-bind">Search<input aria-label="Picker search text" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();run()}}}/></label>
   {(problem||state?.error)&&<p role="alert" className="quick-eval-error">{problem||state.error}</p>}
   {state?.rows&&<div className="trial-table" role="region" aria-label="Picker results"><table><thead><tr>{(state.columns||[]).map(column=><th key={column.name}>{column.name}</th>)}</tr></thead><tbody>{state.rows.map((row,index)=><tr key={index}><td colSpan={Math.max(1,row.length)} className="picker-row"><button type="button" className="picker-choice" disabled={pickedValue(row)==null} onClick={()=>onPick(pickedValue(row))}>{row.map(cell=>cell==null?'NULL':String(cell)).join(' · ')}</button></td></tr>)}</tbody></table><small>{state.rows.length} row{state.rows.length===1?'':'s'}{state.truncated?` (limited to ${lookupRowLimit})`:''}</small></div>}
   <footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Close</button><button type="button" className="button-primary" disabled={state?.running} onClick={run}>{state?.running?'Searching…':'Search'}</button></footer>
  </section></ModalBackdrop>;
}
