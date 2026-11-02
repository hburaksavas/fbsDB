import {useState} from 'react';
import {candidateKeyColumns,validateManualKey} from './gridEditability';

// Shown when the table has no primary key: nominate columns as the row identity. The check uses loaded rows only and says so.
export function KeyPicker({columns,rows,onUse}) {
  const [chosen,setChosen]=useState([]),[confirmed,setConfirmed]=useState(false);
  const candidates=candidateKeyColumns(columns),check=validateManualKey(columns,rows,chosen);
  return <fieldset className="key-picker" aria-label="Choose row identity">
    <legend>Choose the columns that identify a row</legend>
    <div className="key-picker-columns">{candidates.map(({column,index})=><label key={index}><input type="checkbox" aria-label={`Key column ${column.name}`} checked={chosen.includes(index)} onChange={event=>{setConfirmed(false);setChosen(current=>event.target.checked?[...current,index]:current.filter(item=>item!==index))}}/>{column.name}</label>)}</div>
    {chosen.length>0&&(check.error?<p role="alert">{check.error}</p>:<p role="status">{check.note}</p>)}
    <label className="key-picker-confirm"><input type="checkbox" aria-label="I know these columns identify one row" disabled={!check.ok} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I know these columns identify exactly one row in the table. Apply stops if a statement changes any other number of rows.</label>
    <button type="button" disabled={!check.ok||!confirmed} onClick={()=>onUse(chosen)}>Use these columns</button>
  </fieldset>;
}
