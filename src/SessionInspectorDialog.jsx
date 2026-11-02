import {useEffect,useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {isNativeHost,sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {sessionInspectorSections} from './sessionInspector';

// Read-only: it only issues the existing session.context and session.nls reads for the tab's own session.
export function SessionInspectorDialog({tabId,connection,epoch,initialContext,transactionPending,autoCommit,executing,result,rowsLoaded,generation,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [context,setContext]=useState(initialContext||null),[nls,setNls]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tick,setTick]=useState(0);
  const connected=Boolean(connection&&!['No connection','Disconnected'].includes(connection.id));
  useEffect(()=>{
    if(!isNativeHost||!connected)return;
    const requests=new Map();setBusy(true);setError('');
    const unsubscribe=subscribeNativeMessages(message=>{
      if(message.tabId!==tabId||!['session.context','session.nls'].includes(message.type)||requests.get(message.type)!==message.requestId)return;
      requests.delete(message.type);if(!requests.size)setBusy(false);
      if(message.error){setError(message.error);return}
      if(message.type==='session.context')setContext(message.context);else setNls(message.report);
    });
    for(const command of ['session.context','session.nls'])requests.set(command,sendNativeCommand(command,{tabId,epoch}));
    return unsubscribe;
  },[tabId,epoch,connected,tick]);
  const sections=useMemo(()=>sessionInspectorSections({connection,context,nls,transactionPending,autoCommit,executing,result,rowsLoaded,generation}),[connection,context,nls,transactionPending,autoCommit,executing,result,rowsLoaded,generation]);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal session-inspector" role="dialog" aria-modal="true" aria-label="Session inspector">
    <header className="appearance-header"><div><h2>Session inspector</h2><p>Read-only view of this tab's Oracle session. Values marked "Database" are read on request; nothing is changed.</p></div></header>
    <div className="session-inspector-body">{error&&<p role="alert">{error}</p>}{sections.map(section=><section key={section.id} aria-label={section.title}><h3>{section.title}</h3><table><tbody>{section.rows.map(([label,value,source])=><tr key={label}><th scope="row">{label}</th><td><code>{value}</code></td><td>{source}</td></tr>)}</tbody></table></section>)}</div>
    <footer className="appearance-footer"><button className="button-secondary" disabled={!connected||busy} onClick={()=>setTick(value=>value+1)}>{busy?'Reading…':'Refresh'}</button><button className="button-primary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
