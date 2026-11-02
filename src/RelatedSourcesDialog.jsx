import {useEffect,useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {relatedSourceCandidates} from './oracleSourceIdentity';
import {pathKey} from './workspaceTree';

export function RelatedSourcesDialog({root,rules,document,documents,onOpen,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [state,setState]=useState({busy:true,files:[],skipped:[],truncated:false});
  useEffect(()=>{
    setState({busy:true,files:[],skipped:[],truncated:false});
    let request;
    const unsubscribe=subscribeNativeMessages(message=>{
      if(message.requestId!==request)return;
      if(message.type==='workspace.sources'&&pathKey(message.sources.root)===pathKey(root))setState({...message.sources,busy:false});
      else if(message.type.endsWith('.error')||message.type==='error')setState({busy:false,files:[],skipped:[],error:message.message||'Source discovery failed.'});
    });
    request=sendNativeCommand('workspace.sources',{root});
    return unsubscribe;
  },[root]);
  const candidates=useMemo(()=>relatedSourceCandidates(document,documents,state.files,{root,rules}),[document,documents,state.files,root,rules]);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal related-sources-dialog" role="dialog" aria-modal="true" aria-label="Related sources and tests">
    <header className="appearance-header"><h2>Related sources and tests</h2></header>
    <p>Matching package declarations and configured test paths are listed in both directions. Several source candidates may share a test path; choose the intended file. Choose a file to open. Connection and schema context are checked separately before grouping tabs.</p>
    {state.busy?<p role="status">Reading workspace sources…</p>:state.error?<p role="alert">{state.error}</p>:<>
      {(state.truncated||state.skipped.length>0)&&<p role="status">Partial search: at most 300 files, 1 MB per file and 8 MB total. {state.skipped.length} files skipped. Unlisted files may also match.</p>}
      <div className="related-source-list">{candidates.map(candidate=><button className="button-secondary" key={candidate.path} onClick={()=>onOpen(candidate)}><strong>{candidate.path}</strong><small>{candidate.relation} · {candidate.declaration?.owner||(candidate.relation==='Test'?'Test path convention':'Unqualified schema')} · {candidate.connectionProfileId||'No saved connection'}{candidate.alreadyOpen?' · open editor':''}{candidate.dirty?' · unsaved':''}</small></button>)}</div>
      {!candidates.length&&<p>No related source or test found in the inspected sources.</p>}
      {state.skipped.length>0&&<details><summary>Skipped files</summary><ul>{state.skipped.map(text=><li key={text}>{text}</li>)}</ul></details>}
    </>}
    <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
