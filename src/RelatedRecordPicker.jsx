import {useEffect,useRef,useState} from 'react';
import {pickerCellText,pickerQuery,pickerRowLimit} from './relatedPicker';

// Chooses a foreign key value from the rows of its parent table. It only reads, in this tab's session, and choosing stages an ordinary draft.
export function RelatedRecordPicker({target,columnNames,onQuery,onPick,onClose}) {
  const [search,setSearch]=useState(''),[state,setState]=useState({running:true}),latest=useRef(0),input=useRef(null);
  const run=async text=>{
    const ticket=++latest.current;
    setState(current=>({...current,running:true,error:undefined}));
    const query=pickerQuery(target,text,state.columns||[]);
    const reply=await onQuery(query.sql,query.parameters);
    if(ticket!==latest.current)return;
    setState(reply.error?{error:reply.error,columns:state.columns,rows:[]}:{columns:reply.columns||[],rows:reply.rows||[],truncated:Boolean(reply.truncated)});
  };
  useEffect(()=>{run('');input.current?.focus()},[]);
  const parent=`${target.owner?`${target.owner}.`:''}${target.table}`;
  return <section className="bulk-edit-panel related-record-picker" role="group" aria-label="Related record" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}}>
    <header><strong>Choose {columnNames.join(', ')} from {parent}</strong><button type="button" aria-label="Close related record" onClick={onClose}>×</button></header>
    <label>Search<input ref={input} aria-label="Search related records" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();run(search)}}}/></label>
    <button type="button" disabled={state.running} onClick={()=>run(search)}>Search</button>
    {state.running&&<span role="status">Reading {parent}…</span>}
    {state.error&&<p role="alert">{state.error}</p>}
    {!state.running&&!state.error&&!state.rows?.length&&<span role="status">No rows found.</span>}
    {state.rows?.length>0&&<div className="related-record-rows"><table><thead><tr><th/>{state.columns.map(column=><th key={column.name}>{column.name}</th>)}</tr></thead><tbody>{state.rows.map((row,at)=><tr key={at}><td><button type="button" aria-label={`Use row ${at+1}`} onClick={()=>onPick(state.columns,row)}>Use</button></td>{row.map((cell,col)=><td key={col}>{pickerCellText(cell)}</td>)}</tr>)}</tbody></table></div>}
    <small className="grid-edit-note">{state.truncated?`Showing the first ${pickerRowLimit} rows; search to narrow them. `:''}Choosing stages a draft; nothing reaches Oracle until you apply. A foreign key constraint stays the authority.</small>
  </section>;
}
