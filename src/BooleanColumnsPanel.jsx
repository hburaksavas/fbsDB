import {booleanColumnKey,booleanPresets} from './booleanColumns';

// Shows Y/N or 1/0 columns as checkboxes while editing. The stored value stays exactly what the mapping says; a value outside it stays visible as text.
export function BooleanColumnsPanel({columns,editable,mapping,onChange,onClose}) {
  const candidates=columns.map((column,index)=>({column,index,key:booleanColumnKey(column)})).filter(item=>item.key&&editable[item.index]?.editable&&/CHAR|NUMBER|INT/i.test(item.column.type||''));
  return <section className="bulk-edit-panel" role="group" aria-label="Checkbox columns">
    <header><strong>Columns shown as checkboxes</strong><button type="button" aria-label="Close checkbox columns" onClick={onClose}>×</button></header>
    {!candidates.length&&<p>No editable text or number columns.</p>}
    {candidates.map(({column,key})=><label key={key}>{column.name}<select aria-label={`Checkbox mapping for ${column.name}`} value={mapping[key]||'none'} onChange={event=>onChange(key,event.target.value)}>{booleanPresets.map(preset=><option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>)}
    <small>A checkbox writes the mapped value only; NULL is the third (indeterminate) state and a click turns it on.</small>
  </section>;
}

export function BooleanCell({preset,state,value,name,onToggle}) {
  return <span className="boolean-cell">
    <input type="checkbox" aria-label={`Toggle ${name}`} checked={state==='on'} ref={element=>{if(element)element.indeterminate=state==='null'}} onChange={onToggle}/>
    {state==='other'&&<em title={`Outside the mapping ${preset.on} / ${preset.off}`}>{String(value)}</em>}
  </span>;
}
