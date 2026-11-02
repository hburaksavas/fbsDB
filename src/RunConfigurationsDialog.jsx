import {useEffect,useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {normalizeRunConfiguration,runConfigurationSql,runConfigurationParameters} from './runConfigurations';
import {pathKey} from './workspaceTree';

export function RunConfigurationsDialog({root,tabId,signatures=[],signatureErrors=[],profileId,autoCommit,connected,busy,status,output,onRun,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [catalog,setCatalog]=useState([]),[draft,setDraft]=useState(signatures[0]||null),[values,setValues]=useState({}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[ran,setRan]=useState(false);
  const requests=useRef(new Map());
  function command(name,payload={}){const request=sendNativeCommand(name,{root,tabId,...payload});requests.current.set(request,name)}
  useEffect(()=>{
    const unsubscribe=subscribeNativeMessages(message=>{
      const operation=requests.current.get(message.requestId);if(!operation)return;requests.current.delete(message.requestId);
      if(message.type.endsWith('.error')){setError(message.message);setSaving(false);return;}
      if(pathKey(message.root)!==pathKey(root))return;
      if(message.type==='workspace.runs.list'){setCatalog(message.catalog.configurations);if(message.catalog.errors.length)setError(message.catalog.errors.join('\n'));}
      if(message.type==='workspace.runs.saved'){const saved=normalizeRunConfiguration(message.configuration);setDraft(saved);setCatalog(current=>[...current.filter(item=>item.id!==saved.id),saved]);setSaving(false);setNotice('Call and parameter definitions saved without values or connection details.');}
    });
    if(root)command('workspace.runs.list');
    return unsubscribe;
  },[root,tabId]);
  useEffect(()=>{setValues({});setRan(false)},[profileId]);
  const sql=useMemo(()=>{try{return draft?runConfigurationSql(draft):''}catch{return ''}},[draft]);
  const choose=configuration=>{setDraft(normalizeRunConfiguration(configuration));setValues({});setRan(false);setError('');setNotice('')};
  const changeParameter=(index,patch)=>setDraft(current=>({...current,parameters:current.parameters.map((parameter,at)=>at===index?{...parameter,...patch}:parameter)}));
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal run-configurations-dialog" role="dialog" aria-modal="true" aria-label="Run configurations">
    <header className="appearance-header"><h2>Run configurations</h2></header>
    <p>Profile: {profileId||'Disconnected'} · {autoCommit?'Auto commit on':'Manual commit'}. Opening and saving never runs SQL. Calls use the routine stored in Oracle; source compilation is separate. Called routines may change data or commit internally.</p>
    <div className="run-configuration-choices"><label>Saved calls<select aria-label="Saved calls" disabled={busy||saving} value={draft?.id||''} onChange={event=>{const item=catalog.find(item=>item.id===event.target.value);if(item)choose(item)}}><option value="">Choose a saved call</option>{catalog.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {signatures.length>0&&<label>Source signature<select aria-label="Source call signature" disabled={busy||saving} defaultValue="" onChange={event=>{if(event.target.value!=='')choose({...signatures[Number(event.target.value)],id:'',revision:0});event.target.value=''}}><option value="">Generate a call…</option>{signatures.map((item,index)=><option key={index} value={index}>{item.routineName}({item.parameters.map(parameter=>`${parameter.name} ${parameter.mode} ${parameter.oracleType}`).join(', ')})</option>)}</select></label>}</div>
    {signatureErrors.length>0&&<details><summary>Unavailable source signatures</summary>{signatureErrors.map((text,index)=><p key={index}>{text}</p>)}</details>}
    {!draft?<p>Choose a saved call or open a complete package specification to generate one.</p>:<form onSubmit={event=>{event.preventDefault();if(!busy&&!saving&&connected&&sql){setRan(true);onRun(sql,runConfigurationParameters(draft,values),draft)}}}>
      <label>Configuration name<input aria-label="Run configuration name" maxLength={100} disabled={busy||saving} value={draft.name} onChange={event=>setDraft(current=>({...current,name:event.target.value}))}/></label>
      <pre className="run-configuration-sql">{sql||'Enter a valid configuration name.'}</pre>
      <div className="run-configuration-fields">{draft.parameters.map((parameter,index)=><div key={index}><label>{parameter.name} · {parameter.mode} · {parameter.oracleType}{parameter.mode!=='OUT'&&(parameter.bindType==='CLOB'?<textarea aria-label={`Value ${parameter.name}`} autoComplete="off" rows={3} disabled={busy||saving||parameter.useDefault} value={values[`arg_${index}`]||''} onChange={event=>setValues(current=>({...current,[`arg_${index}`]:event.target.value}))}/>:<input aria-label={`Value ${parameter.name}`} autoComplete="off" type={parameter.sensitive?'password':'text'} placeholder={parameter.bindType==='NUMBER'?'Invariant decimal (.)':parameter.bindType==='DATE'?'YYYY-MM-DDTHH:mm:ss':parameter.bindType==='TIMESTAMP'?'YYYY-MM-DDTHH:mm:ss.fffffffff':''} disabled={busy||saving||parameter.useDefault} value={values[`arg_${index}`]||''} onChange={event=>setValues(current=>({...current,[`arg_${index}`]:event.target.value}))}/>)}</label>
        {parameter.optional&&parameter.mode==='IN'&&<label><input type="checkbox" disabled={busy||saving} checked={parameter.useDefault} onChange={event=>changeParameter(index,{useDefault:event.target.checked})}/>Omit argument and use the server default</label>}
        {parameter.mode!=='OUT'&&<label><input type="checkbox" disabled={busy||saving} checked={parameter.sensitive} onChange={event=>changeParameter(index,{sensitive:event.target.checked})}/>Sensitive input</label>}
      </div>)}</div>
      <div className="run-configuration-actions"><button className="button-primary" disabled={!connected||busy||saving||!sql}>Run call</button><button type="button" disabled={!root||busy||saving||!sql} onClick={()=>{setError('');setSaving(true);command('workspace.runs.save',{configuration:normalizeRunConfiguration(draft)})}}>Save call definition</button></div>
    </form>}
    {ran&&<><p role="status">{status}</p><pre className="run-configuration-output">{output}</pre></>}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
