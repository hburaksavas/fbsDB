import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {databaseSourceChanged,sourceBaselineMatches} from './sourceCompilation';
const DiffEditor=lazy(()=>import('@monaco-editor/react').then(module=>({default:module.DiffEditor})));

export function SourceCompileDialog({document,prepared,tabId,profileId,theme,valid,transactionPending,onBaseline,onCompile,onClose,confirmLabel="Compile reviewed source",reviewContext}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [state,setState]=useState({busy:true}),[confirmed,setConfirmed]=useState(false);
  useEffect(()=>{
    let request;
    const unsubscribe=subscribeNativeMessages(message=>{
      if(message.requestId!==request)return;
      if(message.type==='source.review'&&message.review.sql===prepared.sql){setState({busy:false,review:message.review});onBaseline(message.review.snapshot)}
      else if(message.type.endsWith('.error'))setState({busy:false,error:message.message||'Source comparison failed.'});
    });
    request=sendNativeCommand('source.review',{tabId,sql:prepared.sql});
    return unsubscribe;
  },[tabId,prepared.sql]);
  const review=state.review,snapshot=review?.snapshot;
  const baseline=snapshot?[document.sourceBaseline,...Object.values(document.sourceBaselines||{})].find(item=>sourceBaselineMatches(item,snapshot)):document.sourceBaseline;
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal source-compile-dialog" role="dialog" aria-modal="true" aria-label="Review and compile source">
    <header className="appearance-header"><h2>Review and compile source</h2></header>
    {reviewContext&&<p role="status">{reviewContext}</p>}
    <p>{profileId} · {snapshot?`${snapshot.owner}.${snapshot.name} · ${snapshot.type} · ${snapshot.context}`:document.name}</p>
    <p>Oracle DDL commits automatically and cannot be undone with Rollback. Compilation is blocked while this session has pending changes.</p>
    {!valid&&<p role="alert">The editor or connection changed. Close this review and compare again.</p>}
    {transactionPending&&<p role="alert">Commit or roll back pending session work before compiling.</p>}
    {state.busy?<p role="status">Reading the current database source…</p>:state.error?<p role="alert">{state.error}</p>:<>
      {databaseSourceChanged(baseline,snapshot)&&<p className="source-compile-conflict" role="alert">The database source changed since this file's previous comparison. Review the server changes before publishing.</p>}
      {!sourceBaselineMatches(baseline,snapshot)&&<p>No earlier database baseline is recorded for this object and context. Compare the current server source below.</p>}
      {!snapshot.exists&&<p role="status">No object of this type exists in the current schema. This will create it.</p>}
      <div className="source-compare-labels"><span>Current database source</span><span>Source to compile</span></div>
      <div className="source-compare-editor"><Suspense fallback={<p>Loading source comparison…</p>}><DiffEditor original={snapshot.source} modified={prepared.sql} language="sql" theme={theme} options={{readOnly:true,originalEditable:false,automaticLayout:true,minimap:{enabled:false},renderSideBySide:true,scrollBeyondLastLine:false}}/></Suspense></div>
      <p>The server version is checked again immediately before compilation. Other sessions can still change the object after that check; Oracle DDL has no conditional source-version replacement here.</p>
      <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I reviewed the current server source and the code to compile.</label>
    </>}
    <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={!review||!confirmed||!valid||transactionPending} onClick={()=>onCompile(review)}>{confirmLabel}</button></footer>
  </section></ModalBackdrop>;
}
