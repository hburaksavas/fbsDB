import {useState} from 'react';

export function FileStructurePanel({items=[],name,onNavigate}) {
  const [query,setQuery]=useState(''),[kind,setKind]=useState('All');
  const terms=query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const kinds=['All','PROCEDURE','FUNCTION','CURSOR','TYPE','SUBTYPE'];
  const visible=items.filter(item=>(kind==='All'||item.kind===kind)&&terms.every(term=>`${item.name} ${item.kind}`.toLocaleLowerCase().includes(term)));
  return <section className="file-structure-panel" aria-label="File structure">
    <strong title={name}>{name||'Current SQL file'}</strong>
    <input aria-label="Filter file structure" placeholder="Filter symbols…" value={query} onChange={event=>setQuery(event.target.value)}/>
    <select aria-label="File structure symbol kind" value={kind} onChange={event=>setKind(event.target.value)}>{kinds.map(value=><option key={value}>{value}</option>)}</select>
    <div className="file-structure-symbols">{visible.map((item,index)=><button key={`${item.start}:${item.kind}:${index}`} type="button" style={{paddingLeft:8+Math.min(item.depth,6)*10}} onClick={()=>onNavigate(item.start)} title={`${item.kind} · ${item.name}`}><small>{item.kind}</small><span>{item.name}</span></button>)}{!visible.length&&<p role="status">No symbols match the current file and filters.</p>}</div>
  </section>;
}
