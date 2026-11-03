import {useEffect,useRef} from 'react';

// One record as attribute / value pairs. Moving to the previous or next record keeps the field you were in, so a column can be filled down a list.
export function VerticalRecordPanel({fields,rowNumber,total,onStage,onMove,onClose}) {
  const root=useRef(null),focusName=useRef(null);
  useEffect(()=>{
    if(!focusName.current)return;
    const input=root.current?.querySelector(`[data-field="${focusName.current}"]:not(:disabled)`);
    input?.focus();input?.select?.();
  },[rowNumber]);
  return <section ref={root} className="bulk-edit-panel vertical-record" role="group" aria-label="Record editor" onKeyDown={event=>{
    if(event.altKey&&event.key==='PageDown'){event.preventDefault();onMove(1)}
    else if(event.altKey&&event.key==='PageUp'){event.preventDefault();onMove(-1)}
    else if(event.key==='Escape'){event.stopPropagation();onClose()}
  }}>
    <header><strong>Record {rowNumber} of {total}</strong><span><button type="button" aria-label="Previous record" disabled={rowNumber<=1} title="Alt+PageUp" onClick={()=>onMove(-1)}>↑</button><button type="button" aria-label="Next record" disabled={rowNumber>=total} title="Alt+PageDown" onClick={()=>onMove(1)}>↓</button><button type="button" aria-label="Close record editor" onClick={onClose}>×</button></span></header>
    <dl className="vertical-fields">{fields.map(field=><div key={field.col} data-locked={!field.editable||undefined}>
      <dt title={field.reason||undefined}>{field.name}{field.key?' 🔑':''}{field.editable?'':' 🔒'}</dt>
      <dd>{field.editable
        ?<><input data-field={field.col} aria-label={`Record ${field.name}`} disabled={field.isNull} placeholder={field.isNull?'NULL':''} defaultValue={field.isNull?'':field.text??''} key={`${rowNumber}:${field.col}:${field.text}:${field.isNull}`} data-edited={field.edited||undefined} onFocus={()=>{focusName.current=String(field.col)}} onBlur={event=>{if(event.currentTarget.value!==(field.text??''))onStage(field.col,{value:event.currentTarget.value})}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();onMove(1)}}}/>
          <label className="new-row-null"><input type="checkbox" aria-label={`Record ${field.name} NULL`} checked={field.isNull} onChange={event=>onStage(field.col,event.target.checked?{isNull:true}:{value:''})}/>NULL</label></>
        :<span className="vertical-readonly">{field.text==null?'NULL':String(field.text)}</span>}</dd>
    </div>)}</dl>
  </section>;
}
