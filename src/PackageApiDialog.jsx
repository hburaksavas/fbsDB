import {useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {packageApi} from './packageApi.js';
export function PackageApiDialog({document,rules,onNavigate,onClose}){
 const ref=useRef(null);useDialogFocus(ref,onClose);
 const [query,setQuery]=useState(''),api=useMemo(()=>packageApi(document,rules),[document,rules]);
 const entries=api.entries.filter(e=>`${e.name} ${e.kind} ${e.signature} ${e.documentation}`.toLowerCase().includes(query.toLowerCase()));
 return <ModalBackdrop onClose={onClose}><section className="appearance-modal package-api-dialog" ref={ref} role="dialog" aria-modal="true" aria-label="Package public API"><header className="appearance-header"><h2>{api.name||'Package'} · Public API</h2></header><p>{api.origin}. Declarations from the specification; opening this view does not compile or execute SQL.</p><label>Find a signature or type<input aria-label="Filter public API" value={query} onChange={e=>setQuery(e.target.value)}/></label>{api.error?<p role="alert">{api.error}</p>:<div className="package-api-entries">{entries.map(entry=><article key={entry.id}><h3><button onClick={()=>onNavigate(entry.start)} aria-label={`Go to ${entry.kind.toLowerCase()} ${entry.name}`}>{entry.kind} {entry.name}</button></h3><pre>{entry.signature}</pre><p className="package-api-doc">{entry.documentation||'No declaration documentation available.'}</p>{entry.parameters.length>0&&<dl>{entry.parameters.map(parameter=><div key={parameter.position}><dt>{parameter.name}</dt><dd>{parameter.mode} · {parameter.type}{parameter.optional?' · default declared (see signature)':''}</dd></div>)}</dl>}{entry.returnType&&<p>Returns {entry.returnType}</p>}</article>)}{!entries.length&&<p>No matching public declarations.</p>}</div>}<footer className="appearance-footer"><button onClick={onClose}>Close</button></footer></section></ModalBackdrop>;
}
