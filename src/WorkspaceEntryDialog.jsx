import {useFeedbackState,Feedback} from './Feedback';
import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronRight,Folder,X} from 'lucide-react';
import {sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {pathKey} from './workspaceTree';
export const workspaceParent=path=>path.replace(/[\\/][^\\/]+$/,'');
export const workspaceJoin=(root,name)=>root.replace(/[\\/]$/,'')+(root.includes('\\')?'\\':'/')+name;
export const workspaceContains=(path,root)=>!!root&&(pathKey(path)===pathKey(root)||pathKey(path).startsWith(pathKey(root)+'/'));

function DestinationTree({root,sources,onSelect,selected}) {
  const [children,setChildren]=useState({}),[expanded,setExpanded]=useState({[root]:true}),[error,setError]=useFeedbackState('',{title:'Workspace operation failed'});
  const pending=useRef(new Map());
  const load=path=>pending.current.set(sendNativeCommand('workspace.children',{path,root}),path);
  useEffect(()=>{load(root);return()=>pending.current.clear()},[root]);
  useEffect(()=>subscribeNativeMessages(message=>{
    const path=pending.current.get(message.requestId);if(!path)return;pending.current.delete(message.requestId);
    if(message.type==='workspace.children'&&pathKey(message.root)===pathKey(root))setChildren(c=>({...c,[path]:message.entries.filter(e=>e.isDirectory)}));
    else if(message.type==='workspace.error')setError(message.message);
  }),[root]);
  function render(path,name,depth=0){const disabled=sources.some(source=>source.isDirectory&&workspaceContains(path,source.path));return <div key={path}><div className="workspace-destination-row" style={{paddingLeft:depth*14}}><button type="button" disabled={disabled} aria-label={`Expand destination ${name}`} aria-expanded={!!expanded[path]} onClick={()=>{setExpanded(c=>({...c,[path]:!c[path]}));if(!children[path])load(path)}}>{expanded[path]?<ChevronDown size={12}/>:<ChevronRight size={12}/>}</button><button type="button" disabled={disabled} aria-pressed={pathKey(selected)===pathKey(path)} onClick={()=>onSelect(path)}><Folder size={13}/>{name}</button></div>{expanded[path]&&children[path]?.map(e=>render(e.path,e.name,depth+1))}</div>}
  return <div className="workspace-destinations" aria-label="Destination folders">{render(root,'Workspace root')}{error&&<Feedback title="Destination folders">{error}</Feedback>}</div>;
}

export function WorkspaceEntryDialog({operation,root,onClose,onSubmit,busy,error}) {
  const mode=operation.mode,entry=operation.entry,entries=operation.entries||[entry].filter(Boolean),summary=entries.length>1?`${entries.length} selected items`:entry?.name;
  const [name,setName]=useState(mode==='duplicate'?entry.name.replace(/\.sql$/i,' copy.sql'):['rename','move'].includes(mode)?entry.name:'');
  const [destination,setDestination]=useState(root);
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const title={file:'New SQL file',folder:'New folder',rename:'Rename',move:'Move to folder',duplicate:'Duplicate SQL file',recycle:'Move to Recycle Bin'}[mode];
  return <ModalBackdrop onClose={()=>!busy&&onClose()}><section ref={ref} className="appearance-modal workspace-entry-dialog" role="dialog" aria-modal="true" aria-label={title}>
    <header className="appearance-header"><h2>{title}</h2><button className="icon-button" aria-label="Close file operation" disabled={busy} onClick={onClose}><X size={16}/></button></header>
    <form onSubmit={event=>{event.preventDefault();onSubmit({name,destination})}}>
      {mode==='recycle'?<><p>Move <strong>{summary}</strong>{entry.isDirectory?' and all its contents':''} to the Windows Recycle Bin?</p><p>Close SQL tabs inside this item first. Files can be restored from the Recycle Bin.</p></>:mode==='move'?<><p>Select the destination folder for <strong>{summary}</strong>.</p><DestinationTree root={root} sources={entries} selected={destination} onSelect={setDestination}/><p className="workspace-path">{entries.length>1?destination:workspaceJoin(destination,entry.name)}</p></>:<label>Name<input aria-label="Name" required disabled={busy} value={name} placeholder={mode==='file'?'query.sql':mode==='folder'?'queries':''} onChange={e=>setName(e.target.value)}/></label>}
      {entries.length>1&&<ul className="workspace-operation-items">{entries.map(item=><li key={item.path}>{item.relativePath||item.name}</li>)}</ul>}
      {mode==='duplicate'&&<p>Copies the saved SQL file on disk. Unsaved editor changes are not included.</p>}
      <p className="workspace-operation-path">{entry?.relativePath||operation.parent}</p>{error&&<Feedback title="Workspace operation failed">{error}</Feedback>}
      <footer className="appearance-footer"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy||(!['move','recycle'].includes(mode)&&!name.trim())||(mode==='move'&&entries.some(item=>pathKey(destination)===pathKey(workspaceParent(item.path))||item.isDirectory&&workspaceContains(destination,item.path)))}>{busy?'Working…':title}</button></footer>
    </form></section></ModalBackdrop>;
}
