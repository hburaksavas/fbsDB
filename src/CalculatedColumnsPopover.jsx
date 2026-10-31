import {useFeedbackState,Feedback} from './Feedback';
import {useEffect,useState,useRef} from 'react';
import {extractJsonPath,deriveResultData} from './resultWorkbench';
import {X} from 'lucide-react';

export function CalculatedColumnsPopover({columns,definitions=[],onClose,onChange,triggerRef}){
 const [kind,setKind]=useState('expression'),[name,setName]=useState(''),[expression,setExpression]=useState(''),[source,setSource]=useState(0),[error,setError]=useFeedbackState('',{title:'Calculated column'});
 const popupRef=useRef(null);
 useEffect(()=>{
  const outside=event=>{if(!popupRef.current?.contains(event.target)&&!triggerRef.current?.contains(event.target))onClose()};
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();triggerRef.current?.focus()}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true)};
 },[onClose,triggerRef]);
 const add=event=>{event.preventDefault();try{if(kind==='json')extractJsonPath({},expression);const definition={name:name.trim(),expression:expression.trim(),kind,source};deriveResultData([],columns,[definition]);onChange([...definitions,definition]);setName('');setExpression('');setError('')}catch(e){setError(e.message)}};
 return <section ref={popupRef} className="calculated-columns-popover" role="dialog" aria-label="Calculated columns">
  <header><div><strong>Calculated columns</strong><span>Expressions are evaluated against loaded rows</span></div><button type="button" aria-label="Close calculated columns" onClick={onClose}><X size={14}/></button></header>
  <form onSubmit={add}>
   <div className="calculated-columns-form"><select aria-label="Calculated column type" value={kind} onChange={event=>setKind(event.target.value)}><option value="expression">Arithmetic expression</option><option value="json">JSONPath</option></select><input aria-label="Calculated column name" placeholder="Column name" value={name} onChange={event=>setName(event.target.value)}/><input aria-label="Calculated expression" placeholder={kind==='json'?'$.items[0].price':'SALARY * 12'} value={expression} onChange={event=>setExpression(event.target.value)}/>{kind==='json'&&<select className="calculated-source" aria-label="JSON source column" value={source} onChange={event=>setSource(Number(event.target.value))}>{columns.map((column,index)=><option key={index} value={index}>{column.name}</option>)}</select>}<button className="calculated-columns-add" disabled={!name.trim()||!expression.trim()}>Add column</button></div>
   {error&&<Feedback title="Calculated column">{error}</Feedback>}
  </form>
  <div className="calculated-columns-list">{definitions.map((definition,index)=><div className="calculated-columns-item" key={`${definition.name}-${index}`}><span><strong>{definition.name}</strong><small>{definition.kind==='json'?'JSONPath':'Expression'} · {definition.expression}</small></span><button type="button" aria-label={`Remove calculated column ${definition.name}`} onClick={()=>onChange(definitions.filter((_,i)=>i!==index))}>Remove</button></div>)}{!definitions.length&&<p>No calculated columns yet.</p>}</div>
 </section>;
}
