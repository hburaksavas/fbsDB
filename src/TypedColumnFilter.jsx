import {useMemo,useState} from 'react';
import {distinctColumnValues,typedFilterRule} from './typedFilters';
import {columnKind} from './resultColumnActions';

// Typed controls add rules to the existing loaded-row filter; a server rerun stays a separate explicit action.
export function TypedColumnFilter({column,index,rows,onApply}){
 const kind=columnKind(column),[from,setFrom]=useState(''),[to,setTo]=useState(''),[search,setSearch]=useState(''),[checked,setChecked]=useState(()=>new Set()),[includeNull,setIncludeNull]=useState(false),[error,setError]=useState('');
 const list=useMemo(()=>kind==='text'?distinctColumnValues(rows,index):null,[kind,rows,index]);
 const visible=list?.values.filter(item=>item.value.toLowerCase().includes(search.toLowerCase()))||[];
 const apply=()=>{const result=typedFilterRule(kind==='text'?'list':kind,index,{from,to,values:[...checked],includeNull});setError(result.error||'');if(result.rule)onApply(result.rule)};
 const toggle=value=>setChecked(current=>{const next=new Set(current);next.has(value)?next.delete(value):next.add(value);return next});
 const inputType=kind==='date'?'datetime-local':kind==='number'?'text':null;
 return <div className="typed-column-filter">
  <p className="typed-filter-scope">Filters the {rows.length.toLocaleString('en-US')} loaded rows. The server query is not rerun; use Server filter for that.</p>
  {kind==='text'?<>
   <input aria-label={`Search ${column.name} values`} placeholder="Search values" value={search} onChange={event=>setSearch(event.target.value)}/>
   <div className="typed-filter-values" role="group" aria-label={`${column.name} values`}>
    {list.nulls>0&&<label><input type="checkbox" checked={includeNull} onChange={event=>setIncludeNull(event.target.checked)}/><em>NULL</em><small>{list.nulls}</small></label>}
    {visible.map(item=><label key={item.value}><input type="checkbox" checked={checked.has(item.value)} onChange={()=>toggle(item.value)}/><span>{item.value}</span><small>{item.count}</small></label>)}
   </div>
   {list.truncated&&<p className="typed-filter-scope">Only the first 200 distinct loaded values are listed.</p>}
  </>:<div className="typed-filter-range">
   <label>{kind==='date'?'From':'Minimum'}<input aria-label={`${column.name} ${kind==='date'?'from':'minimum'}`} type={inputType} step={kind==='date'?1:undefined} inputMode={kind==='number'?'decimal':undefined} value={from} onChange={event=>setFrom(event.target.value)}/></label>
   <label>{kind==='date'?'To':'Maximum'}<input aria-label={`${column.name} ${kind==='date'?'to':'maximum'}`} type={inputType} step={kind==='date'?1:undefined} inputMode={kind==='number'?'decimal':undefined} value={to} onChange={event=>setTo(event.target.value)}/></label>
  </div>}
  {error&&<p role="alert" className="typed-filter-error">{error}</p>}
  <button type="button" className="result-popover-add" onClick={apply}>Apply {kind==='text'?'value list':'range'}</button>
 </div>;
}
