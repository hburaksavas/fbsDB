import {useRef,useState} from 'react';
import {X} from 'lucide-react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {isNativeHost,sendNativeCommand} from './nativeBridge';

export function WorkspaceOpenPopup({workspace,onClose}) {
  const ref=useRef(null),[query,setQuery]=useState('');useDialogFocus(ref,onClose);
  const items=(workspace.catalog||[]).filter(item=>`${item.name} ${item.path}`.toLowerCase().includes(query.toLowerCase()));
  return <ModalBackdrop onClose={onClose} onMouseDown={event=>event.target===event.currentTarget&&onClose()}><section ref={ref} className="appearance-modal workspace-open-popup" role="dialog" aria-modal="true" aria-label="Open workspace">
    <header><strong>Open workspace</strong><button className="icon-button" aria-label="Close workspace popup" onClick={onClose}><X size={15}/></button></header>
    <input aria-label="Find workspace" placeholder="Find workspace…" value={query} onChange={event=>setQuery(event.target.value)}/>
    <div className="workspace-open-list">{items.map(item=><button key={item.id} disabled={!item.available||item.active} title={item.path} onClick={()=>{sendNativeCommand('workspace.openRecent',{path:item.path});onClose()}}><span>{item.pinned?'★ ':''}{item.name}<small>{item.active?'Active':!item.available?'Unavailable':''}</small></span><small>{item.path}</small></button>)}{!items.length&&<span className="workset-empty">{query?'No matching workspaces':'No saved workspaces'}</span>}</div>
    <button className="workspace-browse" disabled={!isNativeHost} onClick={()=>{onClose();sendNativeCommand('workspace.open')}}>Browse folder…</button>
  </section></ModalBackdrop>;
}
