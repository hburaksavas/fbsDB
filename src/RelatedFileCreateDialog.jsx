import {useEffect,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {sendNativeCommand,subscribeNativeMessages} from './nativeBridge';

// Previews the proposed path and text; creating a file only writes a draft inside the workspace and never executes it.
export function RelatedFileCreateDialog({name,proposals,error,onCreated,onOpenExisting,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [selectedId,setSelectedId]=useState(proposals[0]?.id),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
  const requestRef=useRef(null),selected=proposals.find(item=>item.id===selectedId)||proposals[0];
  useEffect(()=>subscribeNativeMessages(message=>{
    if(!requestRef.current||message.requestId!==requestRef.current)return;
    if(message.type==='workspace.changed'&&message.entry){requestRef.current=null;setBusy(false);onCreated(message.entry,selected)}
    else if(message.error||message.type==='error'||message.type?.endsWith('.error')){requestRef.current=null;setBusy(false);setFailure(message.error||message.message||'The file could not be created.')}
  }),[selected]);
  const create=()=>{setFailure('');setBusy(true);requestRef.current=sendNativeCommand('workspace.createFile',{relativePath:selected.path,content:selected.content})};
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal related-file-create" role="dialog" aria-modal="true" aria-label="Create related file">
   <header className="appearance-header"><div><h2>Create related file{name?` for ${name}`:''}</h2><p>Paths follow your Project rules. The file is written inside the workspace as a draft; nothing is executed.</p></div></header>
   <div className="related-file-body">
    {error?<p role="alert">{error}</p>:<>
     <div className="related-file-choices" role="radiogroup" aria-label="File to create">{proposals.map(item=><label key={item.id}><input type="radio" name="related-file" checked={item.id===selected?.id} onChange={()=>setSelectedId(item.id)}/><b>{item.label}</b><code>{item.path}</code>{item.exists&&<small>already exists</small>}</label>)}</div>
     {selected&&<><h3>Preview</h3><pre aria-label="File preview">{selected.content}</pre></>}
     {failure&&<p role="alert">{failure}</p>}
    </>}
   </div>
   <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Cancel</button>{selected?.exists?<button className="button-primary" onClick={()=>onOpenExisting(selected)}>Open existing file</button>:<button className="button-primary" disabled={!selected||busy||Boolean(error)} onClick={create}>{busy?'Creating…':'Create and open'}</button>}</footer>
  </section></ModalBackdrop>;
}
