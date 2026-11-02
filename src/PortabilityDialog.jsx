import {useEffect,useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {projectRuleFindings,scanProfiles,scanSourceFile,summarizeFindings} from './portabilityCheck';
import {pathKey} from './workspaceTree';

const labels = {'machine-path':'Machine-specific path','workspace-absolute-path':'Absolute path inside the workspace','tns-dependency':'TNS dependency','local-tool':'Local tool'};

// An explicit, read-only scan of the first 300 source files (1 MB each, 8 MB total); nothing is changed or executed.
export function PortabilityDialog({root,rules,profiles,onOpenFile,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [state,setState]=useState({busy:true,files:[],skipped:[],truncated:false,error:''});
  useEffect(()=>{
    let request;
    const unsubscribe=subscribeNativeMessages(message=>{
      if(message.requestId!==request)return;
      if(message.type==='workspace.sources'&&pathKey(message.sources.root)===pathKey(root))setState({...message.sources,busy:false,error:''});
      else if(message.type.endsWith('.error')||message.type==='error')setState({busy:false,files:[],skipped:[],truncated:false,error:message.message||'The workspace scan failed.'});
    });
    request=sendNativeCommand('workspace.sources',{root});
    return unsubscribe;
  },[root]);
  const summary=useMemo(()=>{
    if(state.busy)return null;
    const referenced=new Set(state.files.map(file=>file.connectionProfileId).filter(Boolean));
    for(const id of rules?.project?.connectionIds||[])referenced.add(id);
    if(rules?.project?.defaultConnectionId)referenced.add(rules.project.defaultConnectionId);
    return summarizeFindings([...projectRuleFindings(rules,root),...scanProfiles(profiles,referenced,root),...state.files.flatMap(file=>scanSourceFile(file,root))]);
  },[state,rules,profiles,root]);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal portability-dialog" role="dialog" aria-modal="true" aria-label="Workspace portability check">
   <header className="appearance-header"><div><h2>Workspace portability</h2><p>Finds what would not work on another computer. Read-only: files are not changed and no SQL runs.</p></div></header>
   <div className="portability-body">
    {state.busy&&<p role="status">Scanning workspace sources…</p>}
    {state.error&&<p role="alert">{state.error}</p>}
    {summary&&<>
     <p role="status">{summary.total?`${summary.total} finding${summary.total===1?'':'s'}: ${Object.entries(summary.counts).map(([kind,count])=>`${count} ${labels[kind].toLowerCase()}`).join(', ')}.`:'No machine-specific paths, TNS dependencies or local tools were found.'}</p>
     {(state.truncated||state.skipped.length>0)&&<p role="status">Partial scan: at most 300 files, 1 MB per file and 8 MB total. {state.skipped.length} files were skipped, so other findings may exist.</p>}
     <ul className="portability-list">{summary.findings.map((finding,index)=><li key={index} data-kind={finding.kind}><b>{labels[finding.kind]}</b><code>{finding.detail}</code><small>{finding.line?`${finding.file}:${finding.line}`:finding.file}</small><span>{finding.advice}</span>{finding.line>0&&onOpenFile&&<button type="button" className="button-secondary" onClick={()=>onOpenFile(finding)}>Open</button>}</li>)}</ul>
     {summary.truncated&&<p role="status">Showing the first {summary.findings.length} of {summary.total} findings.</p>}
    </>}
   </div>
   <footer className="appearance-footer"><button className="button-primary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}
