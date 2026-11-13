import {Feedback} from './Feedback';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Settings2, X } from 'lucide-react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';
import { getOracleBindNames } from './oracleBinds';
import { bindLabel, getBindColumns } from './bindColumns';
import { bindTypes,defaultAllowed,projectBindDefinitions,saveBindDefinitions } from './bindDefinitions';

const valuePlaceholder=type=>type==='DATE'?'YYYY-MM-DDTHH:mm:ss':type==='TIMESTAMP'?'YYYY-MM-DDTHH:mm:ss.fff':type==='NUMBER'?'1234.56':'';

export function BindParameterDialog({sql,file,onCancel,onExecute,onSaveDefinitions,projectVariables=[],prefill={},onPrefillUsed}) {
  const names=getOracleBindNames(sql),ref=useRef(null);useDialogFocus(ref,onCancel);
  // "p1 - ACCOUNT_ID": the bind as written plus the column it stands for, when one can be named.
  const columns=useMemo(()=>getBindColumns(sql),[sql]);
  const nameOf=name=>columns[name]?bindLabel(columns[name]):name;
  const [definitions,setDefinitions]=useState(()=>projectBindDefinitions(localStorage,file,names,projectVariables).map(item=>prefill[item.name]?{...item,type:prefill[item.name].type}:item));
  const [values,setValues]=useState(()=>Object.fromEntries(projectBindDefinitions(localStorage,file,names,projectVariables).filter(item=>item.defaultValue).map(item=>[item.name,item.defaultValue]).concat(Object.values(prefill).filter(item=>names.includes(item.name)).map(item=>[item.name,item.value])))),[notice,setNotice]=useState('');
  const [expanded,setExpanded]=useState(()=>new Set());
  useEffect(()=>{onPrefillUsed?.()},[]);
  const change=(name,patch)=>setDefinitions(current=>current.map(item=>item.name===name?{...item,...patch}:item));
  const toggle=name=>setExpanded(current=>{const next=new Set(current);if(!next.delete(name))next.add(name);return next});
  const submit=event=>{event.preventDefault();onExecute(definitions.map(item=>({name:item.name,type:item.type,value:values[item.name]===''?null:values[item.name]??null})))};
  const save=()=>{try{saveBindDefinitions(localStorage,file,definitions);onSaveDefinitions?.(definitions);setNotice('Bind form saved. Execution values are not saved.')}catch{setNotice('Could not save the bind form.')}};
  return <ModalBackdrop onClose={onCancel}><form ref={ref} role="dialog" aria-modal="true" aria-label="SQL bind parameters" className={`appearance-modal bind-modal${names.length===1?' bind-modal-single':''}`} onSubmit={submit}>
    <header className="appearance-header"><div><h2>Enter query values</h2><p>Only form definitions can be saved. Values stay in this execution.</p></div><button type="button" className="icon-button" aria-label="Close bind parameters" onClick={onCancel}><X size={16}/></button></header>
    <div className="bind-fields">{definitions.map(item=>{
      const name=nameOf(item.name),open=expanded.has(item.name);
      return <div className="bind-definition" key={item.name}>
        <div className="bind-row">
          <div className="bind-label"><label htmlFor={`bind-value-${item.name}`}><span title={item.label?`${item.label} (${name})`:name}>{item.label||name}{item.label&&<small> {name}</small>}{item.required?' *':''}</span></label><button type="button" className="icon-button" aria-label={`Form definition of ${name}`} title="Form definition" aria-expanded={open} onClick={()=>toggle(item.name)}><Settings2 size={11}/></button></div>
          <div className="bind-input"><input id={`bind-value-${item.name}`} autoFocus={item.name===names[0]} autoComplete="off" placeholder={valuePlaceholder(item.type)} required={item.required} value={values[item.name]||''} onChange={event=>setValues(current=>({...current,[item.name]:event.target.value}))}/><select aria-label={`Type of ${name}`} title="Value type" value={item.type} onChange={event=>change(item.name,{type:event.target.value})}>{bindTypes.map(type=><option key={type}>{type}</option>)}</select></div>
          {item.description&&<small>{item.description}</small>}
        </div>
        {open&&<div className="bind-form-definition">
          <label><input type="checkbox" checked={item.required} onChange={event=>change(item.name,{required:event.target.checked})}/>Required value</label>
          <label>Label<input value={item.label} maxLength={100} onChange={event=>change(item.name,{label:event.target.value})}/></label>
          <label>Description<input value={item.description} maxLength={1000} onChange={event=>change(item.name,{description:event.target.value})}/></label>
          {defaultAllowed(item.name,item.type,'x')&&<label>Default value (saved with the form)<input value={item.defaultValue} maxLength={1000} onChange={event=>change(item.name,{defaultValue:event.target.value})}/></label>}
        </div>}
      </div>})}</div>
    <footer className="appearance-footer"><Feedback kind={notice.startsWith("Could not")?"error":"success"} title="Bind form">{notice}</Feedback>{file&&<button type="button" className="button-secondary" onClick={save}>Save bind form</button>}<button type="button" className="button-secondary" onClick={onCancel}>Cancel</button><button className="button-primary"><Play size={13}/>Run statement</button></footer>
  </form></ModalBackdrop>;
}
