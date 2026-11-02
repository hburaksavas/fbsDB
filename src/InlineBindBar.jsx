import {choiceValues,inlineBindTypes,inputKind} from './inlineBinds';

// Editor UI only: the SQL text is never changed. Each distinct bind has one field, so repeated :names stay in sync.
export function InlineBindBar({names,entryFor,onChange,onFocusName,onPick}) {
  return <div className="inline-bind-bar" role="group" aria-label="Bind values">
    {names.map(name=>{
      const entry=entryFor(name)||{type:'VARCHAR2',value:'',isNull:false},kind=inputKind(name,entry.type),label=`Value of :${name}`;
      const common={'aria-label':label,'data-bind-input':name,disabled:entry.isNull,value:entry.value,onFocus:()=>onFocusName(name),onBlur:()=>onFocusName(null)};
      return <span key={name} className="inline-bind-field" data-bind-field={name}>
        <b>:{name}</b>
        <select aria-label={`Type of :${name}`} value={entry.type} onChange={event=>onChange(name,{type:event.target.value})} onFocus={()=>onFocusName(name)} onBlur={()=>onFocusName(null)}>{inlineBindTypes.map(type=><option key={type}>{type}</option>)}</select>
        {kind==='datetime'?<input {...common} type="datetime-local" onChange={event=>onChange(name,{value:event.target.value})}/>
          :kind==='choice'?<select {...common} onChange={event=>onChange(name,{value:event.target.value})}><option value="">Choose…</option>{choiceValues.map(value=><option key={value}>{value}</option>)}</select>
          :<input {...common} type="text" inputMode={kind==='number'?'decimal':undefined} placeholder="value" onChange={event=>onChange(name,{value:event.target.value})}/>}
        {onPick&&kind!=='datetime'&&<button type="button" className="inline-bind-pick" aria-label={`Pick a value for :${name}`} title="Search records with your own query" disabled={entry.isNull} onClick={()=>onPick(name)}>Pick…</button>}
        <label className="inline-bind-null"><input type="checkbox" aria-label={`Use NULL for :${name}`} checked={entry.isNull} onChange={event=>onChange(name,{isNull:event.target.checked})}/>NULL</label>
      </span>;
    })}
  </div>;
}
