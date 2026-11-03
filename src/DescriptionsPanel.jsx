import {useState} from 'react';
import {lookupColumnKey} from './lookupDescriptions';

// Shows a description beside key values (for example a customer name beside its id). The stored value is never replaced, and the
// descriptions are read only when you ask, with your own query over the keys that are loaded.
export function DescriptionsPanel({columns,queries,status,onSave,onLoad,onClear,onClose}) {
  const candidates=columns.map((column,index)=>({column,index,key:lookupColumnKey(column)})).filter(item=>item.key);
  const [choice,setChoice]=useState(candidates[0]?.index??0);
  const current=candidates.find(item=>item.index===Number(choice))||candidates[0];
  const [text,setText]=useState(()=>queries[current?.key]||'');
  if(!candidates.length)return null;
  return <section className="bulk-edit-panel" role="group" aria-label="Key descriptions">
    <header><strong>Descriptions beside key values</strong><button type="button" aria-label="Close descriptions" onClick={onClose}>×</button></header>
    <label>Column<select aria-label="Description column" value={current.index} onChange={event=>{setChoice(event.target.value);setText(queries[candidates.find(item=>item.index===Number(event.target.value)).key]||'')}}>{candidates.map(item=><option key={item.index} value={item.index}>{item.column.name}</option>)}</select></label>
    <textarea aria-label="Description query" rows={3} spellCheck={false} placeholder="SELECT id, name FROM customers WHERE id IN ({keys})" value={text} onChange={event=>setText(event.target.value)}/>
    <small className="grid-edit-note">{'{keys}'} stands for the distinct values loaded in this column (at most 50, sent as binds). The first returned column is the key, the rest is the description.</small>
    <footer><button type="button" className="button-primary" disabled={!text.trim()} onClick={()=>{onSave(current.key,text);onLoad(current.index,text)}}>Save and load</button><button type="button" onClick={()=>onClear(current.index,current.key)}>Remove</button></footer>
    {status&&<p role="status" aria-label="Description status">{status}</p>}
  </section>;
}
